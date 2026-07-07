import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  ButtonDirective,
  CardBodyComponent,
  CardComponent,
  CardHeaderComponent,
  ColComponent,
  RowComponent,
  SpinnerComponent,
  BadgeComponent,
} from '@coreui/angular';
import { ComprasService } from '../../data/compras.service';
import { ProveedoresService } from '../../../../catalog/proveedores/data/proveedores.service';
import { AlmacenesService } from '../../../../settings/pages/almacenes/data/almacenes.service';
import { ArticulosService } from '../../../../catalog/articulos/data/articulos.service';
import { FormasPagoService } from '../../../../catalog/formas-pago/data/formas-pago.service';
import { Proveedor } from '../../../../catalog/proveedores/data/proveedores.models';
import { Almacen } from '../../../../settings/pages/almacenes/data/almacenes.models';
import { Articulo } from '../../../../catalog/articulos/data/articulos.models';
import { CompraCreatePayload, CompraShowResponse } from '../../data/compras.models';
import { HasPermissionDirective } from '../../../../../core/directives/has-permission.directive';
import { getTodayString } from '../../../../../shared/utils/date.utils';
import { SelectOnFocusDirective } from '../../../../../shared/directives/select-on-focus.directive';

type FormaPago = { id: number; descripcion: string };

@Component({
  selector: 'app-compra-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    RowComponent,
    ColComponent,
    CardComponent,
    CardHeaderComponent,
    CardBodyComponent,
    ButtonDirective,
    SpinnerComponent,
    BadgeComponent,
    HasPermissionDirective,
    SelectOnFocusDirective,
  ],
  templateUrl: './compra-form.component.html',
  styleUrl: './compra-form.component.scss',
})
export class CompraFormComponent {
  private comprasSvc = inject(ComprasService);
  private proveedoresSvc = inject(ProveedoresService);
  private almacenesSvc = inject(AlmacenesService);
  private articulosSvc = inject(ArticulosService);
  private formasPagoSvc = inject(FormasPagoService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  id = Number(this.route.snapshot.paramMap.get('id') ?? 0) || null;

  loading = signal(false);
  saving = signal(false);

  proveedores = signal<Proveedor[]>([]);
  almacenes = signal<Almacen[]>([]);
  articulos = signal<Articulo[]>([]);
  formasPago = signal<FormaPago[]>([]);

  showData = signal<CompraShowResponse | null>(null);
  fieldErrors = signal<Record<string, string[]>>({});

  articuloNombres: string[] = [];
  articuloDropdownOpens: boolean[] = [];

  // ✅ Totales reactivos (siempre correctos)
  totals = signal({ subtotal: 0, impuestos: 0, total: 0 });

  private readonly variedadRegex = /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ\s\.\-\/]+$/;

  form = new FormGroup({
    fecha: new FormControl<string>(getTodayString(), { nonNullable: true, validators: [Validators.required] }),
    referencia: new FormControl<string | null>(null),

    proveedor_id: new FormControl<number | null>(null, Validators.required),
    almacen_id: new FormControl<number | null>(null, Validators.required),

    credito: new FormControl<boolean>(false, { nonNullable: true }),
    dias_credito: new FormControl<number | null>(null),
    f_pago_id: new FormControl<number | null>(null),

    detalles: new FormArray<FormGroup>([]),
  });

  get detalles(): FormArray<FormGroup> {
    return this.form.get('detalles') as FormArray<FormGroup>;
  }

  isCancelada = computed(() => (this.showData()?.estatus ?? '').toLowerCase() === 'cancelada');

  constructor() {
    this.loadCombos();
    if (this.id) this.load();
    else this.addRow();

    // ✅ Recalcular totales cada vez que cambia el formulario
    this.form.valueChanges.subscribe(() => this.recalcTotals());

    // ✅ Primer cálculo
    this.recalcTotals();
  }

  private loadCombos() {
    this.proveedoresSvc.list({ per_page: 200, page: 1, activo: true }).subscribe({
      next: (res: any) => this.proveedores.set(Array.isArray(res) ? res : (res?.data ?? [])),
    });

    this.almacenesSvc.list({ activo: true }).subscribe({
      next: (res) => {
        this.almacenes.set(res ?? []);
        const almacenId = this.showData()?.almacen_id;
        if (almacenId != null) {
          this.form.controls.almacen_id.setValue(almacenId);
        }
      },
    });

    this.articulosSvc.list({ page: 1, per_page: 500, activo: true }).subscribe({
      next: (res: any) => this.articulos.set(res?.data ?? []),
    });

    this.formasPagoSvc.list().subscribe({
      next: (res: any) => this.formasPago.set(Array.isArray(res) ? res : (res?.data ?? [])),
    });
  }

