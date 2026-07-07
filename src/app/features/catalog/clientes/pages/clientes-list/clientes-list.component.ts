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
import { Cliente } from '../../data/clientes.models';
import { ClientesService } from '../../data/clientes.service';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-clientes-list',
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
  templateUrl: './clientes-list.component.html',
  styleUrl: './clientes-list.component.scss',
})
export class ClientesListComponent {
  private gridApi?: GridApi;

  search = signal('');
  activoFilter = signal<'all' | 'true' | 'false'>('all');
  conSaldo = signal(false);

  page = signal(1);
  pageSize = signal(25);
  total = signal(0);
  lastPage = signal(1);

  rows = signal<Cliente[]>([]);
  selectedId = signal<number | null>(null);

  banner = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(null);

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  colDefs: ColDef<Cliente>[] = [
    { headerName: 'ID', field: 'id', width: 90 },
    { headerName: 'Nombre', field: 'nombre', flex: 1, minWidth: 260 },
    { headerName: 'Teléfono', field: 'telefono', minWidth: 140, valueFormatter: (p) => p.value ?? '-' },
    { headerName: 'Ciudad', field: 'ciudad', minWidth: 160, valueFormatter: (p) => p.value ?? '-' },
    {
      headerName: 'Activo',
      field: 'activo',
      width: 110,
      valueFormatter: (p) => (p.value ? 'Sí' : 'No'),
    },
  ];

  overlayNoRowsTemplate = `<div class="ag-overlay-msg">No hay clientes para mostrar.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  private search$ = new Subject<string>();

  deleteModalVisible = signal(false);
  deleting = signal(false);

  constructor(
    private clientesSvc: ClientesService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    const qp = this.route.snapshot.queryParams;

    if (qp['search']) this.search.set(String(qp['search']));
    if (qp['activo']) this.activoFilter.set(String(qp['activo']) as any);
    if (qp['con_saldo']) this.conSaldo.set(String(qp['con_saldo']) === 'true');
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
    const row = e.api.getSelectedRows()?.[0] as Cliente | undefined;
    this.selectedId.set(row?.id ?? null);
  }

  reload() {
    this.banner.set(null);
    this.selectedId.set(null);
    this.gridApi?.deselectAll();
    this.gridApi?.showLoadingOverlay();

    const activo =
      this.activoFilter() === 'all' ? null : this.activoFilter() === 'true';

    this.clientesSvc
      .list({
        search: this.search() || null,
        activo,
        con_saldo: this.conSaldo() ? true : null,
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

  toggleConSaldo(v: boolean) {
    this.conSaldo.set(v);
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

    this.clientesSvc.delete(id).subscribe({
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

  goNew() {
    this.router.navigate(['/catalog/clientes/nuevo'], { queryParams: this.route.snapshot.queryParams });
  }

  goEdit() {
    const id = this.selectedId();
    if (!id) return;
    this.router.navigate(['/catalog/clientes', id, 'editar'], { queryParams: this.route.snapshot.queryParams });
  }

  private syncQueryParams() {
    const qp: any = {
      search: this.search() || undefined,
      activo: this.activoFilter() !== 'all' ? this.activoFilter() : undefined,
      con_saldo: this.conSaldo() ? 'true' : undefined,
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