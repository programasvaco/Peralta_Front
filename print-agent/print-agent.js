/**
 * Abarrotes María — Print Agent v1.2.0
 *
 * Servidor HTTP local que recibe tickets ESC/POS desde el navegador
 * y los envía a la impresora (nombre Windows, COM o red TCP).
 *
 * Uso:
 *   print-agent.exe              → arranca el servidor
 *   print-agent.exe install      → instala como servicio de Windows
 *   print-agent.exe uninstall    → elimina el servicio de Windows
 *
 * Configuración → print-agent.config.json en la misma carpeta que el .exe
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

const http              = require('http');
const fs                = require('fs');
const net               = require('net');
const os                = require('os');
const path              = require('path');
const { spawnSync, execSync } = require('child_process');

const VERSION  = '1.2.0';
const SVC_NAME = 'AbarrotesPrintAgent';

// ── Configuración ─────────────────────────────────────────────────────────────

const exeDir     = path.dirname(process.execPath);
const configFile = path.join(exeDir, 'print-agent.config.json');

const config = {
  httpPort:      8183,
  printerTarget: 'PRINTER:Nombre de la impresora',
};

try {
  if (fs.existsSync(configFile)) {
    Object.assign(config, JSON.parse(fs.readFileSync(configFile, 'utf8')));
    console.log(`Config cargada: ${configFile}`);
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

// ── Servidor HTTP ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function send(res, status, body) {
  try {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(status);
    res.end(JSON.stringify(body));
  } catch (e) {
    console.error('[HTTP] Error enviando respuesta:', e.message);
  }
}

const server = http.createServer((req, res) => {
  try {
    // Preflight CORS
    if (req.method === 'OPTIONS') {
      Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /ping
    if (req.method === 'GET' && req.url === '/ping') {
      send(res, 200, { ok: true, version: VERSION, target: config.printerTarget });
      return;
    }

    // GET /printers
    if (req.method === 'GET' && req.url === '/printers') {
      const list = listPrinters();
      send(res, 200, { printers: list });
      return;
    }

    // GET /test
    if (req.method === 'GET' && req.url === '/test') {
      console.log('[TEST] Iniciando impresión de prueba...');
      printBytes(buildTestTicket())
        .then(() => {
          console.log('[TEST] OK');
          send(res, 200, { ok: true, message: 'Ticket de prueba enviado.' });
        })
        .catch(e => {
          console.error('[TEST] Error:', e.message);
          send(res, 500, { error: e.message });
        });
      return;
    }

    // POST /print
    if (req.method === 'POST' && req.url === '/print') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        Promise.resolve()
          .then(() => {
            const bodyBuf = Buffer.concat(chunks);
            const ct = (req.headers['content-type'] || '').toLowerCase();

            if (ct.includes('application/octet-stream')) {
              return printBytes(bodyBuf);
            }

            // Fallback: JSON { data: "<base64>" }
            const { data } = JSON.parse(bodyBuf.toString('utf8'));
            if (!data) throw new Error('Falta el campo "data" (base64).');
            return printBytes(Buffer.from(data, 'base64'));
          })
          .then(() => send(res, 200, { ok: true }))
          .catch(e => {
            console.error('[PRINT] Error:', e.message);
            send(res, 500, { error: e.message });
          });
      });
      req.on('error', (e) => send(res, 400, { error: e.message }));
      return;
    }

    send(res, 404, { error: 'Ruta no encontrada.' });
  } catch (e) {
    console.error('[HTTP] Error en handler:', e.message);
    send(res, 500, { error: 'Error interno del servidor.' });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Puerto ${config.httpPort} ya está en uso.`);
  } else {
    console.error('Error del servidor:', e.message);
  }
  process.exit(1);
});

server.listen(config.httpPort, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log(`  ║  Abarrotes María — Print Agent ${VERSION}  ║`);
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log(`  Puerto HTTP  : ${config.httpPort}`);
  console.log(`  Impresora    : ${config.printerTarget}`);
  console.log('');
  console.log('  Rutas:');
  console.log('    GET  /ping      → health check');
  console.log('    GET  /printers  → lista impresoras Windows');
  console.log('    GET  /test      → imprime ticket de prueba');
  console.log('    POST /print     → imprime ticket (base64)');
  console.log('');
  console.log('  Agente listo.');
  console.log('');
});