  private load() {
    if (!this.id) return;
    this.loading.set(true);

    this.comprasSvc.get(this.id).subscribe({
      next: (res: any) => {
        const data = res as CompraShowResponse;
        console.log('Compra cargada:', data);
        this.showData.set(data);

        this.form.patchValue({
          fecha: data.fecha ? data.fecha.substring(0, 10) : '',
          referencia: data.referencia,
          proveedor_id: data.proveedor_id,
          almacen_id: data.almacen_id ?? null,
        });

        // detalles
        this.detalles.clear();
        this.articuloNombres = [];
        this.articuloDropdownOpens = [];
        (data.detalles ?? []).forEach((d) => {
          const articuloId   = d.inventario?.articulo_id ?? d.articulo_id ?? null;
          const articuloNombre = d.inventario?.articulo?.nombre ?? d.articulo?.nombre ?? '';
          const variedad     = d.inventario?.variedad ?? d.variedad ?? '';

          const g = this.rowGroup();
          g.patchValue({
            articulo_id: articuloId,
            variedad,
            cantidad:   Number(d.cantidad              ?? 0),
            empaque:    Number(d.empaque               ?? 0),
            costo:      Number(d.costo                 ?? 0),
            impuestos:  Number(d.impuestos             ?? 0),
            precio:     Number(d.inventario?.precio    ?? 0),
            precio_min: Number(d.inventario?.precio_min ?? 0),
          });
          this.detalles.push(g);
          this.articuloNombres.push(articuloNombre);
          this.articuloDropdownOpens.push(false);
        });

        this.fieldErrors.set({});

        // Diferir la visibilidad al siguiente tick para que Angular
        // cree el DOM antes de que writeValue sincronice los valores
        setTimeout(() => {
          this.loading.set(false);
          this.recalcTotals();
        }, 0);
      },
      error: (error) => {
        this.loading.set(false);
        // this.router.navigateByUrl('/404');
      },
    });
  }

