import { CommonModule } from '@angular/common';
import { Component, OnInit, signal, computed } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';

import { EmpaquesService } from '../../data/empaques.service';
import { Empaque, EmpaqueClienteSaldo, EmpaqueMovimiento } from '../../data/empaques.models';
import { MovimientoDialogComponent } from '../movimiento-dialog/movimiento-dialog.component';
import { getTodayString } from '../../../../../shared/utils/date.utils';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-empaques-saldos',
  standalone: true,
  imports: [CommonModule, AgGridAngular, MovimientoDialogComponent],
  templateUrl: './empaques-saldos.component.html',
  styleUrl: './empaques-saldos.component.scss',
})
export class EmpaquesSaldosComponent implements OnInit {

  // ── Estado panel izquierdo ────────────────────────────────────────────
  empaques       = signal<Empaque[]>([]);
  filterEmpaque  = signal<number | null>(null);
  searchText     = signal('');

  allSaldos      = signal<EmpaqueClienteSaldo[]>([]);
  loadingSaldos  = signal(false);
  errorSaldos    = signal<string | null>(null);

  filteredSaldos = computed(() => {
    const txt = this.searchText().toLowerCase().trim();
    const rows = this.allSaldos();
    return txt
      ? rows.filter(s => s.cliente?.nombre?.toLowerCase().includes(txt))
      : rows;
  });

  selectedSaldo = signal<EmpaqueClienteSaldo | null>(null);

  // ── Dialog de movimiento ──────────────────────────────────────────────
  movDialogVisible = signal(false);

  openMovDialog() {
    this.movDialogVisible.set(true);
  }

  onMovimientoSaved() {
    // Refrescar saldos (panel izquierdo)
    this.loadSaldos();
    // Refrescar movimientos del cliente visible (panel derecho)
    if (this.selectedSaldo()) {
      this.loadMovimientos();
    }
  }

  // ── Estado panel derecho ──────────────────────────────────────────────
  movimientos       = signal<EmpaqueMovimiento[]>([]);
  loadingMov        = signal(false);
  errorMov          = signal<string | null>(null);
  filterTipo        = signal<'salida' | 'entrada' | ''>('');

  // Rango de fechas del reporte (por defecto: último mes al seleccionar cliente)
  fechaInicio       = signal('');
  fechaFin          = signal('');
  printingReporte   = signal(false);
  errorReporte      = signal<string | null>(null);

  private movGridApi?: GridApi;
  private search$   = new Subject<string>();

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  colDefsMov: ColDef<EmpaqueMovimiento>[] = [
    { headerName: 'Folio',    field: 'folio',    width: 120 },
    {
      headerName: 'Fecha',
      field: 'fecha',
      width: 110,
      valueFormatter: p => {
        if (!p.value) return '';
        const iso = String(p.value).substring(0, 10);
        return new Date(iso + 'T00:00:00').toLocaleDateString('es-MX');
      },
    },
    {
      headerName: 'Empaque',
      valueGetter: p => p.data?.empaque?.descripcion ?? '-',
      flex: 1,
      minWidth: 140,
    },
    {
      headerName: 'Tipo',
      field: 'tipo',
      width: 110,
      cellClass: p => p.value === 'salida' ? 'tipo-salida' : 'tipo-entrada',
      valueFormatter: p => p.value === 'salida' ? 'Salida' : 'Entrada',
    },
    {
      headerName: 'Cantidad',
      field: 'cantidad',
      width: 110,
      type: 'numericColumn',
      valueFormatter: p => typeof p.value === 'number' ? p.value.toFixed(0) : '-',
    },
    {
      headerName: 'Notas',
      field: 'notas',
      flex: 1,
      minWidth: 160,
      valueFormatter: p => p.value ?? '',
    },
  ];

  overlayNoRows    = `<div class="ag-overlay-msg">Sin movimientos.</div>`;
  overlayLoading   = `<div class="ag-overlay-msg">Cargando...</div>`;

  constructor(
    private svc: EmpaquesService,
  ) {}

  ngOnInit() {
    this.svc.listEmpaques().subscribe({
      next: data => this.empaques.set(data),
    });

    this.loadSaldos();

    this.search$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(v => this.searchText.set(v));
  }

