import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent, SelectionChangedEvent } from 'ag-grid-community';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';

import { HasPermissionDirective } from '../../../../../core/directives/has-permission.directive';
import { FormasPagoService } from '../../data/formas-pago.service';
import { FormaPago } from '../../data/formas-pago.models';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-formas-pago-list',
  standalone: true,
  imports: [CommonModule, AgGridAngular, HasPermissionDirective],
  templateUrl: './formas-pago-list.component.html',
  styleUrl: './formas-pago-list.component.scss',
})
export class FormasPagoListComponent {
  private gridApi?: GridApi;

  // filtros (mismo patrón que Clientes)
  search = signal('');
  activoFilter = signal<'all' | 'true' | 'false'>('all');

  page = signal(1);
  pageSize = signal(25);
  total = signal(0);
  lastPage = signal(1);

  rows = signal<FormaPago[]>([]);
  selectedId = signal<number | null>(null);

  banner = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(null);

  // cache del backend (como index devuelve array)
  private allRows: FormaPago[] = [];

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  colDefs: ColDef<FormaPago>[] = [
    { headerName: 'ID', field: 'id', width: 90 },
    { headerName: 'Descripción', field: 'descripcion', flex: 1, minWidth: 320 },
    {
      headerName: 'Activo',
      field: 'activo',
      width: 110,
      valueFormatter: (p) => (p.value ? 'Sí' : 'No'),
    },
  ];

  overlayNoRowsTemplate = `<div class="ag-overlay-msg">No hay formas de pago para mostrar.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  private search$ = new Subject<string>();

  constructor(
    private svc: FormasPagoService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    const qp = this.route.snapshot.queryParams;

    if (qp['search']) this.search.set(String(qp['search']));
    if (qp['activo']) this.activoFilter.set(String(qp['activo']) as any);
    if (qp['page']) this.page.set(Number(qp['page']));
    if (qp['per_page']) this.pageSize.set(Number(qp['per_page']));

    this.search$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((value) => {
        this.search.set(value);
        this.page.set(1);
        this.syncQueryParams();
        this.applyClientFilters();
      });
  }

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
    this.reload();
  }

  onSelectionChanged(e: SelectionChangedEvent) {
    const row = e.api.getSelectedRows()?.[0] as FormaPago | undefined;
    this.selectedId.set(row?.id ?? null);
  }

  reload() {
    this.banner.set(null);
    this.selectedId.set(null);
    this.gridApi?.deselectAll();
    this.gridApi?.showLoadingOverlay();

    this.svc.list().subscribe({
      next: (data) => {
        this.allRows = Array.isArray(data) ? data : [];
        this.applyClientFilters();
      },
      error: () => {
        this.gridApi?.hideOverlay();
        this.banner.set({ type: 'danger', text: 'No se pudo cargar el listado.' });
      },
    });
  }

  private applyClientFilters() {
    const q = (this.search() ?? '').trim().toLowerCase();
    const activo = this.activoFilter();

    let filtered = [...this.allRows];

    if (q) {
      filtered = filtered.filter((x) =>
        (x.descripcion ?? '').toLowerCase().includes(q),
      );
    }

    if (activo !== 'all') {
      const isActive = activo === 'true';
      filtered = filtered.filter((x) => !!x.activo === isActive);
    }

    // paginación en frontend (misma UI que Clientes)
    const total = filtered.length;
    const per = this.pageSize();
    const last = Math.max(1, Math.ceil(total / per));
    let current = this.page();
    if (current > last) current = last;

    const start = (current - 1) * per;
    const paged = filtered.slice(start, start + per);

    this.page.set(current);
    this.total.set(total);
    this.lastPage.set(last);
    this.rows.set(paged);

    if (!paged.length) this.gridApi?.showNoRowsOverlay();
    else this.gridApi?.hideOverlay();
  }

  onSearch(v: string) {
    this.search$.next(v);
  }

  onActivo(v: string) {
    this.activoFilter.set(v as any);
    this.page.set(1);
    this.syncQueryParams();
    this.applyClientFilters();
  }

  onPageSize(v: string) {
    this.pageSize.set(Number(v));
    this.page.set(1);
    this.syncQueryParams();
    this.applyClientFilters();
  }

  prevPage() {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      this.syncQueryParams();
      this.applyClientFilters();
    }
  }

  nextPage() {
    if (this.page() < this.lastPage()) {
      this.page.set(this.page() + 1);
      this.syncQueryParams();
      this.applyClientFilters();
    }
  }

  goNew() {
    this.router.navigate(['/catalog/formas-pago/nuevo'], { queryParams: this.route.snapshot.queryParams });
  }

  goEdit() {
    const id = this.selectedId();
    if (!id) return;
    this.router.navigate(['/catalog/formas-pago', id, 'editar'], { queryParams: this.route.snapshot.queryParams });
  }

  private syncQueryParams() {
    const qp: any = {
      search: this.search() || undefined,
      activo: this.activoFilter() !== 'all' ? this.activoFilter() : undefined,
      page: this.page(),
      per_page: this.pageSize(),
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: qp,
      replaceUrl: true,
    });
  }
}