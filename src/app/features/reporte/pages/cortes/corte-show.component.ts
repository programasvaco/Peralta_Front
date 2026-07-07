import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';

import { CajaService } from '../../data/caja.service';
import { CorteCaja, MovimientoCaja } from '../../data/caja.models';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-corte-show',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  templateUrl: './corte-show.component.html',
  styleUrl: './corte-show.component.scss',
})
export class CorteShowComponent {
  private cajaSvc = inject(CajaService);
  private route   = inject(ActivatedRoute);
  private router  = inject(Router);
  private gridApi?: GridApi;

  loading = signal(true);
  corte   = signal<CorteCaja | null>(null);
  banner  = signal<{ type: 'danger'; text: string } | null>(null);

  overlayNoRowsTemplate  = `<div class="ag-overlay-msg">Sin movimientos.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  colDefs: ColDef<MovimientoCaja>[] = [
    { headerName: 'ID', field: 'id', width: 80 },
    {
      headerName: 'Fecha',
      field: 'fecha',
      width: 130,
      valueFormatter: (p) => p.value
        ? new Date(p.value).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
        : '-',
    },
    {
      headerName: 'Tipo',
      field: 'tipo',
      width: 110,
      valueFormatter: (p) => p.value === 'entrada' ? 'Entrada' : 'Salida',
      cellStyle: (p) => ({ color: p.value === 'entrada' ? '#198754' : '#dc3545', fontWeight: 600 }),
    },
    {
      headerName: 'Cantidad',
      field: 'cantidad',
      width: 130,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
    },
    { headerName: 'Referencia', field: 'referencia', flex: 1, minWidth: 200 },
    {
      headerName: 'Usuario',
      valueGetter: (p) => p.data?.user?.name ?? '-',
      width: 160,
    },
  ];

  totalEntradas = signal(0);
  totalSalidas  = signal(0);

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    this.cajaSvc.showCorte(id).subscribe({
      next: (c) => {
        this.corte.set(c);
        this.loading.set(false);

        const movs = c.movimientos ?? [];
        this.totalEntradas.set(movs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + Number(m.cantidad), 0));
        this.totalSalidas.set(movs.filter(m => m.tipo === 'salida').reduce((s, m) => s + Number(m.cantidad), 0));
      },
      error: () => {
        this.loading.set(false);
        this.banner.set({ type: 'danger', text: 'No se pudo cargar el corte.' });
      },
    });
  }

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
    const movs = this.corte()?.movimientos ?? [];
    if (!movs.length) this.gridApi?.showNoRowsOverlay();
  }

  volver() {
    this.router.navigate(['/reporte/cortes']);
  }

  imprimir() {
    window.print();
  }
}
