import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { Almacen, InventarioItem, InventoryApi } from '../../data-access/inventory.api';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-existencia',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  templateUrl: './existencia.component.html',
  styleUrl: './existencia.component.scss',
})
export class ExistenciaComponent {
  private gridApi?: GridApi;

  almacenes = signal<Almacen[]>([]);
  almacenId = signal<number | null>(null);
  soloConStock = signal(true);

  rows = signal<InventarioItem[]>([]);
  loading = signal(false);
  banner = signal<{ type: 'danger'; text: string } | null>(null);

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  overlayNoRowsTemplate = `<div class="ag-overlay-msg">Sin registros de existencia.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  colDefs: ColDef<InventarioItem>[] = [
    {
      headerName: 'Artículo',
      valueGetter: (p) => p.data?.articulo?.nombre ?? '-',
      flex: 1,
      minWidth: 200,
    },
    {
      headerName: 'Corto',
      valueGetter: (p) => p.data?.articulo?.nombre_corto ?? '-',
      width: 130,
    },
    {
      headerName: 'Categoría',
      valueGetter: (p) => p.data?.articulo?.categoria?.descripcion ?? '-',
      width: 160,
    },
    {
      headerName: 'Variedad',
      field: 'variedad',
      width: 130,
      valueFormatter: (p) => p.value ?? '-',
    },
    {
      headerName: 'Existencia',
      field: 'existencia',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p) => Number(p.value).toFixed(2),
      cellStyle: (p) => Number(p.value) <= 10 ? { color: '#dc3545', fontWeight: 600 } : null,
    },
    {
      headerName: 'Unidad',
      valueGetter: (p) => p.data?.articulo?.unidad ?? '-',
      width: 90,
    },
    {
      headerName: 'Precio',
      field: 'precio',
      width: 110,
      type: 'rightAligned',
      valueFormatter: (p) => `$${Number(p.value).toFixed(2)}`,
    },
    {
      headerName: 'Precio mín.',
      field: 'precio_min',
      width: 115,
      type: 'rightAligned',
      valueFormatter: (p) => `$${Number(p.value).toFixed(2)}`,
    },
    {
      headerName: 'Costo',
      field: 'costo',
      width: 110,
      type: 'rightAligned',
      valueFormatter: (p) => `$${Number(p.value).toFixed(2)}`,
    },
    {
      headerName: 'Empaque',
      field: 'empaque',
      width: 110,
      type: 'rightAligned',
      valueFormatter: (p) => Number(p.value).toFixed(2),
    },
  ];

  constructor(private api: InventoryApi) {}

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
    this.loadAlmacenes();
  }

  private loadAlmacenes() {
    this.api.almacenes().subscribe({
      next: (data) => {
        this.almacenes.set(data);
        if (data.length > 0) {
          this.almacenId.set(data[0].id);
          this.reload();
        }
      },
      error: () => {
        this.banner.set({ type: 'danger', text: 'No se pudieron cargar los almacenes.' });
      },
    });
  }

  reload() {
    const id = this.almacenId();
    if (!id) return;

    this.banner.set(null);
    this.gridApi?.showLoadingOverlay();

    this.api.inventarioPorAlmacen(id, this.soloConStock()).subscribe({
      next: (data) => {
        this.rows.set(data);
        if (!data.length) {
          this.gridApi?.showNoRowsOverlay();
        } else {
          this.gridApi?.hideOverlay();
        }
      },
      error: () => {
        this.gridApi?.hideOverlay();
        this.banner.set({ type: 'danger', text: 'No se pudo cargar el inventario.' });
      },
    });
  }

  onAlmacen(value: string) {
    this.almacenId.set(value ? Number(value) : null);
    this.reload();
  }

  onSoloConStock(checked: boolean) {
    this.soloConStock.set(checked);
    this.reload();
  }
}
