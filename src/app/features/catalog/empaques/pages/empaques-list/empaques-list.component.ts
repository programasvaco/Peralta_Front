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
import { EmpaquesService } from '../../data/empaques.service';
import { Empaque } from '../../data/empaques.models';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-empaques-list',
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
  templateUrl: './empaques-list.component.html',
  styleUrl: './empaques-list.component.scss',
})
export class EmpaquesListComponent {
  private gridApi?: GridApi;

  search       = signal('');
  activoFilter = signal<'all' | 'true' | 'false'>('all');

  page     = signal(1);
  pageSize = signal(25);
  total    = signal(0);
  lastPage = signal(1);

  rows       = signal<Empaque[]>([]);
  selectedId = signal<number | null>(null);

  banner = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(null);

  private allRows: Empaque[] = [];

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  colDefs: ColDef<Empaque>[] = [
    { headerName: 'ID',          field: 'id',          width: 80 },
    { headerName: 'Descripción', field: 'descripcion', flex: 1, minWidth: 200 },
    {
      headerName: 'Dimensiones',
      field: 'dimensiones',
      minWidth: 150,
      valueFormatter: p => p.value ?? '-',
    },
    {
      headerName: 'Peso (kg)',
      field: 'peso',
      width: 110,
      valueFormatter: p => p.value != null ? Number(p.value).toFixed(3) : '-',
    },
    {
      headerName: 'Existencias',
      field: 'existencias',
      width: 120,
      valueFormatter: p => typeof p.value === 'number' ? p.value.toFixed(0) : '0',
    },
    {
      headerName: 'Activo',
      field: 'activo',
      width: 100,
      valueFormatter: p => p.value ? 'Sí' : 'No',
    },
  ];

  overlayNoRowsTemplate  = `<div class="ag-overlay-msg">No hay empaques para mostrar.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  private search$ = new Subject<string>();

  deleteModalVisible = signal(false);
  deleting           = signal(false);

  constructor(
    private svc: EmpaquesService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    const qp = this.route.snapshot.queryParams;
    if (qp['search'])   this.search.set(String(qp['search']));
    if (qp['activo'])   this.activoFilter.set(String(qp['activo']) as any);
    if (qp['page'])     this.page.set(Number(qp['page']));
    if (qp['per_page']) this.pageSize.set(Number(qp['per_page']));

    this.search$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(v => {
        this.search.set(v);
        this.page.set(1);
        this.syncQueryParams();
        this.applyFilters();
      });
  }

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
    this.reload();
  }

  onSelectionChanged(e: SelectionChangedEvent) {
    const row = e.api.getSelectedRows()?.[0] as Empaque | undefined;
    this.selectedId.set(row?.id ?? null);
  }

  reload() {
    this.banner.set(null);
    this.selectedId.set(null);
    this.gridApi?.deselectAll();
    this.gridApi?.showLoadingOverlay();

    this.svc.list().subscribe({
      next: data => {
        this.allRows = Array.isArray(data) ? data : [];
        this.applyFilters();
      },
      error: () => {
        this.gridApi?.hideOverlay();
        this.banner.set({ type: 'danger', text: 'No se pudo cargar el listado.' });
      },
    });
  }

  private applyFilters() {
    const q      = (this.search() ?? '').trim().toLowerCase();
    const activo = this.activoFilter();

    let filtered = [...this.allRows];

    if (q) {
      filtered = filtered.filter(x =>
        x.descripcion.toLowerCase().includes(q) ||
        (x.dimensiones ?? '').toLowerCase().includes(q)
      );
    }

    if (activo !== 'all') {
      const isActive = activo === 'true';
      filtered = filtered.filter(x => !!x.activo === isActive);
    }

    const total  = filtered.length;
    const per    = this.pageSize();
    const last   = Math.max(1, Math.ceil(total / per));
    let   current = Math.min(this.page(), last);

    const start = (current - 1) * per;
    const paged = filtered.slice(start, start + per);

    this.page.set(current);
    this.total.set(total);
    this.lastPage.set(last);
    this.rows.set(paged);

    if (!paged.length) this.gridApi?.showNoRowsOverlay();
    else               this.gridApi?.hideOverlay();
  }

  onSearch(v: string)  { this.search$.next(v); }

  onActivo(v: string) {
    this.activoFilter.set(v as any);
    this.page.set(1);
    this.syncQueryParams();
    this.applyFilters();
  }

  onPageSize(v: string) {
    this.pageSize.set(Number(v));
    this.page.set(1);
    this.syncQueryParams();
    this.applyFilters();
  }

  prevPage() {
    if (this.page() > 1) { this.page.set(this.page() - 1); this.syncQueryParams(); this.applyFilters(); }
  }

  nextPage() {
    if (this.page() < this.lastPage()) { this.page.set(this.page() + 1); this.syncQueryParams(); this.applyFilters(); }
  }

  goNew()  { this.router.navigate(['/catalog/empaques/nuevo'],                     { queryParams: this.route.snapshot.queryParams }); }
  goEdit() {
    const id = this.selectedId();
    if (!id) return;
    this.router.navigate(['/catalog/empaques', id, 'editar'], { queryParams: this.route.snapshot.queryParams });
  }

  openDeleteModal()  { if (this.selectedId()) this.deleteModalVisible.set(true); }
  closeDeleteModal() { this.deleteModalVisible.set(false); }

  confirmDelete() {
    const id = this.selectedId();
    if (!id) return;
    this.deleting.set(true);

    this.svc.delete(id).subscribe({
      next: res => {
        this.deleting.set(false);
        this.deleteModalVisible.set(false);
        this.banner.set({ type: 'success', text: res?.message ?? 'Empaque eliminado.' });
        if (this.rows().length === 1 && this.page() > 1) this.page.set(this.page() - 1);
        this.syncQueryParams();
        this.reload();
      },
      error: err => {
        this.deleting.set(false);
        this.deleteModalVisible.set(false);
        this.banner.set({ type: 'danger', text: err?.error?.message ?? 'No se pudo eliminar.' });
      },
    });
  }

  private syncQueryParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search:   this.search() || undefined,
        activo:   this.activoFilter() !== 'all' ? this.activoFilter() : undefined,
        page:     this.page(),
        per_page: this.pageSize(),
      },
      replaceUrl: true,
    });
  }
}
