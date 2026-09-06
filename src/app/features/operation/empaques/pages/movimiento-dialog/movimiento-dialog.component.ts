import { CommonModule } from '@angular/common';
import { Component, computed, EventEmitter, Input, OnChanges, Output, signal, SimpleChanges } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ButtonDirective,
  ModalBodyComponent,
  ModalComponent,
  ModalFooterComponent,
  ModalHeaderComponent,
} from '@coreui/angular';

import { EmpaquesService } from '../../data/empaques.service';
import { Empaque, EmpaqueMovimiento } from '../../data/empaques.models';
import { ClientesService } from '../../../../catalog/clientes/data/clientes.service';
import { Cliente } from '../../../../catalog/clientes/data/clientes.models';

type FieldErrors = Record<string, string[]>;

@Component({
  selector: 'app-movimiento-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ModalComponent,
    ModalHeaderComponent,
    ModalBodyComponent,
    ModalFooterComponent,
    ButtonDirective,
  ],
  templateUrl: './movimiento-dialog.component.html',
  styleUrl: './movimiento-dialog.component.scss',
})
export class MovimientoDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() defaultClienteId: number | null = null;
  @Input() defaultEmpaqueId: number | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved         = new EventEmitter<void>();

  // ── Listas ───────────────────────────────────────────────────────────
  clientes        = signal<Cliente[]>([]);
  empaques        = signal<Empaque[]>([]);
  clientesLoading = signal(false);
  empaquesLoading = signal(false);

  // ── Picker de cliente (dropdown) ─────────────────────────────────────
  clienteNombreText   = signal('');
  clienteQuery        = signal('');
  clienteDropdownOpen = signal(false);

  filteredClientes = computed(() => {
    const q   = this.clienteQuery().toLowerCase().trim();
    const all = this.clientes();
    const hits = q ? all.filter(c => c.nombre.toLowerCase().includes(q)) : all;
    return hits.slice(0, 40);
  });

  // ── Formulario ────────────────────────────────────────────────────────
  form = this.fb.group({
    fecha:      ['',  Validators.required],
    cliente_id: [null as number | null, Validators.required],
    empaque_id: [null as number | null, Validators.required],
    tipo:       ['salida', Validators.required],
    cantidad:   [null as number | null, [Validators.required, Validators.min(0.01)]],
    notas:      [''],
  });

  saving          = signal(false);
  printing        = signal(false);
  fieldErrors     = signal<FieldErrors>({});
  errorMsg        = signal<string | null>(null);
  savedMovimiento = signal<EmpaqueMovimiento | null>(null);

  constructor(
    private fb:          FormBuilder,
    private empaquesSvc: EmpaquesService,
    private clientesSvc: ClientesService,
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible']?.currentValue === true) {
      this.onOpen();
    }
  }

  // ── Apertura ─────────────────────────────────────────────────────────

  private onOpen() {
    this.saving.set(false);
    this.printing.set(false);
    this.fieldErrors.set({});
    this.errorMsg.set(null);
    this.savedMovimiento.set(null);
    this.clienteNombreText.set('');
    this.clienteQuery.set('');
    this.clienteDropdownOpen.set(false);

    const today = new Date().toISOString().split('T')[0];

    this.form.reset({
      fecha:      today,
      cliente_id: this.defaultClienteId,
      empaque_id: this.defaultEmpaqueId,
      tipo:       'salida',
      cantidad:   null,
      notas:      '',
    });

    this.loadClientes();
    this.loadEmpaques();
  }

  private loadClientes() {
    this.clientesLoading.set(true);
    this.clientesSvc.list({ activo: true }).subscribe({
      next: (res: any) => {
        const data: Cliente[] = Array.isArray(res) ? res : (res?.data ?? []);
        this.clientes.set(data);
        this.clientesLoading.set(false);
        const id = this.defaultClienteId;
        if (id) {
          const found = data.find(c => c.id === id);
          if (found) this.clienteNombreText.set(found.nombre);
        }
      },
      error: () => this.clientesLoading.set(false),
    });
  }

  private loadEmpaques() {
    this.empaquesLoading.set(true);
    this.empaquesSvc.listEmpaques(true).subscribe({
      next: data => { this.empaques.set(data); this.empaquesLoading.set(false); },
      error: ()   => this.empaquesLoading.set(false),
    });
  }

  // ── Picker de cliente ─────────────────────────────────────────────────

  onClienteInput(valor: string) {
    this.clienteNombreText.set(valor);
    this.clienteQuery.set(valor);
    this.clienteDropdownOpen.set(true);
    if (!valor.trim()) this.form.patchValue({ cliente_id: null });
  }

  onClienteFocus() {
    this.clienteDropdownOpen.set(true);
  }

  onClienteBlur() {
    setTimeout(() => this.clienteDropdownOpen.set(false), 200);
  }

  onClienteClear() {
    this.clienteNombreText.set('');
    this.clienteQuery.set('');
    this.form.patchValue({ cliente_id: null });
    this.clienteDropdownOpen.set(true);
  }

  onClienteSelect(c: Cliente) {
    this.clienteNombreText.set(c.nombre);
    this.clienteQuery.set('');
    this.clienteDropdownOpen.set(false);
    this.form.patchValue({ cliente_id: c.id });
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  get tipoActual(): 'salida' | 'entrada' {
    return (this.form.get('tipo')?.value ?? 'salida') as 'salida' | 'entrada';
  }

  isInvalid(field: string): boolean {
    const c = this.form.get(field);
    return (!!c && c.touched && c.invalid) || !!this.fieldErrors()[field]?.length;
  }

  errorText(field: string): string | null {
    const c = this.form.get(field);
    if (!c || !c.touched || !c.errors) return null;
    if (c.errors['required']) return 'Este campo es requerido.';
    if (c.errors['min'])      return 'El valor debe ser mayor a 0.';
    return 'Campo inválido.';
  }

  backendError(field: string): string | null {
    return this.fieldErrors()[field]?.[0] ?? null;
  }

  // ── Acciones ─────────────────────────────────────────────────────────

  submit() {
    this.fieldErrors.set({});
    this.errorMsg.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.saving.set(true);
    const raw = this.form.getRawValue();

    this.empaquesSvc.registrarMovimiento({
      fecha:      raw.fecha!,
      cliente_id: Number(raw.cliente_id),
      empaque_id: Number(raw.empaque_id),
      tipo:       raw.tipo as 'salida' | 'entrada',
      cantidad:   Number(raw.cantidad),
      notas:      raw.notas?.trim() || null,
    }).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        this.savedMovimiento.set(res?.movimiento ?? null);
        this.saved.emit();
      },
      error: err => {
        this.saving.set(false);
        if (err?.status === 422 && err?.error?.errors) {
          this.fieldErrors.set(err.error.errors as FieldErrors);
          return;
        }
        this.errorMsg.set(err?.error?.message ?? 'Ocurrió un error al guardar.');
      },
    });
  }

  printTicket(cols = 48) {
    const mov = this.savedMovimiento();
    if (!mov?.id) return;
    this.printing.set(true);
    this.empaquesSvc.imprimir(mov.id, { cols }).subscribe({
      next: () => { this.printing.set(false); this.close(); },
      error: () => { this.printing.set(false); this.close(); },
    });
  }

  close() {
    if (this.saving() || this.printing()) return;
    this.savedMovimiento.set(null);
    this.visibleChange.emit(false);
  }
}
