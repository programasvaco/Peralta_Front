import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PrinterService } from '../../../../shared/services/printer.service';

@Component({
  selector: 'app-perifericos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './perifericos.component.html',
  styleUrl: './perifericos.component.scss',
})
export class PerifericosComponent {
  agentUrlDraft = signal('');
  pinging       = signal(false);
  pingResult    = signal<'ok' | 'error' | null>(null);
  saved         = signal(false);

  constructor(public printerSvc: PrinterService) {
    this.agentUrlDraft.set(printerSvc.agentUrl());
  }

  save() {
    this.printerSvc.setAgentUrl(this.agentUrlDraft());
    this.saved.set(true);
    this.pingResult.set(null);
    setTimeout(() => this.saved.set(false), 2500);
  }

  async testConnection() {
    this.pinging.set(true);
    this.pingResult.set(null);
    // Guardamos primero para que ping use la URL del draft
    this.printerSvc.setAgentUrl(this.agentUrlDraft());
    const ok = await this.printerSvc.ping();
    this.pingResult.set(ok ? 'ok' : 'error');
    this.pinging.set(false);
  }

  onUrlInput(val: string) {
    this.agentUrlDraft.set(val);
    this.pingResult.set(null);
    this.saved.set(false);
  }
}
