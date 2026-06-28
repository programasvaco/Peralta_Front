import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { EstadoResultadosService } from '../../data/estado-resultados.service';
import { EstadoResultadosResponse } from '../../data/estado-resultados.models';
import { AlmacenesService } from '../../../settings/pages/almacenes/data/almacenes.service';
import { Almacen } from '../../../settings/pages/almacenes/data/almacenes.models';
import { UserStorageService } from '../../../../core/storage/user-storage.service';
import { getTodayString } from '../../../../shared/utils/date.utils';

@Component({
  selector: 'app-estado-resultados',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './estado-resultados.component.html',
})
export class EstadoResultadosComponent {
  almacenFijo  = signal(false);
  fechaInicio  = signal('');
  fechaFin     = signal(getTodayString());
  almacenId    = signal<number | null>(null);
  almacenes    = signal<Almacen[]>([]);

  loading = signal(false);
  banner  = signal<{ type: 'danger'; text: string } | null>(null);
  reporte = signal<EstadoResultadosResponse | null>(null);

  constructor(
    private svc: EstadoResultadosService,
    private almacenesSvc: AlmacenesService,
    private userStorage: UserStorageService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    const qp = this.route.snapshot.queryParams;
    if (qp['fecha_inicio']) this.fechaInicio.set(String(qp['fecha_inicio']));
    if (qp['fecha_fin'])    this.fechaFin.set(String(qp['fecha_fin']));

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

    this.svc.get({
      fecha_inicio: this.fechaInicio(),
      fecha_fin:    this.fechaFin(),
      almacen_id:   this.almacenId(),
    }).subscribe({
      next: (res) => {
        this.reporte.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.banner.set({ type: 'danger', text: 'No se pudo generar el estado de resultados.' });
      },
    });
  }

  totalIngresos(r: EstadoResultadosResponse): number {
    return (r.ventas_periodo.total - r.credito_pendiente.total) + r.recuperacion.total;
  }

  totalEgresos(r: EstadoResultadosResponse): number {
    return r.costo_ventas + r.compras_pagadas.total + r.pagos_proveedores.total + r.gastos_adicionales.total;
  }

  resultado(r: EstadoResultadosResponse): number {
    return this.totalIngresos(r) - this.totalEgresos(r);
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
