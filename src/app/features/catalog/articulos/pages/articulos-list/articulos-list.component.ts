import { CommonModule } from '@angular/common';
import { Component, ElementRef, signal, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import {
  ColDef,
  GridApi,
  GridReadyEvent,
  SelectionChangedEvent,
} from 'ag-grid-community';
import { HasPermissionDirective } from '../../../../../core/directives/has-permission.directive';
import { Articulo, Categoria } from '../../data/articulos.models';
import { ArticulosService } from '../../data/articulos.service';
import { CategoriasService } from '../../data/categorias.service';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import {
  ButtonDirective,
  ModalBodyComponent,
  ModalComponent,
  ModalFooterComponent,
  ModalHeaderComponent,
} from '@coreui/angular';
import * as XLSX from 'xlsx';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-articulos-list',
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
  templateUrl: './articulos-list.component.html',
  styleUrl: './articulos-list.component.scss',
})
export class ArticulosListComponent {
  private gridApi?: GridApi;

  // filtros
  search = signal('');
  activoFilter = signal<'all' | 'true' | 'false'>('all');
  categoriaId = signal<number | null>(null);

  // paginación
  page = signal(1);
  pageSize = signal(25);
  total = signal(0);
  lastPage = signal(1);

  // data
  rows = signal<Articulo[]>([]);
  categorias = signal<Categoria[]>([]);
  selectedId = signal<number | null>(null);

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  overlayNoRowsTemplate = `<div class="ag-overlay-msg">No hay artículos para mostrar.</div>`;

  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  colDefs: ColDef<Articulo>[] = [
    { headerName: 'ID', field: 'id', width: 90 },
    { headerName: 'Orden', field: 'orden', width: 100 },
    { headerName: 'Nombre', field: 'nombre', flex: 1, minWidth: 240 },
    { headerName: 'Nombre corto', field: 'nombre_corto', minWidth: 170 },
    { headerName: 'Unidad', field: 'unidad', width: 110 },
    {
      headerName: 'Categoría',
      valueGetter: (p) => p.data?.categoria?.descripcion ?? '-',
      minWidth: 180,
    },
    { headerName: 'Stock', field: 'inventarios_sum_existencia', width: 120 },
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
  reordering = signal(false);

  // mensaje tipo banner (reemplaza alert)
  banner = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(
    null,
  );

  constructor(
    private articulosSvc: ArticulosService,
    private categoriasSvc: CategoriasService,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    // 4) restaurar filtros desde query params al entrar al listado
    const qp = this.route.snapshot.queryParams;

    if (qp['search']) this.search.set(String(qp['search']));
    if (qp['activo']) this.activoFilter.set(String(qp['activo']) as any);
    if (qp['categoria_id']) this.categoriaId.set(Number(qp['categoria_id']));
    if (qp['page']) this.page.set(Number(qp['page']));
    if (qp['per_page']) this.pageSize.set(Number(qp['per_page']));

    // debounce búsqueda
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
    this.loadCategorias();
    this.reload();
  }

  onSelectionChanged(e: SelectionChangedEvent) {
    const row = e.api.getSelectedRows()?.[0] as Articulo | undefined;
    this.selectedId.set(row?.id ?? null);
  }

  loadCategorias() {
    this.categoriasSvc.list().subscribe((res: any) => {
      const data = Array.isArray(res) ? res : (res?.data ?? []);
      this.categorias.set(data);
    });
  }

  reload() {
    this.banner.set(null);

    this.selectedId.set(null);
    this.gridApi?.deselectAll();

    // 1) loading overlay
    this.gridApi?.showLoadingOverlay();

    const activo =
      this.activoFilter() === 'all' ? null : this.activoFilter() === 'true';

    this.articulosSvc
      .list({
        page: this.page(),
        per_page: this.pageSize(),
        search: this.search() || undefined,
        categoria_id: this.categoriaId(),
        activo,
      })
      .subscribe({
        next: (res) => {
          this.rows.set(res.data);
          this.total.set(res.total);
          this.lastPage.set(res.last_page ?? 1);

          // 2) overlay “sin resultados”
          if (!res.data || res.data.length === 0) {
            this.gridApi?.showNoRowsOverlay();
          } else {
            this.gridApi?.hideOverlay();
          }
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
    this.reload();
  }

  onCategoria(v: string) {
    this.categoriaId.set(v ? Number(v) : null);
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

    this.articulosSvc.delete(id).subscribe({
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
    this.router.navigate(['/catalog/articulos/nuevo'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  goEdit() {
    const id = this.selectedId();
    if (!id) return;
    this.router.navigate(['/catalog/articulos', id, 'editar'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  private sortedRows(): Articulo[] {
    return [...this.rows()].sort((a, b) => (a.orden ?? 99999) - (b.orden ?? 99999));
  }

  canMoveUp(): boolean {
    if (!this.selectedId()) return false;
    const sorted = this.sortedRows();
    const idx = sorted.findIndex((a) => a.id === this.selectedId());
    return idx > 0;
  }

  canMoveDown(): boolean {
    if (!this.selectedId()) return false;
    const sorted = this.sortedRows();
    const idx = sorted.findIndex((a) => a.id === this.selectedId());
    return idx >= 0 && idx < sorted.length - 1;
  }

  moveUp() {
    const sorted = this.sortedRows();
    const idx = sorted.findIndex((a) => a.id === this.selectedId());
    if (idx <= 0) return;
    this.swapOrden(sorted[idx], sorted[idx - 1]);
  }

  moveDown() {
    const sorted = this.sortedRows();
    const idx = sorted.findIndex((a) => a.id === this.selectedId());
    if (idx < 0 || idx >= sorted.length - 1) return;
    this.swapOrden(sorted[idx], sorted[idx + 1]);
  }

  private swapOrden(a: Articulo, b: Articulo) {
    this.reordering.set(true);
    const payload = [
      { id: a.id, orden: b.orden ?? 0 },
      { id: b.id, orden: a.orden ?? 0 },
    ];
    this.articulosSvc.reordenar(payload).subscribe({
      next: () => {
        this.reordering.set(false);
        this.reload();
      },
      error: () => {
        this.reordering.set(false);
        this.banner.set({ type: 'danger', text: 'No se pudo reordenar.' });
      },
    });
  }

  private syncQueryParams() {
    const qp: any = {
      search: this.search() || undefined,
      activo: this.activoFilter() !== 'all' ? this.activoFilter() : undefined,
      categoria_id: this.categoriaId() ?? undefined,
      page: this.page(),
      per_page: this.pageSize(),
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: qp,
      replaceUrl: true,
    });
  }

  openImport() {
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });

      const ws = wb.Sheets['Plantilla_Articulos'];
      if (!ws) {
        this.banner.set({
          type: 'danger',
          text: 'La hoja Plantilla_Articulos no existe'
        });
        return;
      }

      const json = XLSX.utils.sheet_to_json(ws, { defval: '', range: 2 });

      const cleaned = json.map(r => this.normalizeRow(r));

      console.log(cleaned[0]);

      this.processImport(cleaned);
    };

    reader.readAsArrayBuffer(file); // ✅ nuevo método
  }

  processImport(rows: any[]) {
    const payload: any[] = [];
    const errores: string[] = [];

    rows.forEach((r, i) => {
      const fila = i + 2;

      if (!r.nombre) {
        errores.push(`Fila ${fila}: nombre requerido`);
        return;
      }

      if (!r.unidad) {
        errores.push(`Fila ${fila}: unidad requerida`);
        return;
      }

      if (!r.categoria_id) {
        errores.push(`Fila ${fila}: categoria_id requerido`);
        return;
      }

      payload.push({
        nombre: r.nombre,
        nombre_corto: r.nombre_corto || r.nombre,
        unidad: r.unidad,
        categoria_id: Number(r.categoria_id)
      });
    });

    if (errores.length) {
      this.banner.set({
        type: 'danger',
        text: errores.join(' | ')
      });
      return;
    }

    this.sendToBackend(payload);
  }

  sendToBackend(data: any[]) {
    this.banner.set({ type: 'info', text: 'Importando artículos...' });
    console.log(JSON.stringify(data));
    this.articulosSvc.importar(data).subscribe({
      next: (res: any) => {
        const { insertados, errores } = res;

        if (errores?.length) {
          this.banner.set({
            type: 'danger',
            text: `Se importaron ${insertados}, pero hubo ${errores.length} errores`
          });

          console.error('Errores de importación:', errores);
        } else {
          this.banner.set({
            type: 'success',
            text: `Importación exitosa (${insertados} artículos)`
          });
        }

        this.reload();
      },
      error: (err: any) => {
        console.error(err);
        this.banner.set({
          type: 'danger',
          text: 'Error al importar artículos'
        });
      }
    });
  }

  normalizeRow(row: any) {
    const newRow: any = {};

    Object.keys(row).forEach(key => {
      const cleanKey = key.trim().toLowerCase();
      newRow[cleanKey] = row[key];
    });

    return newRow;
  }
}
