import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { CellClickedEvent, ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';

import { CajaService } from '../../data/caja.service';
import { CorteCaja } from '../../data/caja.models';
import { AlmacenesService } from '../../../settings/pages/almacenes/data/almacenes.service';
import { Almacen } from '../../../settings/pages/almacenes/data/almacenes.models';
import { formatDate } from '../../../../shared/utils/date.utils';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../shared/utils/ag-grid-defaults';
import { CortesListStateService } from './cortes-list-state.service';

@Component({
  selector: 'app-cortes-list',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  templateUrl: './cortes-list.component.html',
  styleUrl: './cortes-list.component.scss',
})
export class CortesListComponent {
  private cajaSvc     = inject(CajaService);
  private almacenesSvc = inject(AlmacenesService);
  private router      = inject(Router);
  private stateSvc    = inject(CortesListStateService);
  private gridApi?: GridApi;

  rows      = signal<CorteCaja[]>([]);
  total     = signal(0);
  banner    = signal<{ type: 'success' | 'danger'; text: string } | null>(null);
  almacenes = signal<Almacen[]>([]);

  private now  = new Date();
  mes       = signal(this.stateSvc.state.mes);
  anio      = signal(this.stateSvc.state.anio);
  almacenId = signal<number | null>(this.stateSvc.state.almacenId);

  constructor() {
    this.almacenesSvc.list({ activo: true }).subscribe((res) => this.almacenes.set(res));
  }

  overlayNoRowsTemplate  = `<div class="ag-overlay-msg">No hay cortes para mostrar.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  colDefs: ColDef<CorteCaja>[] = [
    {
      headerName: '#',
      field: 'id',
      width: 80,
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
      headerName: 'Importe',
      field: 'importe',
      width: 140,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
      cellStyle: (p) => ({ color: Number(p.value) >= 0 ? '#198754' : '#dc3545', fontWeight: 600 }),
    },
    {
      headerName: 'Almacén',
      valueGetter: (p) => p.data?.almacen?.descripcion ?? '-',
      width: 160,
    },
    {
      headerName: 'Cerrado por',
      valueGetter: (p) => p.data?.user?.name ?? '-',
      flex: 1,
      minWidth: 160,
    },
    {
      headerName: '',
      width: 90,
      sortable: false,
      resizable: false,
      cellRenderer: () =>
        `<div class="ag-cell-actions">
          <button class="btn btn-light btn-sm" data-action="ver">Ver</button>
        </div>`,
    },
  ];

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
    this.reload();
  }

  onCellClicked(e: CellClickedEvent<CorteCaja>) {
    const target = e.event?.target as HTMLElement;
    const btn    = target?.closest('[data-action]') as HTMLElement | null;
    if (!e.data || btn?.dataset['action'] !== 'ver') return;
    this.router.navigate(['/reporte/cortes', e.data.id]);
  }

  reload() {
    this.banner.set(null);
    this.gridApi?.showLoadingOverlay();

    this.cajaSvc.cortes({
      mes:        this.mes(),
      anio:       this.anio(),
      almacen_id: this.almacenId() ?? undefined,
    }).subscribe({
      next: (res: any) => {
        const data: CorteCaja[] = Array.isArray(res) ? res : (res?.data ?? []);
        this.rows.set(data);
        this.total.set(data.length);

        if (!data.length) this.gridApi?.showNoRowsOverlay();
        else              this.gridApi?.hideOverlay();
      },
      error: () => {
        this.gridApi?.hideOverlay();
        this.banner.set({ type: 'danger', text: 'No se pudieron cargar los cortes.' });
      },
    });
  }

  onMes(v: string)     { this.mes.set(Number(v));           this.persistState(); this.reload(); }
  onAnio(v: string)    { this.anio.set(Number(v));          this.persistState(); this.reload(); }
  onAlmacen(v: string) { this.almacenId.set(v ? Number(v) : null); this.persistState(); this.reload(); }

  private persistState() {
    this.stateSvc.state = { mes: this.mes(), anio: this.anio(), almacenId: this.almacenId() };
  }

  meses = [
    { v: 1, l: 'Enero' }, { v: 2, l: 'Febrero' }, { v: 3, l: 'Marzo' },
    { v: 4, l: 'Abril' }, { v: 5, l: 'Mayo' },    { v: 6, l: 'Junio' },
    { v: 7, l: 'Julio' }, { v: 8, l: 'Agosto' },  { v: 9, l: 'Septiembre' },
    { v: 10, l: 'Octubre' }, { v: 11, l: 'Noviembre' }, { v: 12, l: 'Diciembre' },
  ];

  anios: number[] = Array.from({ length: 5 }, (_, i) => this.now.getFullYear() - i);

  irACaja() {
    this.router.navigate(['/reporte/caja']);
  }
}
