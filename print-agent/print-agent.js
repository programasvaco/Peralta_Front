/**
 * Abarrotes María — Print Agent v2.0.0
 *
 * Cliente WebSocket saliente: se conecta a Laravel Reverb, se suscribe al
 * canal privado de su sucursal y, al recibir un ticket ESC/POS, lo envía a
 * la impresora (nombre Windows, COM o red TCP). Ya no expone ningún puerto
 * ni servidor local — la conexión siempre la inicia esta PC hacia el
 * servidor, así que no hay problema de mixed content ni de puertos abiertos.
 *
 * Uso:
 *   print-agent.exe              → arranca el agente
 *   print-agent.exe install      → instala como servicio de Windows
 *   print-agent.exe uninstall    → elimina el servicio de Windows
 *
 * Configuración → print-agent.config.json en la misma carpeta que el .exe
 * (ver print-agent.config.example.json). El token y el almacenId se generan
 * una sola vez en el backend con: php artisan print-agent:token {almacen_id}
 *
 * Formatos de printerTarget:
 *   PRINTER:Nombre Impresora     → spooler de Windows (recomendado para USB)
 *   192.168.1.100:9100           → red TCP rawport
 *   COM3                         → puerto serie
 */

'use strict';

// ── Handlers globales: evitan que el proceso muera por errores no capturados ──
process.on('uncaughtException', (err) => {
  console.error('[ERROR NO CAPTURADO]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[PROMESA RECHAZADA]', reason);
});

const fs                = require('fs');
const net               = require('net');
const os                = require('os');
const path              = require('path');
const https             = require('https');
const httpModule        = require('http');
const { spawnSync, execSync } = require('child_process');
const Pusher             = require('pusher-js/node');

const VERSION  = '2.0.0';
const SVC_NAME = 'AbarrotesPrintAgent';

// ── Configuración ─────────────────────────────────────────────────────────────

const exeDir     = path.dirname(process.execPath);
const configFile = path.join(exeDir, 'print-agent.config.json');

const config = {
  printerTarget: 'PRINTER:Nombre de la impresora',
  apiBaseUrl:    'https://api.comercializadora-guevara.com',
  reverbHost:    'api.comercializadora-guevara.com',
  reverbPort:    443,
  reverbScheme:  'https',
  reverbAppKey:  '',
  almacenId:     null,
  token:         '',
};

try {
  if (fs.existsSync(configFile)) {
    Object.assign(config, JSON.parse(fs.readFileSync(configFile, 'utf8')));
    console.log(`Config cargada: ${configFile}`);
  } else {
    console.warn(`No existe ${configFile}. Copie print-agent.config.example.json y complete sus datos.`);
  }
} catch (e) {
  console.warn(`No se pudo leer ${configFile}: ${e.message}`);
}

// ── Comandos de servicio Windows ──────────────────────────────────────────────

const cmd = process.argv[2];

if (cmd === 'install') {
  const exe = process.execPath;
  try {
    // Eliminar tarea previa si existe
    try { execSync(`schtasks /end /tn "${SVC_NAME}"`,          { stdio: 'pipe' }); } catch {}
    try { execSync(`schtasks /delete /tn "${SVC_NAME}" /f`,    { stdio: 'pipe' }); } catch {}

    // Crear tarea que arranca con el sistema, ejecuta como SYSTEM sin necesitar sesión de usuario
    execSync(
      `schtasks /create /tn "${SVC_NAME}" /tr "\\"${exe}\\"" /sc onstart /ru SYSTEM /rl HIGHEST /f`,
      { stdio: 'pipe' }
    );

    // Arrancar inmediatamente sin reiniciar
    execSync(`schtasks /run /tn "${SVC_NAME}"`, { stdio: 'pipe' });
    console.log('Agente instalado como tarea programada y arrancado correctamente.');
    console.log('Arrancará automáticamente con Windows (sin necesitar iniciar sesión).');
  } catch (e) {
    const detail = e.stderr ? e.stderr.toString('utf8').trim() : e.message;
    console.error('Error al instalar:', detail);
    console.error('');
    console.error('>>> Ejecute este comando como Administrador <<<');
    process.exit(1);
  }
  process.exit(0);
}

if (cmd === 'uninstall') {
  try {
    try { execSync(`schtasks /end /tn "${SVC_NAME}"`,        { stdio: 'pipe' }); } catch {}
    execSync(`schtasks /delete /tn "${SVC_NAME}" /f`,        { stdio: 'pipe' });
    console.log('Tarea eliminada correctamente.');
  } catch (e) {
    const detail = e.stderr ? e.stderr.toString('utf8').trim() : e.message;
    console.error('Error al eliminar la tarea:', detail);
    process.exit(1);
  }
  process.exit(0);
}

