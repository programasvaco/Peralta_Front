import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef } from 'ag-grid-community';

import { ProveedoresService } from '../../data/proveedores.service';
import { CtaXPagar } from '../../data/proveedores.models';
import { formatDate } from '../../../../../shared/utils/date.utils';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../shared/utils/ag-grid-defaults';

type FieldErrors = Record<string, string[]>;

@Component({
  selector: 'app-proveedor-form',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, AgGridAngular],
  templateUrl: './proveedor-form.component.html',
  styleUrl: './proveedor-form.component.scss',
})
export class ProveedorFormComponent {
  loading = signal(false);
  saving = signal(false);

  proveedorId: number | null = null;
  mode: 'create' | 'edit' = 'create';

  fieldErrors = signal<FieldErrors>({});

  // resumen (solo edit)
  totalCompras = signal<number | null>(null);
  saldoPendiente = signal<number | null>(null);

  // Tabs
  tab = signal<'general' | 'estadoCuenta'>('general');

  // Estado de cuenta
  ecLoading = signal(false);
  ecError = signal<string | null>(null);
  ecSaldo = signal<number>(0);
  ecRows = signal<CtaXPagar[]>([]);

  ecDefaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  ecColDefs: ColDef<CtaXPagar>[] = [
    { headerName: 'CxP ID', field: 'id', width: 100 },
    { headerName: 'Compra ID', field: 'compra_id', width: 110 },
    { 
      headerName: 'Fecha', 
      field: 'fecha', 
      width: 130,
      valueFormatter: (p) => formatDate(p.value),
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

  form = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(255)]],
    direccion: ['', [Validators.maxLength(255)]],
    ciudad: ['', [Validators.maxLength(255)]],
    rfc: ['', [Validators.maxLength(20)]],
    telefono: ['', [Validators.maxLength(20)]],
    dias_credito: [0, [Validators.required, Validators.min(0)]],
    activo: [true],
  });

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private proveedoresSvc: ProveedoresService,
  ) {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.proveedorId = idParam ? Number(idParam) : null;
    this.mode = this.proveedorId ? 'edit' : 'create';

    if (this.mode === 'edit') this.loadProveedor();
  }

  get title(): string {
    return this.mode === 'create' ? 'Nuevo proveedor' : 'Editar proveedor';
  }

  private loadProveedor() {
    if (!this.proveedorId) return;
    this.loading.set(true);

    this.proveedoresSvc.get(this.proveedorId).subscribe({
      next: (res: any) => {
        const p = res?.proveedor ?? res;

        this.form.patchValue({
          nombre: p?.nombre ?? '',
          direccion: p?.direccion ?? '',
          ciudad: p?.ciudad ?? '',
          rfc: p?.rfc ?? '',
          telefono: p?.telefono ?? '',
          dias_credito: Number(p?.dias_credito ?? 0),
          activo: !!p?.activo,
        });

        this.totalCompras.set(typeof res?.total_compras === 'number' ? res.total_compras : null);
        this.saldoPendiente.set(typeof res?.saldo_pendiente === 'number' ? res.saldo_pendiente : null);

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
    if (t === 'estadoCuenta' && this.mode === 'edit') {
      this.loadEstadoCuenta();
    }
  }

  loadEstadoCuenta() {
    if (!this.proveedorId) return;
    this.ecLoading.set(true);
    this.ecError.set(null);

    this.proveedoresSvc.estadoCuenta(this.proveedorId).subscribe({
      next: (res) => {
        this.ecRows.set(res?.cuentas ?? []);
        this.ecSaldo.set(Number(res?.saldo_pendiente ?? 0));
        this.ecLoading.set(false);
      },
      error: (err) => {
        this.ecLoading.set(false);
        this.ecError.set(err?.error?.message ?? 'No se pudo cargar el estado de cuenta.');
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
    return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private parseDate(v?: string | null): Date | null {
    if (!v) return null;
    // 'YYYY-MM-DD'
    const d = new Date(v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  private isVencida(row?: CtaXPagar | null): boolean {
    if (!row) return false;
    const saldo = this.toNumber(row.saldo);
    const venc = this.parseDate(row.vencimiento);
    if (!venc) return false;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return venc.getTime() < hoy.getTime() && saldo > 0;
  }

  private diasVencimiento(row?: CtaXPagar | null): number {
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
    if (c.errors['min']) return 'El valor mínimo es 0.';
    return 'Campo inválido.';
  }

  backendError(field: string): string | null {
    return this.fieldErrors()[field]?.[0] ?? null;
  }

  isInvalid(field: string): boolean {
    const c = this.form.get(field);
    const backend = !!this.fieldErrors()[field]?.length;
    return ((!!c && c.touched && c.invalid) || backend);
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
      rfc: (raw.rfc ?? '').trim() || null,
      telefono: (raw.telefono ?? '').trim() || null,
      dias_credito: Number(raw.dias_credito ?? 0),
      activo: !!raw.activo,
    };

    const req =
      this.mode === 'create'
        ? this.proveedoresSvc.create(payload)
        : this.proveedoresSvc.update(this.proveedorId!, payload);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/catalog/proveedores'], {
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
    this.router.navigate(['/catalog/proveedores'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }
}