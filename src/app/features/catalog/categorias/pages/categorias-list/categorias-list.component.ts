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
import { Categoria } from '../../data/categorias.models';
import { CategoriasService } from '../../data/categorias.service';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-categorias-list',
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
  templateUrl: './categorias-list.component.html',
  styleUrl: './categorias-list.component.scss',
})
export class CategoriasListComponent {
  private gridApi?: GridApi;

  search = signal('');
  activoFilter = signal<'all' | 'true' | 'false'>('all');

  page = signal(1);
  pageSize = signal(25);
  total = signal(0);
  lastPage = signal(1);

  rows = signal<Categoria[]>([]);
  selectedId = signal<number | null>(null);

  banner = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(null);

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  colDefs: ColDef<Categoria>[] = [
    { headerName: 'ID', field: 'id', width: 90 },
    { headerName: 'Descripción', field: 'descripcion', flex: 1, minWidth: 260 },
    {
      headerName: '# Artículos',
      field: 'articulos_count',
      width: 120,
      valueFormatter: (p) => String(p.value ?? 0),
    },
    {
      headerName: 'Activo',
      field: 'activo',
      width: 110,
      valueFormatter: (p) => (p.value ? 'Sí' : 'No'),
    },
  ];

  overlayNoRowsTemplate = `<div class="ag-overlay-msg">No hay categorías para mostrar.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  private search$ = new Subject<string>();

  deleteModalVisible = signal(false);
  deleting = signal(false);

  constructor(
    private categoriasSvc: CategoriasService,
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
        this.reload();
      });
  }

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
    this.reload();
  }

  onSelectionChanged(e: SelectionChangedEvent) {
    const row = e.api.getSelectedRows()?.[0] as Categoria | undefined;
    this.selectedId.set(row?.id ?? null);
  }

  reload() {
    this.banner.set(null);
    this.selectedId.set(null);
    this.gridApi?.deselectAll();
    this.gridApi?.showLoadingOverlay();

    const activo =
      this.activoFilter() === 'all' ? null : this.activoFilter() === 'true';

    this.categoriasSvc
      .list({
        search: this.search() || null,
        activo,
        per_page: this.pageSize(),
        page: this.page(),
      })
      .subscribe({
        next: (res: any) => {
          const data = Array.isArray(res) ? res : (res?.data ?? []);
          this.rows.set(data);

          const total = Number(res?.total ?? data.length ?? 0);
          const last = Number(res?.last_page ?? 1);

          this.total.set(total);
          this.lastPage.set(last);

          if (!data || data.length === 0) this.gridApi?.showNoRowsOverlay();
          else this.gridApi?.hideOverlay();
        },
        error: () => {
          this.gridApi?.hideOverlay();
          this.banner.set({ type: 'danger', text: 'No se pudo cargar el listado.' });
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

  goNew() {
    this.router.navigate(['/catalog/categorias/nuevo'], { queryParams: this.route.snapshot.queryParams });
  }

  goEdit() {
    const id = this.selectedId();
    if (!id) return;
    this.router.navigate(['/catalog/categorias', id, 'editar'], { queryParams: this.route.snapshot.queryParams });
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

    this.categoriasSvc.delete(id).subscribe({
      next: (res) => {
        this.deleting.set(false);
        this.deleteModalVisible.set(false);

        this.banner.set({ type: 'success', text: res?.message ?? 'Listo.' });

        if (this.rows().length === 1 && this.page() > 1) this.page.set(this.page() - 1);

        this.syncQueryParams();
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