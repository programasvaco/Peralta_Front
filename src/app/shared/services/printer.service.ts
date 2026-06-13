import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PrinterService {
  private readonly AGENT_URL_KEY = 'pos_agent_url';
  private readonly DEFAULT_URL   = 'http://localhost:8765';

  isConnected = signal(false);
  agentUrl    = signal<string>(localStorage.getItem(this.AGENT_URL_KEY) ?? this.DEFAULT_URL);

  setAgentUrl(url: string): void {
    const clean = url.trim().replace(/\/$/, '');
    this.agentUrl.set(clean);
    localStorage.setItem(this.AGENT_URL_KEY, clean);
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.agentUrl()}/ping`, {
        signal: AbortSignal.timeout(3000),
      });
      const ok = res.ok;
      this.isConnected.set(ok);
      return ok;
    } catch {
      this.isConnected.set(false);
      return false;
    }
  }

  async print(data: ArrayBuffer): Promise<void> {
    const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));

    const res = await fetch(`${this.agentUrl()}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64 }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || `Error al imprimir (HTTP ${res.status})`);
    }

    this.isConnected.set(true);
  }
}
