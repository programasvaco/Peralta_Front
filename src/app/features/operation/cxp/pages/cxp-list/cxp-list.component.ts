import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, DestroyRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  BadgeComponent,
  ButtonDirective,
  SpinnerComponent,
  TableDirective,
} from '@coreui/angular';

import { CxpService } from '../../data/cxp.service';
import { ProveedoresService } from '../../../../catalog/proveedores/data/proveedores.service';
import { CtaXPagar, CxpResumen, PaginatedResponse } from '../../data/cxp.models';
import { Proveedor } from '../../../../catalog/proveedores/data/proveedores.models';
import { CxpListStateService } from '../../data/cxp-list-state.service';

@Component({
  selector: 'app-cxp-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonDirective,
    SpinnerComponent,
    TableDirective,
    BadgeComponent,
  ],
  templateUrl: './cxp-list.component.html',
  styleUrl: './cxp-list.component.scss',
})
export class CxpListComponent {
  private cxpSvc        = inject(CxpService);
  private proveedoresSvc = inject(ProveedoresService);
  private router        = inject(Router);
  private destroyRef    = inject(DestroyRef);
  private stateSvc      = inject(CxpListStateService);

  loading     = signal(false);
  proveedores = signal<Proveedor[]>([]);
  resumen     = signal<CxpResumen | null>(null);

  items    = signal<CtaXPagar[]>([]);
  total    = signal(0);
  page     = signal(this.stateSvc.state.page);
  perPage  = signal(25);
  lastPage = signal(1);

  banner = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(null);

  hasPaging = computed(() => this.lastPage() > 1);

  filtros = new FormGroup({
    proveedor_id: new FormControl<number | null>(this.stateSvc.state.proveedor_id),
    estado: new FormControl<'pendientes' | 'vencidas' | 'todas'>(this.stateSvc.state.estado),
  });

  constructor() {
    this.loadProveedores();
    this.loadResumen();
    this.fetch(this.page());

    this.filtros.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page.set(1);
        this.fetch(1);
      });
  }

  reload() {
    this.banner.set(null);
    this.loadResumen();
    this.fetch(this.page());
  }

  loadProveedores() {
    this.proveedoresSvc.list({ per_page: 300, page: 1, activo: true }).subscribe({
      next: (res: any) => {
        const data = Array.isArray(res) ? res : (res?.data ?? []);
        this.proveedores.set(data);
      },
    });
  }

  loadResumen() {
    this.cxpSvc.resumen().subscribe({
      next: (r) => this.resumen.set(r),
    });
  }

  fetch(page?: number) {
    if (page) this.page.set(page);

    const f = this.filtros.getRawValue();
    this.stateSvc.state = {
      proveedor_id: f.proveedor_id,
      estado: f.estado ?? 'pendientes',
      page: this.page(),
    };

    this.loading.set(true);

    this.cxpSvc
      .list({
        page:         this.page(),
        per_page:     this.perPage(),
        proveedor_id: f.proveedor_id,
        todas:        f.estado === 'todas',
        vencidas:     f.estado === 'vencidas',
      })
      .subscribe({
        next: (res: any) => {
          if (Array.isArray(res)) {
            this.items.set(res);
            this.total.set(res.length);
            this.lastPage.set(1);
          } else {
            const pag = res as PaginatedResponse<CtaXPagar>;
            this.items.set(pag.data ?? []);
            this.total.set(pag.total ?? 0);
            this.lastPage.set(pag.last_page ?? 1);
            this.page.set(pag.current_page ?? this.page());
          }

          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.banner.set({ type: 'danger', text: 'No se pudieron cargar las cuentas.' });
        },
      });
  }

  clearFilters() {
    this.stateSvc.state = { proveedor_id: null, estado: 'pendientes', page: 1 };
    this.filtros.reset({ proveedor_id: null, estado: 'pendientes' });
  }

  ver(item: CtaXPagar) {
    this.router.navigate(['/operation/cxp', item.id]);
  }

  prev() {
    if (this.page() <= 1) return;
    this.fetch(this.page() - 1);
  }

  next() {
    if (this.page() >= this.lastPage()) return;
    this.fetch(this.page() + 1);
  }

  esVencida(item: CtaXPagar): boolean {
    return new Date(item.vencimiento) < new Date() && item.saldo > 0;
  }

  estadoBadge(item: CtaXPagar): string {
    if (item.saldo <= 0) return 'success';
    if (this.esVencida(item)) return 'danger';
    return 'warning';
  }

  estadoLabel(item: CtaXPagar): string {
    if (item.saldo <= 0) return 'Saldada';
    if (this.esVencida(item)) return 'Vencida';
    return 'Pendiente';
  }

  diasRestantes(item: CtaXPagar): string {
    const hoy  = new Date();
    const venc = new Date(item.vencimiento);
    const diff = Math.ceil((venc.getTime() - hoy.getTime()) / 86_400_000);
    if (diff < 0) return `${Math.abs(diff)}d vencida`;
    if (diff === 0) return 'Vence hoy';
    return `${diff}d`;
  }
}
