import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { EmpaquesService } from '../../data/empaques.service';
import { Empaque } from '../../data/empaques.models';

type FieldErrors = Record<string, string[]>;

@Component({
  selector: 'app-empaque-form',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './empaque-form.component.html',
  styleUrl: './empaque-form.component.scss',
})
export class EmpaqueFormComponent {
  loading = signal(false);
  saving  = signal(false);

  empaqueId: number | null = null;
  mode: 'create' | 'edit' = 'create';

  fieldErrors = signal<FieldErrors>({});

  form = this.fb.group({
    descripcion: ['', [Validators.required, Validators.maxLength(100)]],
    dimensiones: ['', [Validators.maxLength(100)]],
    peso:        [null as number | null, [Validators.min(0)]],
    existencias: [0,   [Validators.required, Validators.min(0)]],
    activo:      [true],
  });

  constructor(
    private fb:     FormBuilder,
    private route:  ActivatedRoute,
    private router: Router,
    private svc:    EmpaquesService,
  ) {
    const idParam = this.route.snapshot.paramMap.get('id');
    this.empaqueId = idParam ? Number(idParam) : null;
    this.mode      = this.empaqueId ? 'edit' : 'create';

    if (this.mode === 'edit') this.loadEmpaque();
  }

  get title(): string {
    return this.mode === 'create' ? 'Nuevo empaque' : 'Editar empaque';
  }

  private loadEmpaque() {
    if (!this.empaqueId) return;
    this.loading.set(true);

    this.svc.get(this.empaqueId).subscribe({
      next: res => {
        const e: Empaque = (res as any)?.empaque ?? res;

        this.form.patchValue({
          descripcion: e.descripcion ?? '',
          dimensiones: e.dimensiones ?? '',
          peso:        e.peso ?? null,
          existencias: e.existencias ?? 0,
          activo:      !!e.activo,
        });

        this.fieldErrors.set({});
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/404');
      },
    });
  }

  // ── Validaciones ─────────────────────────────────────────────────────────

  errorText(field: string): string | null {
    const c = this.form.get(field);
    if (!c || !c.touched || !c.errors) return null;
    if (c.errors['required']) return 'Este campo es requerido.';
    if (c.errors['maxlength']) return 'Excede la longitud máxima.';
    if (c.errors['min']) return 'El valor no puede ser negativo.';
    return 'Campo inválido.';
  }

  backendError(field: string): string | null {
    return this.fieldErrors()[field]?.[0] ?? null;
  }

  isInvalid(field: string): boolean {
    const c       = this.form.get(field);
    const backend = !!this.fieldErrors()[field]?.length;
    return (!!c && c.touched && c.invalid) || backend;
  }

  clearBackendError(field: string) {
    const errs = { ...this.fieldErrors() };
    if (errs[field]) { delete errs[field]; this.fieldErrors.set(errs); }
  }

  // ── Acciones ─────────────────────────────────────────────────────────────

  submit() {
    this.fieldErrors.set({});
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.saving.set(true);

    const raw = this.form.getRawValue();
    const payload: Partial<Empaque> = {
      descripcion: (raw.descripcion ?? '').trim(),
      dimensiones: (raw.dimensiones ?? '').trim() || undefined,
      peso:        raw.peso ?? undefined,
      existencias: raw.existencias ?? 0,
      activo:      !!raw.activo,
    };

    const req = this.mode === 'create'
      ? this.svc.create(payload)
      : this.svc.update(this.empaqueId!, payload);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/catalog/empaques'], { queryParams: this.route.snapshot.queryParams });
      },
      error: err => {
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
    this.router.navigate(['/catalog/empaques'], { queryParams: this.route.snapshot.queryParams });
  }
}
