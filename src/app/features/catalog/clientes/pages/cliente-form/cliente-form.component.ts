import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef } from 'ag-grid-community';

import { ClientesService } from '../../data/clientes.service';
import { CtaXCobrar } from '../../data/clientes.models';
import { formatDate } from '../../../../../shared/utils/date.utils';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../shared/utils/ag-grid-defaults';

type FieldErrors = Record<string, string[]>;

@Component({
  selector: 'app-cliente-form',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, AgGridAngular],
  templateUrl: './cliente-form.component.html',
  styleUrl: './cliente-form.component.scss',
})
export class ClienteFormComponent {
  loading = signal(false);
  saving = signal(false);

  clienteId: number | null = null;
  mode: 'create' | 'edit' = 'create';

  fieldErrors = signal<FieldErrors>({});

  // resumen
  totalVentas = signal<number | null>(null);
  saldoPendiente = signal<number | null>(null);
  ultimaVenta = signal<any>(null);

  // Tabs
  tab = signal<'general' | 'estadoCuenta'>('general');

  // Estado de cuenta
  ecLoading = signal(false);
  ecError = signal<string | null>(null);
  ecSaldo = signal<number>(0);
  ecRows = signal<CtaXCobrar[]>([]);

  ecDefaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  ecColDefs: ColDef<CtaXCobrar>[] = [
    {
      headerName: 'Documento',
      width: 140,
      valueGetter: (p) => this.docVta(p.data?.venta_id),
    },
    {
      headerName: 'Fecha venta',
      width: 130,
      valueGetter: (p) => p.data?.venta?.fecha,
      valueFormatter: (p) => formatDate(p.value),
    },
    {
      headerName: 'Total venta',
      width: 140,
      valueGetter: (p) => p.data?.venta?.total ?? null,
      valueFormatter: (p) => this.money(p.value),
    },

    { 
      headerName: 'Venc.', 
      field: 'vencimiento', 
      width: 130,
      valueFormatter: (p) => formatDate(p.value),
    },

    {
      headerName: 'Importe',
      field: 'importe',
      width: 130,
      valueFormatter: (p) => this.money(p.value),
    },

    {
      headerName: 'Saldo',
      field: 'saldo',
      width: 130,
      valueFormatter: (p) => this.money(p.value),
      cellClassRules: {
        'text-danger fw-semibold': (p: any) => this.isVencida(p.data),
      },
    },

    {
      headerName: 'Vencida',
      width: 110,
      valueGetter: (p) => this.isVencida(p.data),
      valueFormatter: (p) => (p.value ? 'Sí' : 'No'),
    },
    {
      headerName: 'Días venc.',
      width: 110,
      valueGetter: (p) => this.diasVencimiento(p.data),
      valueFormatter: (p) => String(p.value ?? 0),
    },
  ];

  

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private clientesSvc: ClientesService,
  ) {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.clienteId = idParam ? Number(idParam) : null;
    this.mode = this.clienteId ? 'edit' : 'create';

    if (this.mode === 'edit') this.loadCliente();
  }

  form = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(255)]],
    direccion: ['', [Validators.maxLength(255)]],
    ciudad: ['', [Validators.maxLength(255)]],
    telefono: ['', [Validators.maxLength(20)]],
    activo: [true],
  });

  private docVta(ventaId?: number | null): string {
    if (!ventaId) return '-';
    return 'VTA' + String(ventaId).padStart(6, '0');
  }

  get title(): string {
    return this.mode === 'create' ? 'Nuevo cliente' : 'Editar cliente';
  }

  private loadCliente() {
    if (!this.clienteId) return;
    this.loading.set(true);

    this.clientesSvc.get(this.clienteId).subscribe({
      next: (res: any) => {
        const c = res?.cliente ?? res;

        this.form.patchValue({
          nombre: c?.nombre ?? '',
          direccion: c?.direccion ?? '',
          ciudad: c?.ciudad ?? '',
          telefono: c?.telefono ?? '',
          activo: !!c?.activo,
        });

        this.totalVentas.set(
          typeof res?.total_ventas === 'number' ? res.total_ventas : null,
        );
        this.saldoPendiente.set(
          typeof res?.saldo_pendiente === 'number' ? res.saldo_pendiente : null,
        );
        this.ultimaVenta.set(res?.ultima_venta ?? null);

        this.fieldErrors.set({});
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/404');
      },
    });
  }

  // Tabs
  setTab(t: 'general' | 'estadoCuenta') {
    this.tab.set(t);
    if (t === 'estadoCuenta' && this.mode === 'edit') this.loadEstadoCuenta();
  }

  loadEstadoCuenta() {
    if (!this.clienteId) return;
    this.ecLoading.set(true);
    this.ecError.set(null);

    this.clientesSvc.estadoCuenta(this.clienteId).subscribe({
      next: (res) => {
        this.ecRows.set(res?.cuentas ?? []);
        this.ecSaldo.set(Number(res?.saldo_pendiente ?? 0));
        this.ecLoading.set(false);
      },
      error: (err) => {
        this.ecLoading.set(false);
        this.ecError.set(
          err?.error?.message ?? 'No se pudo cargar el estado de cuenta.',
        );
      },
    });
  }

  // Helpers
  private toNumber(v: any): number {
    const n = typeof v === 'string' ? Number(v) : Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private money(v: any): string {
    const n = this.toNumber(v);
    return n.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private parseDate(v?: string | null): Date | null {
    if (!v) return null;
    const d = new Date(v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  private isVencida(row?: CtaXCobrar | null): boolean {
    if (!row) return false;
    const saldo = this.toNumber(row.saldo);
    const venc = this.parseDate(row.vencimiento);
    if (!venc) return false;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return venc.getTime() < hoy.getTime() && saldo > 0;
  }

  private diasVencimiento(row?: CtaXCobrar | null): number {
    if (!this.isVencida(row)) return 0;
    const venc = this.parseDate(row?.vencimiento);
    if (!venc) return 0;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const ms = hoy.getTime() - venc.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  // Validaciones
  errorText(field: string): string | null {
    const c = this.form.get(field);
    if (!c || !c.touched || !c.errors) return null;

    if (c.errors['required']) return 'Este campo es requerido.';
    if (c.errors['maxlength']) return 'Excede la longitud máxima.';
    return 'Campo inválido.';
  }

  backendError(field: string): string | null {
    return this.fieldErrors()[field]?.[0] ?? null;
  }

  isInvalid(field: string): boolean {
    const c = this.form.get(field);
    const backend = !!this.fieldErrors()[field]?.length;
    return (!!c && c.touched && c.invalid) || backend;
  }

  clearBackendError(field: string) {
    const errs = { ...this.fieldErrors() };
    if (errs[field]) {
      delete errs[field];
      this.fieldErrors.set(errs);
    }
  }

  // Acciones
  submit() {
    this.fieldErrors.set({});
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.saving.set(true);

    const raw = this.form.getRawValue();
    const payload = {
      nombre: (raw.nombre ?? '').trim(),
      direccion: (raw.direccion ?? '').trim() || null,
      ciudad: (raw.ciudad ?? '').trim() || null,
      telefono: (raw.telefono ?? '').trim() || null,
      activo: !!raw.activo,
    };

    const req =
      this.mode === 'create'
        ? this.clientesSvc.create(payload)
        : this.clientesSvc.update(this.clienteId!, payload);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/catalog/clientes'], {
          queryParams: this.route.snapshot.queryParams,
        });
      },
      error: (err) => {
        this.saving.set(false);

        if (err?.status === 422 && err?.error?.errors) {
          this.fieldErrors.set(err.error.errors as FieldErrors);
          return;
        }

        alert(err?.error?.message ?? 'Ocurrió un error al guardar.');
      },
    });
  }

  cancel() {
    this.router.navigate(['/catalog/clientes'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }
}