// print-agent.exe printers  → lista impresoras Windows visibles (diagnóstico local)
if (cmd === 'printers') {
  listPrinters().forEach((name) => console.log(name));
  process.exit(0);
}

// print-agent.exe test  → imprime un ticket de prueba en printerTarget (diagnóstico local)
if (cmd === 'test') {
  printBytes(buildTestTicket())
    .then(() => { console.log('Ticket de prueba enviado.'); process.exit(0); })
    .catch((e) => { console.error('Error:', e.message); process.exit(1); });
}

// ── Impresión vía spooler Windows ─────────────────────────────────────────────
//
// \\.\USB001 NO es una ruta de dispositivo válida para puertos USB del spooler.
// El método correcto es llamar a winspool.drv por nombre de impresora.

function printViaSpooler(bytes, printerName) {
  return new Promise((resolve, reject) => {
    let tmpBin = null;
    let tmpPs1 = null;

    try {
      const ts    = Date.now();
      tmpBin      = path.join(os.tmpdir(), `ticket_${ts}.bin`);
      tmpPs1      = path.join(os.tmpdir(), `rawprint_${ts}.ps1`);

      // Rutas con barras dobles para PowerShell dentro de string simple
      const psBin  = tmpBin.replace(/\\/g, '\\\\');
      const psName = printerName.replace(/\\/g, '\\\\').replace(/'/g, "''");

      // Script PowerShell con P/Invoke a winspool.drv
      // Nota: el here-string @'...'@ requiere que '@ esté al inicio de línea.
      const ps = '$ErrorActionPreference = \'Stop\'\r\n' +
        '$binPath = \'' + psBin + '\'\r\n' +
        '$bytes = [System.IO.File]::ReadAllBytes($binPath)\r\n' +
        'Add-Type -TypeDefinition @\'\r\n' +
        'using System;\r\n' +
        'using System.Runtime.InteropServices;\r\n' +
        '[StructLayout(LayoutKind.Sequential)]\r\n' +
        'public class DOCINFOA {\r\n' +
        '    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;\r\n' +
        '    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;\r\n' +
        '    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;\r\n' +
        '}\r\n' +
        'public static class RawPrint {\r\n' +
        '    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true)]\r\n' +
        '    public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);\r\n' +
        '    [DllImport("winspool.Drv", EntryPoint="ClosePrinter")]\r\n' +
        '    public static extern bool ClosePrinter(IntPtr h);\r\n' +
        '    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true)]\r\n' +
        '    public static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFOA di);\r\n' +
        '    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter")]\r\n' +
        '    public static extern bool EndDocPrinter(IntPtr h);\r\n' +
        '    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter")]\r\n' +
        '    public static extern bool StartPagePrinter(IntPtr h);\r\n' +
        '    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter")]\r\n' +
        '    public static extern bool EndPagePrinter(IntPtr h);\r\n' +
        '    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]\r\n' +
        '    public static extern bool WritePrinter(IntPtr h, IntPtr p, int c, out int w);\r\n' +
        '}\r\n' +
        '\'@\r\n' +
        '$name = \'' + psName + '\'\r\n' +
        '$h = [IntPtr]::Zero\r\n' +
        'if (-not [RawPrint]::OpenPrinter($name, [ref]$h, [IntPtr]::Zero)) {\r\n' +
        '    throw ("No se pudo abrir la impresora: " + $name)\r\n' +
        '}\r\n' +
        'try {\r\n' +
        '    $di = New-Object DOCINFOA\r\n' +
        '    $di.pDocName  = "Ticket"\r\n' +
        '    $di.pDataType = "RAW"\r\n' +
        '    if ([RawPrint]::StartDocPrinter($h, 1, $di) -le 0) { throw "StartDocPrinter fallo" }\r\n' +
        '    [RawPrint]::StartPagePrinter($h) | Out-Null\r\n' +
        '    $p = [System.Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)\r\n' +
        '    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $p, $bytes.Length)\r\n' +
        '    $w = 0\r\n' +
        '    [RawPrint]::WritePrinter($h, $p, $bytes.Length, [ref]$w) | Out-Null\r\n' +
        '    [System.Runtime.InteropServices.Marshal]::FreeCoTaskMem($p)\r\n' +
        '    [RawPrint]::EndPagePrinter($h) | Out-Null\r\n' +
        '    [RawPrint]::EndDocPrinter($h) | Out-Null\r\n' +
        '} finally {\r\n' +
        '    [RawPrint]::ClosePrinter($h) | Out-Null\r\n' +
        '}\r\n' +
        'Write-Host "OK"\r\n';

      fs.writeFileSync(tmpBin, bytes);
      fs.writeFileSync(tmpPs1, ps, 'utf8');

      console.log(`[PRINT] Lanzando PowerShell para impresora: ${printerName}`);
      console.log(`[PRINT] Script: ${tmpPs1}`);

      const result = spawnSync('powershell', [
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-File', tmpPs1,
      ], {
        windowsHide: true,
        timeout: 25000,
        encoding: 'utf8',
      });

      console.log(`[PRINT] Exit code: ${result.status}`);
      if (result.stdout) console.log(`[PRINT] stdout: ${result.stdout.trim()}`);
      if (result.stderr) console.log(`[PRINT] stderr: ${result.stderr.trim()}`);

      if (result.error) {
        reject(new Error(`Error al ejecutar PowerShell: ${result.error.message}`));
        return;
      }
      if (result.status !== 0) {
        const msg = (result.stderr || result.stdout || '').trim() || `PowerShell salió con código ${result.status}`;
        reject(new Error(msg));
        return;
      }

      resolve();
    } catch (e) {
      console.error('[PRINT] Excepción en printViaSpooler:', e.message);
      reject(new Error(e.message));
    } finally {
      try { if (tmpBin) fs.unlinkSync(tmpBin); } catch {}
      try { if (tmpPs1) fs.unlinkSync(tmpPs1); } catch {}
    }
  });
}

// ── Listar impresoras instaladas en Windows ───────────────────────────────────

function listPrinters() {
  try {
    const result = spawnSync('powershell', [
      '-NonInteractive',
      '-Command',
      'Get-Printer | Select-Object -ExpandProperty Name',
    ], { windowsHide: true, timeout: 8000, encoding: 'utf8' });

    return (result.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Enviar bytes a la impresora ───────────────────────────────────────────────

function printBytes(bytes) {
  const target = String(config.printerTarget || '').trim();

  // PRINTER:Nombre → spooler de Windows (USB, red compartida, etc.)
  if (target.toUpperCase().startsWith('PRINTER:')) {
    const printerName = target.slice(8).trim();
    return printViaSpooler(bytes, printerName);
  }

  // host:puerto → impresora en red TCP rawport 9100
  if (target.includes(':')) {
    const [host, portStr] = target.split(':');
    const tcpPort = parseInt(portStr) || 9100;
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port: tcpPort }, () => {
        socket.write(bytes, () => { socket.destroy(); resolve(); });
      });
      socket.setTimeout(8000, () => {
        socket.destroy();
        reject(new Error(`Timeout conectando a ${target}`));
      });
      socket.on('error', reject);
    });
  }

  // COM3 / LPT1 → puerto serie o paralelo (no USB)
  return new Promise((resolve, reject) => {
    try {
      fs.writeFileSync(`\\\\.\\${target}`, bytes);
      resolve();
    } catch (e) {
      reject(new Error(`Error escribiendo en ${target}: ${e.message}`));
    }
  });
}

