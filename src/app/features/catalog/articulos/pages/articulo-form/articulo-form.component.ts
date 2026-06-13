import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../../../../src/enviroments/environment';
import { Categoria } from '../../data/articulos.models';
import { ArticulosService } from '../../data/articulos.service';
import { CategoriasService } from '../../data/categorias.service';

type FieldErrors = Record<string, string[]>;

@Component({
  selector: 'app-articulo-form',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './articulo-form.component.html',
  styleUrl: './articulo-form.component.scss',
})
export class ArticuloFormComponent {
  categorias = signal<Categoria[]>([]);
  loading = signal(false);
  saving = signal(false);

  // si hay id => edit
  articuloId: number | null = null;
  mode: 'create' | 'edit' = 'create';

  // imagen
  imagenFile: File | null = null;
  imagenPreview = signal<string | null>(null);
  imagenActual = signal<string | null>(null);

  // errores 422 por campo
  fieldErrors = signal<FieldErrors>({});

  form = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(50)]],
    nombre_corto: ['', [Validators.required, Validators.maxLength(50)]],
    unidad: ['', [Validators.required, Validators.maxLength(5)]],
    unidades_mayoreo: [null as number | null, [Validators.min(0.001)]],
    categoria_id: [null as number | null, [Validators.required]],
    activo: [true],
    orden: [null as number | null],
  });

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private articulosSvc: ArticulosService,
    private categoriasSvc: CategoriasService,
  ) {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.articuloId = idParam ? Number(idParam) : null;
    this.mode = this.articuloId ? 'edit' : 'create';

    this.loadCategorias();
    if (this.mode === 'edit') this.loadArticulo();
  }

  get title(): string {
    return this.mode === 'create' ? 'Nuevo artículo' : 'Editar artículo';
  }

  private loadCategorias() {
    this.categoriasSvc.list().subscribe((res: any) => {
      const data = Array.isArray(res) ? res : (res?.data ?? []);
      this.categorias.set(data);
    });
  }

  private loadArticulo() {
    if (!this.articuloId) return;
    this.loading.set(true);

    this.articulosSvc.get(this.articuloId).subscribe({
      next: (res: any) => {
        const a = res?.articulo ?? res; // por si cambia la forma
        this.form.patchValue({
          nombre: a?.nombre ?? '',
          nombre_corto: a?.nombre_corto ?? '',
          unidad: a?.unidad ?? '',
          unidades_mayoreo: a?.unidades_mayoreo ?? null,
          categoria_id: a?.categoria_id ?? null,
          activo: !!a?.activo,
          orden: a?.orden ?? null,
        });
        this.imagenActual.set(a?.imagen ? `${environment.apiBaseUrl}/storage/${a.imagen}` : null);
        this.fieldErrors.set({});
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/404');
      },
    });
  }

  onImageChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.imagenFile = file;

    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => this.imagenPreview.set(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      this.imagenPreview.set(null);
    }
  }

  // helpers para errores
  hasError(field: string): boolean {
    const c = this.form.get(field);
    return !!c && c.touched && c.invalid;
  }

  errorText(field: string): string | null {
    const c = this.form.get(field);
    if (!c || !c.touched || !c.errors) return null;

    if (c.errors['required']) return 'Este campo es requerido.';
    if (c.errors['maxlength']) return 'Excede la longitud máxima.';
    return 'Campo inválido.';
  }

  backendError(field: string): string | null {
    const err = this.fieldErrors()[field];
    return err?.[0] ?? null;
  }

  submit() {
    this.fieldErrors.set({});
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.saving.set(true);

    const raw = this.form.getRawValue();

    const fd = new FormData();
    fd.append('nombre', (raw.nombre ?? '').trim());
    fd.append('nombre_corto', (raw.nombre_corto ?? '').trim());
    fd.append('unidad', raw.unidad ?? '');
    if (raw.unidades_mayoreo !== null && raw.unidades_mayoreo !== undefined) fd.append('unidades_mayoreo', String(raw.unidades_mayoreo));
    fd.append('categoria_id', String(Number(raw.categoria_id)));
    fd.append('activo', raw.activo ? '1' : '0');
    if (raw.orden !== null && raw.orden !== undefined) fd.append('orden', String(raw.orden));
    if (this.imagenFile) fd.append('imagen', this.imagenFile);

    const req =
      this.mode === 'create'
        ? this.articulosSvc.create(fd)
        : this.articulosSvc.update(this.articuloId!, fd);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/catalog/articulos'], { queryParams: this.route.snapshot.queryParams });
      },
      error: (err) => {
        this.saving.set(false);

        // Laravel 422
        if (err?.status === 422 && err?.error?.errors) {
          this.fieldErrors.set(err.error.errors as FieldErrors);
          return;
        }

        alert(err?.error?.message ?? 'Ocurrió un error al guardar.');
      },
    });
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

  cancel() {
    this.router.navigate(['/catalog/articulos'], { queryParams: this.route.snapshot.queryParams });
  }
}
