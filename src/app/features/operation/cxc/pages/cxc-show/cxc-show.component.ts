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

import { CxcService } from '../../data/cxc.service';
import { FormasPagoService } from '../../../../catalog/formas-pago/data/formas-pago.service';
import { CtaXCobrar } from '../../data/cxc.models';
import { FormaPago } from '../../../../catalog/formas-pago/data/formas-pago.models';
import { formatDateTime } from '../../../../../shared/utils/date.utils';

@Component({
  selector: 'app-cxc-show',
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
  templateUrl: './cxc-show.component.html',
  styleUrl: './cxc-show.component.scss',
})
export class CxcShowComponent {
  private cxcSvc      = inject(CxcService);
  private formasPago  = inject(FormasPagoService);
  private route       = inject(ActivatedRoute);
  private router      = inject(Router);

  loading     = signal(true);
  saving      = signal(false);
  cxc         = signal<CtaXCobrar | null>(null);
  formasPagoList = signal<FormaPago[]>([]);
  modalVisible   = signal(false);

  banner = signal<{ type: 'success' | 'danger'; text: string } | null>(null);

  abonoForm = new FormGroup({
    importe:   new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    f_pago_id: new FormControl<number | null>(null, Validators.required),
  });

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    this.loadFormasPago();

    this.cxcSvc.get(id).subscribe({
      next: (c) => {
        this.cxc.set(c);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.banner.set({ type: 'danger', text: 'No se pudo cargar la cuenta.' });
      },
    });
  }

  loadFormasPago() {
    this.formasPago.list().subscribe({
      next: (list) => this.formasPagoList.set(list),
    });
  }

  openModal() {
    const saldo = this.cxc()?.saldo ?? 0;
    this.abonoForm.reset({ importe: null, f_pago_id: null });
    this.abonoForm.controls.importe.setValidators([
      Validators.required,
      Validators.min(0.01),
      Validators.max(saldo),
    ]);
    this.abonoForm.controls.importe.updateValueAndValidity();
    this.modalVisible.set(true);
  }

  closeModal() {
    this.modalVisible.set(false);
  }

  confirmarAbono() {
    if (this.abonoForm.invalid) return;

    const c = this.cxc();
    if (!c) return;

    const { importe, f_pago_id } = this.abonoForm.getRawValue();

    this.saving.set(true);

    this.cxcSvc.abonar(c.id, { importe: importe!, f_pago_id: f_pago_id! }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.modalVisible.set(false);
        this.banner.set({ type: 'success', text: res.message });

        // Recargar la cuenta
        this.loading.set(true);
        this.cxcSvc.get(c.id).subscribe({
          next: (updated) => {
            this.cxc.set(updated);
            this.loading.set(false);
          },
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.banner.set({ type: 'danger', text: err?.error?.message ?? 'No se pudo registrar el abono.' });
      },
    });
  }

  volver() {
    this.router.navigate(['/operation/cxc']);
  }

  formatDateTime = formatDateTime;

  esVencida(): boolean {
    const c = this.cxc();
    if (!c) return false;
    return new Date(c.vencimiento) < new Date() && c.saldo > 0;
  }

  estadoBadge(): string {
    const c = this.cxc();
    if (!c) return 'secondary';
    if (c.saldo <= 0) return 'success';
    if (this.esVencida()) return 'danger';
    return 'warning';
  }

  estadoLabel(): string {
    const c = this.cxc();
    if (!c) return '';
    if (c.saldo <= 0) return 'Saldada';
    if (this.esVencida()) return 'Vencida';
    return 'Pendiente';
  }
}
