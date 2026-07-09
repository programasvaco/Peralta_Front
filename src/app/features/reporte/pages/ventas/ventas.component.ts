import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';

import { VentasListService } from '../../../operation/ventas/data/ventas-list.service';
import { VentaFormaPagoRow, VentaPorArticuloRow } from '../../../operation/ventas/data/ventas-list.models';
import { AlmacenesService } from '../../../settings/pages/almacenes/data/almacenes.service';
import { Almacen } from '../../../settings/pages/almacenes/data/almacenes.models';
import { getTodayString } from '../../../../shared/utils/date.utils';
import { AG_GRID_DEFAULT_COL_DEF } from '../../../../shared/utils/ag-grid-defaults';

@Component({
  selector: 'app-reporte-ventas',
  standalone: true,
  imports: [CommonModule, AgGridAngular],
  templateUrl: './ventas.component.html',
  styleUrl: './ventas.component.scss',
})
export class VentasReporteComponent {
  private gridApiArticulos?: GridApi;
  private gridApiFormasPago?: GridApi;

  // filtros
  fechaInicio = signal(getTodayString());
  fechaFin    = signal(getTodayString());
  almacenId   = signal<number | null>(null);
  almacenes   = signal<Almacen[]>([]);

  loading = signal(false);
  banner  = signal<{ type: 'danger'; text: string } | null>(null);

  // resumen por artículo
  articulos         = signal<VentaPorArticuloRow[]>([]);
  totalesArticulos  = signal({ cantidad: 0, subtotal: 0, impuestos: 0, total: 0 });

  // resumen por forma de pago
  formasPago        = signal<VentaFormaPagoRow[]>([]);
  totalesFormasPago = signal({ tickets: 0, total: 0 });

  defaultColDef: ColDef = AG_GRID_DEFAULT_COL_DEF;
  overlayNoRowsTemplate = `<div class="ag-overlay-msg">No hay datos para el periodo seleccionado.</div>`;
  overlayLoadingTemplate = `<div class="ag-overlay-msg">Cargando...</div>`;

  colDefsArticulos: ColDef<VentaPorArticuloRow>[] = [
    { headerName: 'Artículo', field: 'nombre', flex: 1, minWidth: 200 },
    {
      headerName: 'Unidad',
      field: 'unidad',
      width: 100,
      valueFormatter: (p) => p.value ?? '-',
    },
    {
      headerName: 'Cantidad',
      field: 'cantidad',
      width: 120,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(2) : '-',
    },
    {
      headerName: 'Subtotal',
      field: 'subtotal',
      width: 130,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
    },
    {
      headerName: 'Impuestos',
      field: 'impuestos',
      width: 130,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
    },
    {
      headerName: 'Total',
      field: 'total',
      width: 130,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
    },
  ];

  colDefsFormasPago: ColDef<VentaFormaPagoRow>[] = [
    { headerName: 'Forma de pago', field: 'forma_pago', flex: 1, minWidth: 180 },
    { headerName: 'Tickets', field: 'tickets', width: 120, type: 'rightAligned' },
    {
      headerName: 'Total',
      field: 'total',
      width: 150,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? `$${Number(p.value).toFixed(2)}` : '-',
    },
  ];

  constructor(
    private ventasSvc: VentasListService,
    private almacenesSvc: AlmacenesService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    const qp = this.route.snapshot.queryParams;
    if (qp['fecha_inicio']) this.fechaInicio.set(String(qp['fecha_inicio']));
    if (qp['fecha_fin'])    this.fechaFin.set(String(qp['fecha_fin']));
    if (qp['almacen_id'])   this.almacenId.set(Number(qp['almacen_id']));

    this.almacenesSvc.list({ activo: true }).subscribe({
      next: (list) => this.almacenes.set(list),
    });
  }

  onGridArticulosReady(e: GridReadyEvent) {
    this.gridApiArticulos = e.api;
    this.generar();
  }

  onGridFormasPagoReady(e: GridReadyEvent) {
    this.gridApiFormasPago = e.api;
  }

  onFechaInicio(v: string) { this.fechaInicio.set(v); }
  onFechaFin(v: string)    { this.fechaFin.set(v); }
  onAlmacen(v: string)     { this.almacenId.set(v ? Number(v) : null); }

  generar() {
    if (!this.fechaInicio() || !this.fechaFin()) {
      this.banner.set({ type: 'danger', text: 'Selecciona el rango de fechas.' });
      return;
    }

    if (this.fechaFin() < this.fechaInicio()) {
      this.banner.set({ type: 'danger', text: 'La fecha fin no puede ser anterior a la fecha inicio.' });
      return;
    }

    this.banner.set(null);
    this.loading.set(true);
    this.syncQueryParams();
    this.gridApiArticulos?.showLoadingOverlay();
    this.gridApiFormasPago?.showLoadingOverlay();

    const query = {
      fecha_inicio: this.fechaInicio(),
      fecha_fin:    this.fechaFin(),
      almacen_id:   this.almacenId(),
    };

    this.ventasSvc.porArticulo(query).subscribe({
      next: (res) => {
        this.articulos.set(res.articulos);
        this.totalesArticulos.set(res.totales);

        if (!res.articulos?.length) {
          this.gridApiArticulos?.showNoRowsOverlay();
        } else {
          this.gridApiArticulos?.hideOverlay();
        }
      },
      error: () => {
        this.gridApiArticulos?.hideOverlay();
        this.banner.set({ type: 'danger', text: 'No se pudo generar el resumen por artículo.' });
      },
    });

    this.ventasSvc.formasPago(query).subscribe({
      next: (res) => {
        this.formasPago.set(res.formas_pago);
        this.totalesFormasPago.set(res.totales);

        if (!res.formas_pago?.length) {
          this.gridApiFormasPago?.showNoRowsOverlay();
        } else {
          this.gridApiFormasPago?.hideOverlay();
        }
      },
      error: () => {
        this.gridApiFormasPago?.hideOverlay();
        this.banner.set({ type: 'danger', text: 'No se pudo generar el resumen de formas de pago.' });
      },
      complete: () => this.loading.set(false),
    });
  }

  private syncQueryParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        fecha_inicio: this.fechaInicio() || undefined,
        fecha_fin:    this.fechaFin() || undefined,
        almacen_id:   this.almacenId() ?? undefined,
      },
      replaceUrl: true,
    });
  }
}