// ── Ticket de prueba ESC/POS ──────────────────────────────────────────────────

function buildTestTicket() {
  const ESC = 0x1B;
  const GS  = 0x1D;

  const parts = [];
  const push  = (buf) => parts.push(buf);
  const cmd   = (...bytes) => push(Buffer.from(bytes));
  const text  = (s) => push(Buffer.from(s + '\n', 'latin1'));

  cmd(ESC, 0x40);                     // Init
  cmd(ESC, 0x61, 0x01);               // Centrar
  cmd(ESC, 0x45, 0x01);               // Negrita ON
  text('*** PRUEBA DE IMPRESION ***');
  cmd(ESC, 0x45, 0x00);               // Negrita OFF
  cmd(GS,  0x21, 0x10);               // Doble alto
  text('Abarrotes Maria');
  cmd(GS,  0x21, 0x00);               // Normal
  text(new Date().toLocaleString('es-MX'));
  cmd(ESC, 0x61, 0x00);               // Izquierda
  text('--------------------------------');
  text('Si ves este ticket la impresora');
  text('esta configurada correctamente.');
  text('Target: ' + config.printerTarget);
  text('--------------------------------');
  text(''); text(''); text('');
  cmd(GS, 0x56, 0x01);                // Corte parcial

  return Buffer.concat(parts);
}

// ── Cliente HTTP mínimo (para /broadcasting/auth y el heartbeat) ─────────────

function httpPostJson(urlString, bodyObj, extraHeaders) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(urlString);
    } catch (e) {
      reject(e);
      return;
    }

    const mod  = target.protocol === 'https:' ? https : httpModule;
    const body = JSON.stringify(bodyObj || {});

    const req = mod.request({
      hostname: target.hostname,
      port:     target.port || (target.protocol === 'https:' ? 443 : 80),
      path:     target.pathname + target.search,
      method:   'POST',
      timeout:  10000,
      headers: Object.assign({
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept':         'application/json',
      }, extraHeaders || {}),
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch { /* respuesta no-JSON */ }
        resolve({ status: res.statusCode, json, raw });
      });
    });

    req.on('timeout', () => req.destroy(new Error(`Timeout llamando a ${urlString}`)));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Autorización de canal privado contra /broadcasting/auth de Laravel ───────