  // ── Panel izquierdo ───────────────────────────────────────────────────

  loadSaldos() {
    this.loadingSaldos.set(true);
    this.errorSaldos.set(null);

    this.svc.saldos({
      empaque_id: this.filterEmpaque(),
      con_saldo: true,
    }).subscribe({
      next: data => {
        this.allSaldos.set(data);
        this.loadingSaldos.set(false);

        // Actualizar saldo del cliente seleccionado si sigue en la lista
        const sel = this.selectedSaldo();
        if (sel) {
          const updated = data.find(
            s => s.cliente_id === sel.cliente_id && s.empaque_id === sel.empaque_id
          );
          this.selectedSaldo.set(updated ?? null);
        }
      },
      error: () => {
        this.loadingSaldos.set(false);
        this.errorSaldos.set('No se pudo cargar el listado de saldos.');
      },
    });
  }

  onSearch(value: string) {
    this.search$.next(value);
  }

  onEmpaqueFilter(value: string) {
    this.filterEmpaque.set(value ? Number(value) : null);
    this.selectedSaldo.set(null);
    this.movimientos.set([]);
    this.loadSaldos();
  }

  selectSaldo(s: EmpaqueClienteSaldo) {
    this.selectedSaldo.set(s);
    this.filterTipo.set('');
    this.errorReporte.set(null);

    // Al seleccionar un cliente, por defecto se muestran los movimientos del último mes
    const hoy = new Date();
    const haceUnMes = new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate());
    this.fechaInicio.set(this.toDateStr(haceUnMes));
    this.fechaFin.set(getTodayString());

    this.loadMovimientos();
  }

  // ── Panel derecho ─────────────────────────────────────────────────────

  loadMovimientos() {
    const sel = this.selectedSaldo();
    if (!sel) return;

    this.loadingMov.set(true);
    this.errorMov.set(null);
    this.movGridApi?.showLoadingOverlay();

    this.svc.movimientos({
      cliente_id: sel.cliente_id,
      tipo: this.filterTipo() || null,
      fecha_inicio: this.fechaInicio() || null,
      fecha_fin: this.fechaFin() || null,
    }).subscribe({
      next: data => {
        this.movimientos.set(data);
        this.loadingMov.set(false);
        if (data.length === 0) this.movGridApi?.showNoRowsOverlay();
        else this.movGridApi?.hideOverlay();
      },
      error: () => {
        this.loadingMov.set(false);
        this.errorMov.set('No se pudieron cargar los movimientos.');
        this.movGridApi?.hideOverlay();
      },
    });
  }

  onTipoFilter(value: string) {
    this.filterTipo.set(value as any);
    this.loadMovimientos();
  }

  onFechaInicio(value: string) {
    this.fechaInicio.set(value);
    this.loadMovimientos();
  }

  onFechaFin(value: string) {
    this.fechaFin.set(value);
    this.loadMovimientos();
  }

  onMovGridReady(e: GridReadyEvent) {
    this.movGridApi = e.api;
  }

  // ── Reporte impreso (ESC/POS) ──────────────────────────────────────────

  imprimirReporte() {
    const sel = this.selectedSaldo();
    if (!sel || !this.fechaInicio() || !this.fechaFin()) return;

    this.printingReporte.set(true);
    this.errorReporte.set(null);

    this.svc.imprimirReporte({
      cliente_id: sel.cliente_id,
      empaque_id: sel.empaque_id,
      fecha_inicio: this.fechaInicio(),
      fecha_fin: this.fechaFin(),
    }).subscribe({
      next: () => {
        this.printingReporte.set(false);
      },
      error: () => {
        this.printingReporte.set(false);
        this.errorReporte.set('No se pudo generar el reporte.');
      },
    });
  }

  private toDateStr(d: Date): string {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  saldoClass(saldo: number): string {
    if (saldo > 0) return 'saldo-deuda';
    if (saldo < 0) return 'saldo-favor';
    return 'saldo-cero';
  }

  saldoLabel(saldo: number): string {
    return saldo > 0 ? `+${saldo}` : String(saldo);
  }

  get empaqueNombre(): string {
    const id = this.filterEmpaque();
    if (!id) return '';
    return this.empaques().find(e => e.id === id)?.descripcion ?? '';
  }
}
