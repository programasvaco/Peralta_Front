import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { InventarioService } from '../../data/inventario.service';
import { Almacen, InventarioRow } from '../../data/inventario.models';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  templateUrl: './inventario.component.html',
  styleUrl: './inventario.component.scss',
})
export class InventarioComponent {
  private gridApi?: GridApi;

  // filtros
  search = signal('');
  almacenId = signal<number | null>(null);
  stockBajo = signal(false);

  // paginación
  page = signal(1);
  pageSize = signal(25);
  total = signal(0);
  lastPage = signal(1);

  // data
  rows = signal<InventarioRow[]>([]);
  almacenes = signal<Almacen[]>([]);

  banner = signal<{ type: 'danger'; text: string } | null>(null);

  private search$ = new Subject<string>();

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  overlayNoRowsTemplate = `<div class="ag-overlay-msg">No hay registros de inventario para mostrar.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  colDefs: ColDef<InventarioRow>[] = [
    {
      headerName: 'Artículo',
      valueGetter: (p) => p.data?.articulo?.nombre ?? '-',
      flex: 1,
      minWidth: 200,
    },
    {
      headerName: 'Nombre corto',
      valueGetter: (p) => p.data?.articulo?.nombre_corto ?? '-',
      width: 140,
    },
    {
      headerName: 'Almacén',
      valueGetter: (p) => p.data?.almacen?.nombre ?? '-',
      width: 150,
    },
    { headerName: 'Variedad', field: 'variedad', width: 130,
      valueFormatter: (p) => p.value ?? '-' },
    {
      headerName: 'Existencia',
      field: 'existencia',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(2) : '-',
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
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
    },
    {
      headerName: 'Precio mín.',
      field: 'precio_min',
      width: 115,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
    },
    {
      headerName: 'Costo',
      field: 'costo',
      width: 110,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
    },
    {
      headerName: 'Empaque',
      field: 'empaque',
      width: 110,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(2) : '-',
    },
  ];

  constructor(
    private inventarioSvc: InventarioService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    const qp = this.route.snapshot.queryParams;
    if (qp['search'])     this.search.set(String(qp['search']));
    if (qp['almacen_id']) this.almacenId.set(Number(qp['almacen_id']));
    if (qp['stock_bajo']) this.stockBajo.set(qp['stock_bajo'] === 'true');
    if (qp['page'])       this.page.set(Number(qp['page']));
    if (qp['per_page'])   this.pageSize.set(Number(qp['per_page']));

    this.search$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((v) => {
        this.search.set(v);
        this.page.set(1);
        this.syncQueryParams();
        this.reload();
      });
  }

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
    this.loadAlmacenes();
    this.reload();
  }

  private loadAlmacenes() {
    this.inventarioSvc.almacenes().subscribe({
      next: (data) => this.almacenes.set(data),
      error: () => {},
    });
  }

  reload() {
    this.banner.set(null);
    this.gridApi?.showLoadingOverlay();

    this.inventarioSvc.list({
      page: this.page(),
      per_page: this.pageSize(),
      search: this.search() || undefined,
      almacen_id: this.almacenId(),
      stock_bajo: this.stockBajo() || undefined,
    }).subscribe({
      next: (res) => {
        this.rows.set(res.data);
        this.total.set(res.total);
        this.lastPage.set(res.last_page ?? 1);

        if (!res.data?.length) {
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

  onSearch(v: string) { this.search$.next(v); }

  onAlmacen(v: string) {
    this.almacenId.set(v ? Number(v) : null);
    this.page.set(1);
    this.syncQueryParams();
    this.reload();
  }

  onStockBajo(checked: boolean) {
    this.stockBajo.set(checked);
    this.page.set(1);
    this.syncQueryParams();
    this.reload();
  }

  onPageSize(v: string) {
    this.pageSize.set(Number(v));
    this.page.set(1);
    this.syncQueryParams();
    this.reload();
  }

  prevPage() {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      this.syncQueryParams();
      this.reload();
    }
  }

  nextPage() {
    if (this.page() < this.lastPage()) {
      this.page.set(this.page() + 1);
      this.syncQueryParams();
      this.reload();
    }
  }

  private syncQueryParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: this.search() || undefined,
        almacen_id: this.almacenId() ?? undefined,
        stock_bajo: this.stockBajo() ? 'true' : undefined,
        page: this.page(),
        per_page: this.pageSize(),
      },
      replaceUrl: true,
    });
  }
}
