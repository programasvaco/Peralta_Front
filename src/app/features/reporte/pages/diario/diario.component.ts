import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { VentasListService } from '../../../operation/ventas/data/ventas-list.service';
import { ReporteDiarioResponse } from '../../../operation/ventas/data/ventas-list.models';
import { AlmacenesService } from '../../../settings/pages/almacenes/data/almacenes.service';
import { Almacen } from '../../../settings/pages/almacenes/data/almacenes.models';
import { UserStorageService } from '../../../../core/storage/user-storage.service';
import { getTodayString } from '../../../../shared/utils/date.utils';

@Component({
  selector: 'app-reporte-diario',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './diario.component.html',
})
export class ReporteDiarioComponent {
  almacenFijo = signal(false);
  fecha       = signal(getTodayString());
  almacenId   = signal<number | null>(null);
  almacenes   = signal<Almacen[]>([]);

  loading = signal(false);
  banner  = signal<{ type: 'danger'; text: string } | null>(null);
  reporte = signal<ReporteDiarioResponse | null>(null);

  constructor(
    private ventasSvc: VentasListService,
    private almacenesSvc: AlmacenesService,
    private userStorage: UserStorageService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    const qp = this.route.snapshot.queryParams;
    if (qp['fecha']) this.fecha.set(String(qp['fecha']));

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

    this.generar();
  }

  onFecha(v: string) { this.fecha.set(v); }
  onAlmacen(v: string) { this.almacenId.set(v ? Number(v) : null); }

  generar() {
    if (!this.fecha()) {
      this.banner.set({ type: 'danger', text: 'Selecciona una fecha.' });
      return;
    }

    this.banner.set(null);
    this.loading.set(true);
    this.syncQueryParams();

    this.ventasSvc.diario({ fecha: this.fecha(), almacen_id: this.almacenId() }).subscribe({
      next: (res) => {
        this.reporte.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.banner.set({ type: 'danger', text: 'No se pudo generar el reporte.' });
      },
    });
  }

  private syncQueryParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        fecha:      this.fecha() || undefined,
        almacen_id: this.almacenId() ?? undefined,
      },
      replaceUrl: true,
    });
  }
}
