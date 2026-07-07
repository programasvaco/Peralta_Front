import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';

import {
  ButtonDirective,
  ModalBodyComponent,
  ModalComponent,
  ModalFooterComponent,
  ModalHeaderComponent,
} from '@coreui/angular';

import { CajaService } from '../../data/caja.service';
import { MovimientoCaja } from '../../data/caja.models';
import { HasPermissionDirective } from '../../../../core/directives/has-permission.directive';
import { AlmacenesService } from '../../../settings/pages/almacenes/data/almacenes.service';
import { Almacen } from '../../../settings/pages/almacenes/data/almacenes.models';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../shared/utils/ag-grid-defaults';
import { UserStorageService } from '../../../../core/storage/user-storage.service';
import { formatDate, getTodayString } from '../../../../shared/utils/date.utils';

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AgGridAngular,
    ButtonDirective,
    ModalComponent,
    ModalHeaderComponent,
    ModalBodyComponent,
    ModalFooterComponent,
    HasPermissionDirective,
  ],
  templateUrl: './caja.component.html',
  styleUrl: './caja.component.scss',
})
export class CajaComponent {
  private gridApi?: GridApi;

  // almacén fijo del usuario (oculta el selector)
  almacenFijo = signal(false);

  // filtros
  fecha       = signal('');
  almacenId   = signal<number | null>(null);
  almacenes   = signal<Almacen[]>([]);
  tipoFilter = signal('');

  // resumen
  saldoActual   = signal(0);
  totalEntradas = signal(0);
  totalSalidas  = signal(0);

  // data
  rows = signal<MovimientoCaja[]>([]);

  banner = signal<{ type: 'success' | 'danger'; text: string } | null>(null);

  // modal movimiento
  modalVisible = signal(false);
  saving       = signal(false);

  // modal corte
  corteModalVisible = signal(false);
  cortando          = signal(false);
  corteResultado    = signal<{ id: number; importe: number } | null>(null);

  movimientoForm = new FormGroup({
    tipo:        new FormControl<'Entrada' | 'Salida'>('Entrada', Validators.required),
    cantidad:    new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    referencia:  new FormControl<string>('', [Validators.required, Validators.maxLength(255)]),
    almacen_id:  new FormControl<number | null>(null),
  });

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;

  overlayNoRowsTemplate = `<div class="ag-overlay-msg">No hay movimientos para mostrar.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  colDefs: ColDef<MovimientoCaja>[] = [
    { headerName: 'ID', field: 'id', width: 80 },
    {
      headerName: 'Fecha',
      field: 'fecha',
      width: 130,
      valueFormatter: (p) => formatDate(p.value),
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
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
      type: 'rightAligned',
    },
    { headerName: 'Referencia', field: 'referencia', flex: 1, minWidth: 200 },
    {
      headerName: 'Usuario',
      valueGetter: (p) => p.data?.user?.name ?? '-',
      width: 160,
    },
  ];

  constructor(
    private cajaSvc: CajaService,
    private almacenesSvc: AlmacenesService,
    private userStorage: UserStorageService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    const qp = this.route.snapshot.queryParams;
    if (qp['fecha']) this.fecha.set(String(qp['fecha']));
    else this.fecha.set(getTodayString());
    if (qp['tipo']) this.tipoFilter.set(String(qp['tipo']));

    // Si el usuario tiene almacén asignado, usarlo siempre y ocultar el selector
    const userAlmacen = this.userStorage.get()?.almacen_id;
    if (userAlmacen) {
      this.almacenId.set(userAlmacen);
      this.almacenFijo.set(true);
    } else if (qp['almacen_id']) {
      this.almacenId.set(Number(qp['almacen_id']));
    }

    this.almacenesSvc.list({ activo: true }).subscribe({
      next: (list) => this.almacenes.set(list),
    });
  }

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
    if (this.almacenId() !== null) {
      this.reload();
    }
  }

  reload() {
    this.banner.set(null);
    this.gridApi?.showLoadingOverlay();

    this.cajaSvc.index({
      fecha:       this.fecha() || undefined,
      tipo:        this.tipoFilter() || undefined,
      almacen_id:  this.almacenId() ?? undefined,
    }).subscribe({
      next: (res) => {
        this.rows.set(res.movimientos);
        this.saldoActual.set(res.saldo_actual);
        this.totalEntradas.set(res.totales.entradas);
        this.totalSalidas.set(res.totales.salidas);

        if (!res.movimientos?.length) {
          this.gridApi?.showNoRowsOverlay();
        } else {
          this.gridApi?.hideOverlay();
        }
      },
      error: () => {
        this.gridApi?.hideOverlay();
        this.banner.set({ type: 'danger', text: 'No se pudo cargar la caja.' });
      },
    });
  }

  onFecha(value: string) {
    this.fecha.set(value);
    this.syncQueryParams();
    this.reload();
  }

  onTipo(value: string) {
    this.tipoFilter.set(value);
    this.syncQueryParams();
    this.reload();
  }

  onAlmacen(value: string) {
    this.almacenId.set(value ? Number(value) : null);
    this.syncQueryParams();
    this.reload();
  }

  limpiarFiltros() {
    this.fecha.set('');
    this.tipoFilter.set('');
    this.syncQueryParams();
    this.reload();
  }

  // ── Modal movimiento ──────────────────────────────────────

  openModal() {
    this.movimientoForm.reset({ tipo: 'Entrada', cantidad: null, referencia: '', almacen_id: this.almacenId() });
    this.modalVisible.set(true);
  }

  closeModal() {
    this.modalVisible.set(false);
  }

  confirmarMovimiento() {
    if (this.movimientoForm.invalid) return;

    const { tipo, cantidad, referencia, almacen_id } = this.movimientoForm.getRawValue();

    this.saving.set(true);

    this.cajaSvc.movimiento({ tipo: tipo!, cantidad: cantidad!, referencia: referencia!, almacen_id }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.modalVisible.set(false);
        this.banner.set({ type: 'success', text: res.message });
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        this.banner.set({
          type: 'danger',
          text: err?.error?.message ?? 'No se pudo registrar el movimiento.',
        });
      },
    });
  }

  // ── Corte de caja ─────────────────────────────────────────

  openCorteModal() {
    this.corteResultado.set(null);
    this.corteModalVisible.set(true);
  }

  closeCorteModal() {
    this.corteModalVisible.set(false);
  }

  confirmarCorte() {
    this.cortando.set(true);

    this.cajaSvc.corte(this.almacenId()).subscribe({
      next: (res) => {
        this.cortando.set(false);
        this.corteResultado.set({ id: res.corte.id, importe: res.importe });
        this.reload();
      },
      error: (err) => {
        this.cortando.set(false);
        this.corteModalVisible.set(false);
        this.banner.set({
          type: 'danger',
          text: err?.error?.message ?? 'No se pudo realizar el corte.',
        });
      },
    });
  }

  irACortes() {
    this.router.navigate(['/reporte/cortes']);
  }

  private syncQueryParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        almacen_id:  this.almacenId() ?? undefined,
        fecha:       this.fecha() || undefined,
        tipo:        this.tipoFilter() || undefined,
      },
      replaceUrl: true,
    });
  }
}
