import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { AgGridAngular } from 'ag-grid-angular';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';

import { VentasListService } from '../../data/ventas-list.service';
import { AlmacenesService } from '../../../../settings/pages/almacenes/data/almacenes.service';
import { VentaListItem, PaginatedResponse } from '../../data/ventas-list.models';
import { Almacen } from '../../../../settings/pages/almacenes/data/almacenes.models';
import { formatDate, getTodayString } from '../../../../../shared/utils/date.utils';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-ventas-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AgGridAngular],
  templateUrl: './ventas-list.component.html',
  styleUrl: './ventas-list.component.scss',
})
export class VentasListComponent {
  private ventasSvc    = inject(VentasListService);
  private almacenesSvc = inject(AlmacenesService);
  private router       = inject(Router);
  private destroyRef   = inject(DestroyRef);
  private gridApi?: GridApi;

  almacenes = signal<Almacen[]>([]);
  rows      = signal<VentaListItem[]>([]);
  total     = signal(0);
  banner    = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(null);

  private today(): string {
    return getTodayString();
  }

  filtros = new FormGroup({
    almacen_id: new FormControl<number | null>(null),
    fecha:      new FormControl<string | null>(this.today()),
  });

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  overlayNoRowsTemplate  = `<div class="ag-overlay-msg">No hay ventas para mostrar.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  colDefs: ColDef<VentaListItem>[] = [
    {
      headerName: 'Folio',
      field: 'id',
      width: 90,
      valueFormatter: (p) => `#${p.value}`,
      cellStyle: { fontWeight: 600 },
    },
    {
      headerName: 'Fecha',
      field: 'fecha',
      width: 130,
      valueFormatter: (p) => formatDate(p.value),
    },
    {
      headerName: 'Cliente',
      valueGetter: (p) => p.data?.cliente?.nombre ?? `Cliente #${p.data?.cliente_id}`,
      flex: 1,
      minWidth: 180,
    },
    {
      headerName: 'Almacén',
      valueGetter: (p) => p.data?.almacen?.descripcion ?? '-',
      minWidth: 150,
    },
    {
      headerName: 'Forma de pago',
      valueGetter: (p) => p.data?.forma_pago?.descripcion ?? '-',
      minWidth: 140,
    },
    {
      headerName: 'Total',
      field: 'total',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
    },
    {
      headerName: 'Estatus',
      field: 'estatus',
      width: 110,
      valueFormatter: (p) => this.estatusLabel(p.value),
      cellStyle: (p) => ({ color: this.estatusColor(p.value), fontWeight: 600 }),
    },
    {
      headerName: 'Acciones',
      width: 120,
      sortable: false,
      resizable: false,
      cellRenderer: () =>
        `<div class="ag-cell-actions">
          <button class="btn btn-light btn-sm" data-action="ver">Ver</button>
          <button class="btn btn-outline-secondary btn-sm" data-action="imprimir" title="Imprimir">&#128438;</button>
        </div>`,
    },
  ];

  constructor() {
    this.loadAlmacenes();

    this.filtros.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload());
  }

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
    this.reload();
  }

  onCellClicked(e: CellClickedEvent<VentaListItem>) {
    const target = e.event?.target as HTMLElement;
    const btn    = target?.closest('[data-action]') as HTMLElement | null;
    const action = btn?.dataset['action'];
    if (!e.data || !action) return;

    if (action === 'ver')      this.ver(e.data);
    if (action === 'imprimir') this.imprimir(e.data);
  }

  reload() {
    this.banner.set(null);
    this.gridApi?.showLoadingOverlay();

    const f = this.filtros.getRawValue();

    this.ventasSvc.list({ fecha: f.fecha, almacen_id: f.almacen_id }).subscribe({
      next: (res: any) => {
        let data: VentaListItem[];

        if (Array.isArray(res)) {
          data = [...res].sort((a, b) => b.id - a.id);
          this.total.set(res.length);
        } else {
          const pag = res as PaginatedResponse<VentaListItem>;
          data = pag.data ?? [];
          this.total.set(pag.total ?? data.length);
        }

        this.rows.set(data);

        if (!data.length) this.gridApi?.showNoRowsOverlay();
        else              this.gridApi?.hideOverlay();
      },
      error: () => {
        this.gridApi?.hideOverlay();
        this.banner.set({ type: 'danger', text: 'No se pudieron cargar las ventas.' });
      },
    });
  }

  loadAlmacenes() {
    this.almacenesSvc.list({ activo: true }).subscribe({
      next: (res: Almacen[]) => this.almacenes.set(res),
    });
  }

  clearFilters() {
    this.filtros.reset({ almacen_id: null, fecha: this.today() });
  }

  private ver(item: VentaListItem) {
    this.router.navigate(['/operation/ventas', item.id, 'ver']);
  }

  private imprimir(item: VentaListItem) {
    this.router.navigate(['/operation/ventas', item.id, 'ver'], {
      queryParams: { print: '1' },
    });
  }

  private estatusLabel(estatus?: string | null): string {
    const s = (estatus ?? 'activa').toLowerCase();
    if (s === 'cancelada') return 'Cancelada';
    if (s === 'credito')   return 'Crédito';
    return 'Pagada';
  }

  private estatusColor(estatus?: string | null): string {
    const s = (estatus ?? 'activa').toLowerCase();
    if (s === 'cancelada') return '#dc3545';
    if (s === 'credito')   return '#f9b115';
    return '#198754';
  }
}
