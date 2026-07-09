import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent, SelectionChangedEvent } from 'ag-grid-community';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import {
  ButtonDirective,
  ModalBodyComponent,
  ModalComponent,
  ModalFooterComponent,
  ModalHeaderComponent,
} from '@coreui/angular';

import { HasPermissionDirective } from '../../../../../core/directives/has-permission.directive';
import { EmpleadosService } from '../../data/empleados.service';
import { Empleado } from '../../data/empleados.models';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-empleados-list',
  standalone: true,
  imports: [
    CommonModule,
    AgGridAngular,
    HasPermissionDirective,
    ModalComponent,
    ModalHeaderComponent,
    ModalBodyComponent,
    ModalFooterComponent,
    ButtonDirective,
  ],
  templateUrl: './empleados-list.component.html',
  styleUrl: './empleados-list.component.scss',
})
export class EmpleadosListComponent {
  private gridApi?: GridApi;
  private allRows: Empleado[] = [];

  search = signal('');
  activoFilter = signal<'all' | 'true' | 'false'>('all');

  page = signal(1);
  pageSize = signal(25);
  total = signal(0);
  lastPage = signal(1);

  rows = signal<Empleado[]>([]);
  selectedId = signal<number | null>(null);

  banner = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(null);

  deleteModalVisible = signal(false);
  deleting = signal(false);

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  colDefs: ColDef<Empleado>[] = [
    { headerName: 'ID', field: 'id', width: 90 },
    { headerName: 'Nombre', field: 'nombre', flex: 1, minWidth: 260 },
    {
      headerName: 'Activo',
      field: 'activo',
      width: 110,
      valueFormatter: (p) => (p.value ? 'Sí' : 'No'),
    },
  ];

  overlayNoRowsTemplate = `<div class="ag-overlay-msg">No hay empleados para mostrar.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  private search$ = new Subject<string>();

  constructor(
    private svc: EmpleadosService,
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
    const row = e.api.getSelectedRows()?.[0] as Empleado | undefined;
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
      filtered = filtered.filter((x) => (x.nombre ?? '').toLowerCase().includes(q));
    }

    if (activo !== 'all') {
      const isActive = activo === 'true';
      filtered = filtered.filter((x) => !!x.activo === isActive);
    }

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

  onSearch(v: string) { this.search$.next(v); }

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

  openDeleteModal() {
    if (!this.selectedId()) return;
    this.deleteModalVisible.set(true);
  }

  closeDeleteModal() {
    this.deleteModalVisible.set(false);
  }

  confirmDelete() {
    const id = this.selectedId();
    if (!id) return;

    this.deleting.set(true);
    this.svc.delete(id).subscribe({
      next: (res) => {
        this.deleting.set(false);
        this.deleteModalVisible.set(false);
        this.banner.set({ type: 'success', text: res?.message ?? 'Empleado eliminado.' });
        this.reload();
      },
      error: (err) => {
        this.deleting.set(false);
        this.deleteModalVisible.set(false);
        this.banner.set({ type: 'danger', text: err?.error?.message ?? 'No se pudo eliminar.' });
      },
    });
  }

  goNew() {
    this.router.navigate(['/catalog/empleados/nuevo'], { queryParams: this.route.snapshot.queryParams });
  }

  goEdit() {
    const id = this.selectedId();
    if (!id) return;
    this.router.navigate(['/catalog/empleados', id, 'editar'], { queryParams: this.route.snapshot.queryParams });
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
