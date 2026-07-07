import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  BadgeComponent,
  ButtonDirective,
  ModalBodyComponent,
  ModalComponent,
  ModalFooterComponent,
  ModalHeaderComponent,
  SpinnerComponent,
  TableDirective,
} from '@coreui/angular';

import { CxpService } from '../../data/cxp.service';
import { FormasPagoService } from '../../../../catalog/formas-pago/data/formas-pago.service';
import { CtaXPagar } from '../../data/cxp.models';
import { FormaPago } from '../../../../catalog/formas-pago/data/formas-pago.models';
import { formatDateTime } from '../../../../../shared/utils/date.utils';

@Component({
  selector: 'app-cxp-show',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonDirective,
    SpinnerComponent,
    TableDirective,
    BadgeComponent,
    ModalComponent,
    ModalHeaderComponent,
    ModalBodyComponent,
    ModalFooterComponent,
  ],
  templateUrl: './cxp-show.component.html',
  styleUrl: './cxp-show.component.scss',
})
export class CxpShowComponent {
  private cxpSvc       = inject(CxpService);
  private formasPagoSvc = inject(FormasPagoService);
  private route        = inject(ActivatedRoute);
  private router       = inject(Router);

  loading        = signal(true);
  saving         = signal(false);
  cxp            = signal<CtaXPagar | null>(null);
  formasPagoList = signal<FormaPago[]>([]);
  modalVisible   = signal(false);

  banner = signal<{ type: 'success' | 'danger'; text: string } | null>(null);

  pagoForm = new FormGroup({
    importe:   new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    f_pago_id: new FormControl<number | null>(null, Validators.required),
    tipo:      new FormControl<'Abono' | 'Cargo'>('Abono', Validators.required),
  });

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    this.formasPagoSvc.list().subscribe({
      next: (list) => this.formasPagoList.set(list),
    });

    this.cxpSvc.get(id).subscribe({
      next: (c) => {
        this.cxp.set(c);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.banner.set({ type: 'danger', text: 'No se pudo cargar la cuenta.' });
      },
    });
  }

  openModal() {
    const saldo = this.cxp()?.saldo ?? 0;
    this.pagoForm.reset({ importe: null, f_pago_id: null, tipo: 'Abono' });
    // El validador max solo aplica para Abono
    this.updateImporteValidators('Abono', saldo);
    this.modalVisible.set(true);
  }

  onTipoChange(tipo: string) {
    const saldo = this.cxp()?.saldo ?? 0;
    this.updateImporteValidators(tipo as 'Abono' | 'Cargo', saldo);
  }

  private updateImporteValidators(tipo: 'Abono' | 'Cargo', saldo: number) {
    const ctrl = this.pagoForm.controls.importe;
    if (tipo === 'Abono') {
      ctrl.setValidators([Validators.required, Validators.min(0.01), Validators.max(saldo)]);
    } else {
      ctrl.setValidators([Validators.required, Validators.min(0.01)]);
    }
    ctrl.updateValueAndValidity();
  }

  closeModal() {
    this.modalVisible.set(false);
  }

  confirmarPago() {
    if (this.pagoForm.invalid) return;

    const c = this.cxp();
    if (!c) return;

    const { importe, f_pago_id, tipo } = this.pagoForm.getRawValue();

    this.saving.set(true);

    this.cxpSvc
      .pagar(c.id, { importe: importe!, f_pago_id: f_pago_id!, tipo: tipo! })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.modalVisible.set(false);
          this.banner.set({ type: 'success', text: res.message });

          this.loading.set(true);
          this.cxpSvc.get(c.id).subscribe({
            next: (updated) => {
              this.cxp.set(updated);
              this.loading.set(false);
            },
          });
        },
        error: (err) => {
          this.saving.set(false);
          this.banner.set({
            type: 'danger',
            text: err?.error?.message ?? 'No se pudo registrar el movimiento.',
          });
        },
      });
  }

  volver() {
    this.router.navigate(['/operation/cxp']);
  }

  formatDateTime = formatDateTime;

  esVencida(): boolean {
    const c = this.cxp();
    if (!c) return false;
    return new Date(c.vencimiento) < new Date() && c.saldo > 0;
  }

  estadoBadge(): string {
    const c = this.cxp();
    if (!c) return 'secondary';
    if (c.saldo <= 0) return 'success';
    if (this.esVencida()) return 'danger';
    return 'warning';
  }

  estadoLabel(): string {
    const c = this.cxp();
    if (!c) return '';
    if (c.saldo <= 0) return 'Saldada';
    if (this.esVencida()) return 'Vencida';
    return 'Pendiente';
  }

  tipoBadge(tipo: string): string {
    return tipo === 'Cargo' ? 'danger' : 'success';
  }
}