  // ✅ Grupo de renglón
  rowGroup() {
    return new FormGroup({
      articulo_id: new FormControl<number | null>(null, Validators.required),
      variedad: new FormControl<string>('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.maxLength(50),
          Validators.pattern(this.variedadRegex),
        ],
      }),
      cantidad: new FormControl<number>(1, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0.001)],
      }),
      empaque: new FormControl<number>(0, { nonNullable: true, validators: [Validators.min(0)] }),
      costo: new FormControl<number>(0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)],
      }),
      impuestos: new FormControl<number>(0, { nonNullable: true, validators: [Validators.min(0)] }),
      precio: new FormControl<number>(0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)],
      }),
      precio_min: new FormControl<number>(0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)],
      }),
    });
  }

  addRow() {
    this.detalles.push(this.rowGroup());
    this.articuloNombres.push('');
    this.articuloDropdownOpens.push(false);
    this.recalcTotals();
  }

  removeRow(i: number) {
    this.detalles.removeAt(i);
    this.articuloNombres.splice(i, 1);
    this.articuloDropdownOpens.splice(i, 1);
    if (this.detalles.length === 0) this.addRow();
    this.recalcTotals();
  }

  articuloNombre(i: number): string {
    const nombre = this.articuloNombres[i];
    if (nombre) return nombre;
    const id = this.detalles.at(i).get('articulo_id')?.value;
    if (!id) return '';
    return this.articulos().find(a => a.id === id)?.nombre ?? '';
  }

  getArticulosFiltrados(i: number): Articulo[] {
    const q = (this.articuloNombres[i] ?? '').toLowerCase().trim();
    if (!q) return this.articulos().slice(0, 20);
    return this.articulos()
      .filter(a => a.nombre?.toLowerCase().includes(q))
      .slice(0, 20);
  }

  onArticuloInput(i: number, value: string) {
    this.articuloNombres[i] = value;
    this.articuloDropdownOpens[i] = true;
    if (!value) this.detalles.at(i).get('articulo_id')?.setValue(null);
  }

  onArticuloFocus(i: number) {
    this.articuloDropdownOpens[i] = true;
  }

  onArticuloBlur(i: number) {
    setTimeout(() => { this.articuloDropdownOpens[i] = false; }, 200);
  }

  onArticuloSelect(i: number, a: Articulo) {
    this.articuloNombres[i] = a.nombre;
    this.articuloDropdownOpens[i] = false;
    this.detalles.at(i).get('articulo_id')?.setValue(a.id);
    this.detalles.at(i).get('articulo_id')?.markAsTouched();
  }

  onArticuloClear(i: number) {
    this.articuloNombres[i] = '';
    this.articuloDropdownOpens[i] = true;
    this.detalles.at(i).get('articulo_id')?.setValue(null);
  }

  private n(v: any): number {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  // ✅ Cálculo REAL de totales (siempre correcto)
  private recalcTotals() {
    const rows = this.detalles.controls;

    let subtotal = 0;
    let impuestos = 0;

    for (const g of rows) {
      const cantidad = this.n(g.get('cantidad')?.value);
      const costo = this.n(g.get('costo')?.value);
      const imp = this.n(g.get('impuestos')?.value);

      subtotal += cantidad * costo;
      impuestos += imp;
    }

    // Evitar -0 y cosas raras
    subtotal = Math.max(0, subtotal);
    impuestos = Math.max(0, impuestos);

    this.totals.set({
      subtotal,
      impuestos,
      total: subtotal + impuestos,
    });
  }

  back() {
    this.router.navigate(['/operation/compras']);
  }

  save() {
    if (this.id) return; // no editamos compras
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();

    const credito = !!raw.credito;
    const diasCredito = credito ? this.n(raw.dias_credito) : null;
    const formaPagoId = !credito ? this.n(raw.f_pago_id) : null;

    if (credito && (!diasCredito || diasCredito < 1)) {
      this.fieldErrors.set({ dias_credito: ['Requerido cuando es crédito.'] });
      return;
    }
    if (!credito && (!formaPagoId || formaPagoId < 1)) {
      this.fieldErrors.set({ f_pago_id: ['Requerido cuando es contado.'] });
      return;
    }

    // ✅ forzar recálculo antes de enviar
    this.recalcTotals();
    const t = this.totals();

    const payload: CompraCreatePayload = {
      fecha: raw.fecha!,
      referencia: raw.referencia ?? null,
      proveedor_id: Number(raw.proveedor_id),
      almacen_id: Number(raw.almacen_id),

      subtotal: t.subtotal,
      impuestos: t.impuestos,
      total: t.total,

      credito,
      dias_credito: credito ? diasCredito! : undefined,
      f_pago_id: !credito ? formaPagoId! : undefined,

      detalles: (raw.detalles ?? []).map((d: any) => ({
        articulo_id: Number(d.articulo_id),
        // ✅ limpiar espacios + validar solo texto
        variedad: String(d.variedad ?? '').trim(),
        cantidad: this.n(d.cantidad),
        empaque: this.n(d.empaque ?? 0),
        costo: this.n(d.costo),
        impuestos: this.n(d.impuestos ?? 0),
        precio: this.n(d.precio),
        precio_min: this.n(d.precio_min),
      })),
    };

    this.saving.set(true);
    this.fieldErrors.set({});

    this.comprasSvc.create(payload).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        const id = res?.compra?.id;
        if (id){ this.router.navigate(['/operation/compras', id, 'ver']); }
        else{ this.router.navigate(['/operation/compras']); }
      },
      error: (err) => {
        this.saving.set(false);

        const errors = err?.error?.errors;
        if (errors) {
          this.fieldErrors.set(errors);
          return;
        }

        this.fieldErrors.set({ general: [err?.error?.message ?? 'Error al guardar.'] });
      },
    });
  }

  cancelar() {
    if (!this.id) return;
    this.saving.set(true);

    this.comprasSvc.cancelar(this.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.fieldErrors.set({ general: [err?.error?.message ?? 'No se pudo cancelar.'] });
      },
    });
  }

  badge(estatus?: string | null) {
    const s = (estatus ?? 'activa').toLowerCase();
    return s === 'cancelada' ? 'danger' : 'success';
  }
}