function reverbAuthorizer(channel) {
  return {
    authorize(socketId, callback) {
      httpPostJson(`${config.apiBaseUrl}/broadcasting/auth`, {
        socket_id:    socketId,
        channel_name: channel.name,
      }, {
        Authorization: `Bearer ${config.token}`,
      })
        .then(({ status, json, raw }) => {
          if (status >= 200 && status < 300 && json && json.auth) {
            callback(false, json);
          } else {
            callback(true, new Error(`Auth de canal falló (HTTP ${status}): ${raw.slice(0, 200)}`));
          }
        })
        .catch((err) => callback(true, err));
    },
  };
}

// ── Heartbeat: le avisa al backend que este agente sigue vivo ────────────────

function sendHeartbeat() {
  if (!config.token) return;
  httpPostJson(`${config.apiBaseUrl}/api/print-agents/heartbeat`, {}, {
    Authorization: `Bearer ${config.token}`,
  }).catch((e) => console.warn('[HEARTBEAT] No se pudo avisar al servidor:', e.message));
}

// ── Job de impresión recibido por WebSocket ───────────────────────────────────

async function handlePrintJob(payload) {
  const jobId   = payload && payload.job_id;
  const dataB64 = payload && payload.data;

  if (!dataB64) {
    console.error(`[PRINT] Job ${jobId ?? '?'} llegó sin datos.`);
    return;
  }

  const bytes  = Buffer.from(dataB64, 'base64');
  const copies = Math.max(1, Math.min(5, Number(payload.copies) || 1));

  console.log(`[PRINT] Job ${jobId}: imprimiendo ${copies} copia(s)...`);
  try {
    for (let i = 0; i < copies; i++) {
      await printBytes(bytes);
    }
    console.log(`[PRINT] Job ${jobId}: OK`);
  } catch (e) {
    console.error(`[PRINT] Job ${jobId}: error -`, e.message);
  }
}

// ── Conexión WebSocket saliente a Reverb ──────────────────────────────────────
// (si se invocó con un subcomando como "test", ya se resolvió arriba: no conectar)

if (cmd) return;

console.log('');
console.log('  ╔══════════════════════════════════════════╗');
console.log(`  ║  Abarrotes María — Print Agent ${VERSION}    ║`);
console.log('  ╚══════════════════════════════════════════╝');
console.log('');
console.log(`  Impresora : ${config.printerTarget}`);
console.log(`  Sucursal  : ${config.almacenId ?? '(sin configurar)'}`);
console.log(`  Reverb    : ${config.reverbScheme}://${config.reverbHost}:${config.reverbPort}`);
console.log('');

if (!config.almacenId || !config.token || !config.reverbAppKey) {
  console.error('  Falta almacenId, token o reverbAppKey en print-agent.config.json.');
  console.error('  El agente seguirá corriendo pero no podrá suscribirse hasta corregir la configuración.');
  console.error('');
}

const usesTLS = config.reverbScheme === 'https';

const pusher = new Pusher(config.reverbAppKey, {
  wsHost:             config.reverbHost,
  wsPort:             config.reverbPort,
  wssPort:            config.reverbPort,
  forceTLS:           usesTLS,
  enabledTransports:  usesTLS ? ['wss'] : ['ws'],
  disableStats:       true,
  cluster:            'mt1', // no lo usa Reverb, pero la librería lo exige
  authorizer:         reverbAuthorizer,
});

pusher.connection.bind('state_change', (states) => {
  console.log(`[WS] ${states.previous} → ${states.current}`);
});
pusher.connection.bind('connected', sendHeartbeat);
pusher.connection.bind('error', (err) => {
  console.error('[WS] Error de conexión:', JSON.stringify(err));
});

const channelName = `private-print-agent.${config.almacenId}`;
const channel = pusher.subscribe(channelName);

channel.bind('pusher:subscription_succeeded', () => {
  console.log(`[WS] Suscrito a ${channelName}. Agente listo.`);
});
channel.bind('pusher:subscription_error', (err) => {
  console.error(`[WS] No se pudo suscribir a ${channelName}:`, JSON.stringify(err));
});
channel.bind('print.job', (payload) => {
  handlePrintJob(payload).catch((e) => console.error('[PRINT] Error inesperado:', e.message));
});

// Heartbeat periódico además del que se manda al conectar/reconectar.
setInterval(sendHeartbeat, 5 * 60 * 1000);
