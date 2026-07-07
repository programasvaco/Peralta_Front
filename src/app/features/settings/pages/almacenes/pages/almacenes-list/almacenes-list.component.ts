import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import {
  ColDef,
  GridApi,
  GridReadyEvent,
  SelectionChangedEvent,
} from 'ag-grid-community';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import {
  ButtonDirective,
  ModalBodyComponent,
  ModalComponent,
  ModalFooterComponent,
  ModalHeaderComponent,
} from '@coreui/angular';
import { Almacen } from '../../data/almacenes.models';
import { AlmacenesService } from '../../data/almacenes.service';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../../shared/utils/ag-grid-defaults';
import { HasPermissionDirective } from 'src/app/core/directives/has-permission.directive';

@Component({
  selector: 'app-almacenes-list',
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
  templateUrl: './almacenes-list.component.html',
  styleUrl: './almacenes-list.component.scss',
})
export class AlmacenesListComponent {
  private gridApi?: GridApi;

  // filtros
  search = signal('');
  activoFilter = signal<'all' | 'true' | 'false'>('all');

  // paginación
  page = signal(1);
  pageSize = signal(25);
  total = signal(0);
  lastPage = signal(1);

  // data
  allRows = signal<Almacen[]>([]);
  rows = signal<Almacen[]>([]);
  selectedId = signal<number | null>(null);

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  overlayNoRowsTemplate = `<div class="ag-overlay-msg">No hay almacenes para mostrar.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  colDefs: ColDef<Almacen>[] = [
    { headerName: 'ID', field: 'id', width: 90 },
    { headerName: 'Descripción', field: 'descripcion', flex: 1, minWidth: 220 },
    { headerName: 'Dirección', field: 'direccion', flex: 1, minWidth: 260 },
    {
      headerName: 'Ciudad',
      field: 'ciudad',
      minWidth: 160,
      valueFormatter: (p) => p.value ?? '-',
    },
    {
      headerName: 'Teléfono',
      field: 'telefono',
      minWidth: 150,
      valueFormatter: (p) => p.value ?? '-',
    },
    {
      headerName: 'Activo',
      field: 'activo',
      width: 110,
      valueFormatter: (p) => (p.value ? 'Sí' : 'No'),
    },
  ];

  private search$ = new Subject<string>();
  deleteModalVisible = signal(false);
  deleting = signal(false);

  banner = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(
    null,
  );

  constructor(
    private almacenesSvc: AlmacenesService,
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
    const row = e.api.getSelectedRows()?.[0] as Almacen | undefined;
    this.selectedId.set(row?.id ?? null);
  }

  reload() {
    this.banner.set(null);
    this.selectedId.set(null);
    this.gridApi?.deselectAll();
    this.gridApi?.showLoadingOverlay();

    const activo =
      this.activoFilter() === 'all' ? null : this.activoFilter() === 'true';

    this.almacenesSvc.list({ activo }).subscribe({
      next: (res) => {
        const data = Array.isArray(res) ? res : ((res as any)?.data ?? []);
        this.allRows.set(data);
        this.applyClientFilters(true);
      },
      error: () => {
        this.gridApi?.hideOverlay();
        this.banner.set({
          type: 'danger',
          text: 'No se pudo cargar el listado.',
        });
      },
    });
  }

  onSearch(v: string) {
    this.search$.next(v);
  }

  onActivo(v: string) {
    this.activoFilter.set(v as any);
    this.page.set(1);
    this.syncQueryParams();
    this.reload(); // el backend sí filtra por activo
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

    this.almacenesSvc.delete(id).subscribe({
      next: (res) => {
        this.deleting.set(false);
        this.deleteModalVisible.set(false);

        this.banner.set({ type: 'success', text: res?.message ?? 'Listo.' });
        this.reload();
      },
      error: (err) => {
        this.deleting.set(false);
        this.deleteModalVisible.set(false);

        this.banner.set({
          type: 'danger',
          text: err?.error?.message ?? 'No se pudo eliminar.',
        });
      },
    });
  }

  goNew() {
    this.router.navigate(['/settings/almacenes/nuevo'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  goEdit() {
    const id = this.selectedId();
    if (!id) return;
    this.router.navigate(['/settings/almacenes', id, 'editar'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  private applyClientFilters(fromReload = false) {
    const q = (this.search() || '').trim().toLowerCase();

    const filtered = this.allRows().filter((a) => {
      if (!q) return true;
      return (
        (a.descripcion ?? '').toLowerCase().includes(q) ||
        (a.direccion ?? '').toLowerCase().includes(q) ||
        (a.ciudad ?? '').toLowerCase().includes(q) ||
        (a.telefono ?? '').toLowerCase().includes(q)
      );
    });

    this.total.set(filtered.length);

    const ps = this.pageSize();
    const last = Math.max(1, Math.ceil(filtered.length / ps));
    this.lastPage.set(last);

    // si venimos de reload y la página guardada ya no existe
    if (fromReload && this.page() > last) this.page.set(1);

    const start = (this.page() - 1) * ps;
    const pageRows = filtered.slice(start, start + ps);

    this.rows.set(pageRows);

    if (!pageRows || pageRows.length === 0) this.gridApi?.showNoRowsOverlay();
    else this.gridApi?.hideOverlay();
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
