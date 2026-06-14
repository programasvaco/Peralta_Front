import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef } from 'ag-grid-community';

import { environment } from '../../../../../../../enviroments/environment';

import { AlmacenesService } from '../../data/almacenes.service';
import { InventarioItem } from '../../data/almacenes.models';

type FieldErrors = Record<string, string[]>;

@Component({
  selector: 'app-almacen-form',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, AgGridAngular],
  templateUrl: './almacen-form.component.html',
  styleUrl: './almacen-form.component.scss',
})
export class AlmacenFormComponent {
  loading = signal(false);
  saving = signal(false);

  almacenId: number | null = null;
  mode: 'create' | 'edit' = 'create';

  fieldErrors = signal<FieldErrors>({});
  valorInventario = signal<number | null>(null);

  // Imagen
  selectedFile: File | null = null;
  imagenActual = signal<string | null>(null);
  previewUrl = signal<string | null>(null);

  storageUrl = `${environment.apiBaseUrl}/storage/`;

  // Tabs
  tab = signal<'general' | 'inventario'>('general');

  // Inventario
  invLoading = signal(false);
  invSoloConStock = signal(true);
  invRows = signal<InventarioItem[]>([]);
  invError = signal<string | null>(null);

  invDefaultColDef: ColDef = {
    sortable: true,
    resizable: true,
  };

  invColDefs: ColDef<InventarioItem>[] = [
    { headerName: 'Artículo ID', field: 'articulo_id', width: 110 },
    {
      headerName: 'Artículo',
      valueGetter: (p) => p.data?.articulo?.nombre ?? '-',
      flex: 1,
      minWidth: 220,
    },
    {
      headerName: 'Categoría',
      valueGetter: (p) => p.data?.articulo?.categoria?.descripcion ?? '-',
      minWidth: 160,
    },
    {
      headerName: 'Existencia',
      field: 'existencia',
      width: 120,
      valueFormatter: (p) =>
        typeof p.value === 'number' ? p.value.toFixed(2) : (p.value ?? '0'),
    },
    {
      headerName: 'Costo',
      field: 'costo',
      width: 120,
      valueFormatter: (p) =>
        typeof p.value === 'number' ? p.value.toFixed(2) : (p.value ?? '0'),
    },
    {
      headerName: 'Total',
      width: 140,
      valueGetter: (p) => {
        const e = Number(p.data?.existencia ?? 0);
        const c = Number(p.data?.costo ?? 0);
        return e * c;
      },
      valueFormatter: (p) =>
        typeof p.value === 'number' ? p.value.toFixed(2) : (p.value ?? '0'),
    },
  ];

  form = this.fb.group({
    descripcion: ['', [Validators.required, Validators.maxLength(100)]],
    direccion: ['', [Validators.required, Validators.maxLength(255)]],
    ciudad: ['', [Validators.maxLength(50)]],
    telefono: ['', [Validators.maxLength(20)]],
    activo: [true],
  });

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private almacenesSvc: AlmacenesService,
  ) {
    this.route.paramMap.subscribe((pm) => {
      const idParam = pm.get('id');

      this.almacenId = idParam ? Number(idParam) : null;
      this.mode = this.almacenId ? 'edit' : 'create';

      if (this.mode === 'edit') {
        this.loadAlmacen();
      }
    });
  }

  get title(): string {
    return this.mode === 'create' ? 'Nuevo almacén' : 'Editar almacén';
  }

  private loadAlmacen() {
    if (!this.almacenId) return;
    this.loading.set(true);

    this.almacenesSvc.get(this.almacenId).subscribe({
      next: (res: any) => {
        console.log('RAW response:', res);
        console.log('Keys res:', Object.keys(res ?? {}));
        console.log('res.almacen:', res?.almacen);
        const a = res?.almacen ?? res;

        this.form.patchValue({
          descripcion: a?.descripcion ?? '',
          direccion: a?.direccion ?? '',
          ciudad: a?.ciudad ?? '',
          telefono: a?.telefono ?? '',
          activo: !!a?.activo,
        });

        this.imagenActual.set(a?.imagen ?? null);

        this.valorInventario.set(
          typeof res?.valor_inventario === 'number'
            ? res.valor_inventario
            : null,
        );

        this.fieldErrors.set({});
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/404');
      },
    });
  }

  // ---------- Validaciones ----------
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

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile = file;

    if (this.previewUrl()) {
      URL.revokeObjectURL(this.previewUrl()!);
    }
    this.previewUrl.set(file ? URL.createObjectURL(file) : null);
  }

  clearBackendError(field: string) {
    const errs = { ...this.fieldErrors() };
    if (errs[field]) {
      delete errs[field];
      this.fieldErrors.set(errs);
    }
  }

  // ---------- Acciones ----------
  submit() {
    this.fieldErrors.set({});
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.saving.set(true);

    const raw = this.form.getRawValue();
    const fd = new FormData();
    fd.append('descripcion', (raw.descripcion ?? '').trim());
    fd.append('direccion', (raw.direccion ?? '').trim());
    fd.append('ciudad', (raw.ciudad ?? '').trim() || '');
    fd.append('telefono', (raw.telefono ?? '').trim() || '');
    fd.append('activo', raw.activo ? '1' : '0');
    if (this.selectedFile) {
      fd.append('imagen', this.selectedFile);
    }

    const req =
      this.mode === 'create'
        ? this.almacenesSvc.create(fd)
        : (fd.append('_method', 'PUT'), this.almacenesSvc.update(this.almacenId!, fd));

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/settings/almacenes'], {
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
    this.router.navigate(['/settings/almacenes'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  // ---------- Tabs ----------
  setTab(t: 'general' | 'inventario') {
    this.tab.set(t);

    // Carga bajo demanda
    if (t === 'inventario' && this.mode === 'edit') {
      this.loadInventario();
    }
  }

  toggleSoloConStock() {
    this.invSoloConStock.set(!this.invSoloConStock());
    this.loadInventario();
  }

  loadInventario() {
    if (!this.almacenId) return;

    this.invLoading.set(true);
    this.invError.set(null);

    this.almacenesSvc
      .inventario(this.almacenId, this.invSoloConStock())
      .subscribe({
        next: (rows) => {
          this.invRows.set(rows ?? []);
          this.invLoading.set(false);
        },
        error: (err) => {
          this.invLoading.set(false);
          this.invError.set(
            err?.error?.message ?? 'No se pudo cargar el inventario.',
          );
        },
      });
  }
}
