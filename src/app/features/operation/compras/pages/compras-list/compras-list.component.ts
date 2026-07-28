import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, DestroyRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  ButtonDirective,
  SpinnerComponent,
  TableDirective,
  BadgeComponent,
} from '@coreui/angular';

import { ComprasService } from '../../data/compras.service';
import { ProveedoresService } from '../../../../catalog/proveedores/data/proveedores.service';
import { Compra, PaginatedResponse } from '../../data/compras.models';
import { Proveedor } from '../../../../catalog/proveedores/data/proveedores.models';
import { HasPermissionDirective } from '../../../../../core/directives/has-permission.directive';
import { getTodayString } from '../../../../../shared/utils/date.utils';
import { ComprasListStateService } from './compras-list-state.service';

@Component({
  selector: 'app-compras-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonDirective,
    SpinnerComponent,
    TableDirective,
    BadgeComponent,
    HasPermissionDirective,
  ],
  templateUrl: './compras-list.component.html',
  styleUrl: './compras-list.component.scss',
})
export class ComprasListComponent {
  private comprasSvc = inject(ComprasService);
  private proveedoresSvc = inject(ProveedoresService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private stateSvc = inject(ComprasListStateService);

  loading = signal(false);

  items = signal<Compra[]>([]);
  total = signal(0);
  page = signal(this.stateSvc.state.page);
  perPage = signal(15);
  lastPage = signal(1);

  proveedores = signal<Proveedor[]>([]);

  banner = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(null);

  filtros = new FormGroup({
    proveedor_id: new FormControl<number | null>(this.stateSvc.state.proveedor_id),
    fecha_inicio: new FormControl<string | null>(this.stateSvc.state.fecha_inicio),
    fecha_fin: new FormControl<string | null>(this.stateSvc.state.fecha_fin),
    mes: new FormControl<number | null>(this.stateSvc.state.mes),
    anio: new FormControl<number | null>(this.stateSvc.state.anio),
  });

  hasPaging = computed(() => this.lastPage() > 1);

  constructor() {
    this.loadProveedores();

    // ✅ Carga inicial inmediata
    this.fetch(this.page());

    // ✅ Recarga automática al cambiar filtros (sin botón "Aplicar")
    this.filtros.valueChanges
      .pipe(
        debounceTime(250),
        // distinctUntilChanged no funciona perfecto con objetos por referencia,
        // pero ayuda en muchos casos; con debounce ya es suficiente.
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.page.set(1);
        this.fetch(1);
      });
  }

  reload() {
    this.banner.set(null);
    this.fetch(this.page());
  }

  loadProveedores() {
    this.proveedoresSvc.list({ per_page: 200, page: 1, activo: true }).subscribe({
      next: (res: any) => {
        const data = Array.isArray(res) ? res : (res?.data ?? []);
        this.proveedores.set(data);
      },
    });
  }

  fetch(page?: number) {
    if (page) this.page.set(page);

    const f = this.filtros.getRawValue();
    this.stateSvc.state = {
      proveedor_id: f.proveedor_id,
      fecha_inicio: f.fecha_inicio,
      fecha_fin: f.fecha_fin,
      mes: f.mes,
      anio: f.anio,
      page: this.page(),
    };

    this.loading.set(true);

    this.comprasSvc
      .list({
        page: this.page(),
        per_page: this.perPage(),
        proveedor_id: f.proveedor_id,
        fecha_inicio: f.fecha_inicio,
        fecha_fin: f.fecha_fin,
        mes: f.mes,
        anio: f.anio,
      })
      .subscribe({
        next: (res: any) => {
          if (Array.isArray(res)) {
            this.items.set(res);
            this.total.set(res.length);
            this.lastPage.set(1);
          } else {
            const pag = res as PaginatedResponse<Compra>;
            this.items.set(pag.data ?? []);
            this.total.set(pag.total ?? 0);
            this.lastPage.set(pag.last_page ?? 1);
            this.page.set(pag.current_page ?? this.page());
            this.perPage.set(pag.per_page ?? this.perPage());
          }

          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.banner.set({ type: 'danger', text: 'No se pudieron cargar las compras.' });
        },
      });
  }

  clearFilters() {
    this.stateSvc.state = {
      proveedor_id: null,
      fecha_inicio: null,
      fecha_fin: null,
      mes: null,
      anio: null,
      page: 1,
    };

    // OJO: esto disparará valueChanges y hará fetch(1) automáticamente
    this.filtros.reset({
      proveedor_id: null,
      fecha_inicio: null,
      fecha_fin: null,
      mes: null,
      anio: null,
    });
  }

  goNew() {
    this.router.navigate(['/operation/compras/nuevo']);
  }

  open(item: Compra) {
    this.router.navigate(['/operation/compras', item.id, 'ver']);
  }

  prev() {
    if (this.page() <= 1) return;
    this.fetch(this.page() - 1);
  }

  next() {
    if (this.page() >= this.lastPage()) return;
    this.fetch(this.page() + 1);
  }

  badge(estatus?: string | null) {
    const s = (estatus ?? 'activa').toLowerCase();
    if (s === 'cancelada') return 'danger';
    return 'success';
  }

  labelStatus(estatus?: string | null) {
    const s = (estatus ?? 'activa').toLowerCase();
    return s === 'cancelada' ? 'Cancelada' : 'Activa';
  }
}