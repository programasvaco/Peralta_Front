import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { environment } from '../../../../../enviroments/environment';

interface PrintAgentStatus {
  id: number;
  almacen_id: number;
  nombre: string;
  activo: boolean;
  last_seen_at: string | null;
  almacen?: { id: number; descripcion: string };
}

/** Un agente se considera en línea si mandó heartbeat en los últimos 7 min (late cada 5). */
const ONLINE_WINDOW_MS = 7 * 60 * 1000;

@Component({
  selector: 'app-perifericos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './perifericos.component.html',
  styleUrl: './perifericos.component.scss',
})
export class PerifericosComponent implements OnInit {
  private base = environment.apiBaseUrl;

  agents  = signal<PrintAgentStatus[]>([]);
  loading = signal(false);
  error   = signal<string | null>(null);

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<PrintAgentStatus[]>(`${this.base}/api/print-agents`).subscribe({
      next: (data) => { this.agents.set(data); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('No se pudo cargar el estado de los agentes.'); },
    });
  }

  isOnline(agent: PrintAgentStatus): boolean {
    if (!agent.last_seen_at) return false;
    return Date.now() - new Date(agent.last_seen_at).getTime() < ONLINE_WINDOW_MS;
  }

  lastSeenLabel(agent: PrintAgentStatus): string {
    if (!agent.last_seen_at) return 'Nunca se ha conectado';
    const diffMs = Date.now() - new Date(agent.last_seen_at).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Hace un momento';
    if (mins < 60) return `Hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Hace ${hours} h`;
    return `Hace ${Math.floor(hours / 24)} día(s)`;
  }
}
