import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal, HostListener, effect } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, Subject, interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ArticulosService } from '../../../../catalog/articulos/data/articulos.service';
import { CategoriasService } from '../../../../catalog/articulos/data/categorias.service';

import { ClientesService } from '../../../../catalog/clientes/data/clientes.service';
import { FormasPagoService } from '../../../../catalog/formas-pago/data/formas-pago.service';
import { EmpleadosService } from '../../../../catalog/empleados/data/empleados.service';
import { AlmacenesService } from '../../../../settings/pages/almacenes/data/almacenes.service';
import { LoteDisponible, VentaDetallePayload, VentaStorePayload } from '../../data/ventas.models';
import { VentasService } from '../../data/ventas.service';
import { PrinterService } from '../../../../../shared/services/printer.service';
import { getTodayString } from '../../../../../shared/utils/date.utils';
import { NumericKeyboardComponent } from '../../../../../shared/components/numeric-keyboard/numeric-keyboard.component';
import { HorizontalResizeDirective } from '../../../../../shared/directives/horizontal-resize.directive';
import { environment } from '../../../../../../enviroments/environment';


type FieldErrors = Record<string, string[]>;

type CartLine = {
  key: string; // lote_id
  lote: LoteDisponible;

  articulo_id: number;
  lote_id: number;

  cantidad: number;
  precio: number;
  impuestos: number; // por ahora 0
};

@Component({
  selector: 'app-pos-venta',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, NumericKeyboardComponent, HorizontalResizeDirective],
  templateUrl: './pos-venta.component.html',
  styleUrl: './pos-venta.component.scss',
})
export class PosVentaComponent {
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);

  private ventasSvc = inject(VentasService);
  printerSvc = inject(PrinterService);
  private articulosSvc = inject(ArticulosService);
  private categoriasSvc = inject(CategoriasService);

  private clientesSvc = inject(ClientesService);
  private formasPagoSvc = inject(FormasPagoService);
  private almacenesSvc = inject(AlmacenesService);
  private empleadosSvc = inject(EmpleadosService);

  private precioDraft = new Map<string, string>();
  private cantidadDraft = new Map<string, string>();

  // UI
  loadingLotes = signal(false);
  saving = signal(false);
  showLotesModal = signal(false);
  showCheckout = signal(true);
  catsExpanded = signal(false);

  banner = signal<{ type: 'success' | 'danger' | 'info'; text: string } | null>(null);
  fieldErrors = signal<FieldErrors>({});

  // Catálogos
  almacenes = signal<any[]>([]);
  formasPago = signal<any[]>([]);
  empleados = signal<any[]>([]);
  clientes = signal<any[]>([]);
  categorias = signal<{ id: number; descripcion: string }[]>([]);

  // Selecciones (solo UI)
  selectedArticulo = signal<any | null>(null);

  // Búsqueda clientes
  clientesFound = signal<any[]>([]);
  clienteNombreCtrl = this.fb.control('');
  private clienteQuery = signal('');
  clienteDropdownOpen = signal(false);

  clientesFiltrados = computed(() => {
    const q = this.clienteQuery().toLowerCase().trim();
    if (!q) return this.clientes().slice(0, 20);
    return this.clientes()
      .filter(c => c.nombre?.toLowerCase().includes(q))
      .slice(0, 20);
  });

  // Catálogo visual artículos (infinite)
  articuloSearch = signal('');
  categoriaId = signal<number | 'all'>('all');

  gridItems = signal<any[]>([]);
  gridPage = signal(1);
  gridPerPage = signal(50); // aumentado para cargar más items por request
  gridLastPage = signal(1);
  gridTotal = signal(0);
  gridLoading = signal(false);
  gridLoadingMore = signal(false);

  private gridSearch$ = new Subject<string>();

  // Lotes
  lotes = signal<LoteDisponible[]>([]);

  // Ticket
  cart = signal<CartLine[]>([]);

  // Teclado numérico
  kbActiveKey = signal<string | null>(null);   // key del CartLine activo
  kbValue = signal<string>('');            // valor en edición
  kbMode = signal<'qty' | 'price'>('qty');

  // Form
  form = this.fb.group({
    fecha: [this.today(), [Validators.required]],
    almacen_id: [null as number | null, [Validators.required]],
    cliente_id: [null as number | null, [Validators.required]],
    f_pago_id: [null as number | null, [Validators.required]],
    empleado_id: [null as number | null],
    credito: [false],
    dias_credito: [null as number | null],
  });

  // Signal para forzar re-evaluación de canSubmit
  private formTouched = signal(0);

  // Totales (optimizados)
  subtotal = computed(() => {
    const cart = this.cart();
    let sum = 0;
    for (let i = 0; i < cart.length; i++) {
      sum += cart[i].cantidad * cart[i].precio;
    }
    return sum;
  });

  impuestos = computed(() => {
    const cart = this.cart();
    let sum = 0;
    for (let i = 0; i < cart.length; i++) {
      sum += cart[i].impuestos ?? 0;
    }
    return sum;
  });

  total = computed(() => this.subtotal() + this.impuestos());

  linesCount = computed(() => this.cart().length);

  selectedAlmacenName = computed(() => {
    const id = this.form.value.almacen_id;
    if (!id) return '—';
    const a = this.almacenes().find(x => x.id === id);
    return a?.nombre ?? '—';
  });

  selectedPagoName = computed(() => {
    const id = this.form.value.f_pago_id;
    if (!id) return '—';
    const f = this.formasPago().find(x => x.id === id);
    return f?.descripcion ?? '—';
  });

  selectedClienteName = computed(() => {
    const id = this.form.value.cliente_id;
    if (!id) return '—';
    const hit = this.clientes().find(x => x.id === id);
    return hit?.nombre ?? '—';
  });

  canSubmit = computed(() => {
    // Incluir formTouched para forzar re-evaluación
    this.formTouched();

    // Early returns para evitar cálculos innecesarios
    if (this.saving()) return false;

    const cartLength = this.cart().length;
    if (cartLength === 0) return false;

    if (this.form.invalid) return false;

    const credito = this.form.value.credito;
    const diasCredito = this.form.value.dias_credito;
    if (credito && (!diasCredito || diasCredito <= 0)) return false;

    // Validación de líneas del carrito (solo stock, precio no editable)
    const cart = this.cart();
    for (let i = 0; i < cartLength; i++) {
      const line = cart[i];
      const cantidad = line.cantidad;
      const existencia = +line.lote.existencia || 0;

      if (cantidad <= 0 || cantidad > existencia) {
        return false;
      }
    }

    return true;
  });

  // Impresión
  lastVentaId = signal<number | null>(null);
  printing = signal(false);
  showPrintDialog = signal(false);

  printCopies = signal<number>(Number(localStorage.getItem('pos_print_copies')) || 0);
  tileSize    = signal<number>(Number(localStorage.getItem('pos_tile_size'))    || 150);

  confirmOpen = signal(false);
  confirmTitle = signal('Confirmar acción');
  confirmMessage = signal('');
  confirmSub = signal<string | null>(null);
  confirmAcceptText = signal('Eliminar');

  private pendingConfirmAction: (() => void) | null = null;
  private allowNavigation = false;

  constructor() {
    this.loadCatalogos();

    // Timer para reloj
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Forzar actualización del reloj cada segundo
        this.formTouched.update(v => v);
      });

    // Timer para auto-ocultar banner (usando effect)
    effect(() => {
      const b = this.banner();
      if (b) {
        setTimeout(() => {
          if (this.banner() === b) {
            this.banner.set(null);
          }
        }, 5000); // 5 segundos
      }
    });

    // Forzar re-evaluación de canSubmit cuando cambie el form
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.formTouched.update(v => v + 1);
      });

    // crédito -> requiere días, forma de pago opcional
    this.form.controls.credito.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isCredito) => {
        if (isCredito) {
          // Si es crédito: días requeridos, forma de pago opcional y limpiada
          this.form.controls.dias_credito.setValidators([Validators.required, Validators.min(1)]);
          this.form.controls.f_pago_id.clearValidators();
          this.form.controls.f_pago_id.setValue(null); // Limpiar forma de pago
          this.form.controls.f_pago_id.updateValueAndValidity();
        } else {
          // Si no es crédito: días no requeridos, forma de pago requerida
          this.form.controls.dias_credito.clearValidators();
          this.form.controls.dias_credito.setValue(null);
          this.form.controls.f_pago_id.setValidators([Validators.required]);
          this.form.controls.f_pago_id.updateValueAndValidity();
        }
        this.form.controls.dias_credito.updateValueAndValidity();
      });

    // búsqueda live clientes
    this.clienteNombreCtrl.valueChanges
      .pipe(debounceTime(100), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(q => this.clienteQuery.set(q ?? ''));

    // búsqueda live artículos
    this.gridSearch$
      .pipe(debounceTime(150), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => {
        this.articuloSearch.set(q);
        this.resetGridAndLoad();
      });

    // si cambia almacén manualmente: limpiar lotes, selección y recargar grid
    this.form.controls.almacen_id.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.lotes.set([]);
        this.selectedArticulo.set(null);
        this.resetGridAndLoad();
      });
    this.setDefaultsVenta();
  }

  // ====== Inicial ======
  private today(): string {
    return getTodayString();
  }

  private setDefaultsVenta() {
    this.form.patchValue({ f_pago_id: 1, cliente_id: environment.clienteMostrador });
  }

  private loadCatalogos() {
    // almacenes
    this.almacenesSvc.list({ activo: true }).subscribe({
      next: (rows) => {
        this.almacenes.set(rows ?? []);
        if ((rows ?? []).length === 1 && !this.form.value.almacen_id) {
          this.form.patchValue({ almacen_id: rows[0].id }, { emitEvent: false });
        }
        // Cargar el grid una vez que sabemos el almacén disponible
        this.resetGridAndLoad();
      },
      error: () => {
        // silencioso, no bloquear el POS
      }
    });

    // formas pago
    this.formasPagoSvc.list().subscribe({
      next: (rows) => this.formasPago.set(rows ?? []),
      error: () => { }
    });

    // empleados
    this.empleadosSvc.list().subscribe({
      next: (rows) => this.empleados.set((rows ?? []).filter((e: any) => e.activo)),
      error: () => { }
    });

    // clientes
    this.clientesSvc.list({ activo: true, per_page: 500 }).subscribe({
      next: (res: any) => {
        const data = Array.isArray(res) ? res : (res?.data ?? []);
        this.clientes.set(data);
        // Setear nombre del cliente por defecto una vez que la lista esté disponible
        const clientePorDefecto = data.find((c: any) => c.id === this.form.value.cliente_id);
        if (clientePorDefecto) {
          this.clienteNombreCtrl.setValue(clientePorDefecto.nombre, { emitEvent: false });
        }
      },
      error: () => { }
    });

    // categorías (con manejo de errores mejorado)
    this.categoriasSvc.list?.().subscribe?.({
      next: (rows: any) => {
        const data = Array.isArray(rows) ? rows : (rows?.data ?? []);
        const mapped = (data ?? [])
          .map((c: any) => ({
            id: Number(c.id),
            descripcion: String(c.descripcion ?? c.nombre ?? '')
          }))
          .filter((c: any) => !!c.id && !!c.descripcion);

        mapped.sort((a: any, b: any) => a.descripcion.localeCompare(b.descripcion, 'es'));
        this.categorias.set(mapped);
      },
      error: () => {
        this.categorias.set([]);
      },
    });
  }

  // ====== Catálogo Artículos (infinite) ======
  onGridSearch(v: string) {
    this.gridSearch$.next(v);
  }

  setCategoria(id: number | 'all') {
    if (this.categoriaId() === id) return; // evitar reset si es la misma categoría
    this.categoriaId.set(id);
    this.resetGridAndLoad();
  }

  resetGridAndLoad() {
    this.gridItems.set([]);
    this.gridPage.set(1);
    this.gridLastPage.set(1);
    this.gridTotal.set(0);
    this.fetchGridPage(1, false);
  }

  fetchGridPage(page: number, append: boolean) {
    const search = (this.articuloSearch() ?? '').trim();
    const cat = this.categoriaId();

    // Si hay búsqueda por texto, ignorar filtro de categoría
    const categoria_id = search
      ? null
      : (cat === 'all' ? null : (Number.isFinite(Number(cat)) ? Number(cat) : null));

    if (!append) this.gridLoading.set(true);
    else this.gridLoadingMore.set(true);

    const almacenId = this.form.value.almacen_id;
    if (!almacenId) {
      this.gridLoading.set(false);
      this.gridLoadingMore.set(false);
      return;
    }

    this.articulosSvc
      .conExistencia({
        almacen_id: almacenId,
        page,
        per_page: this.gridPerPage(),
        search: search || undefined,
        categoria_id: categoria_id,
      })
      .subscribe({
        next: (res: any) => {
          const data = res?.data ?? [];
          const last = Number(res?.last_page ?? 1);
          const total = Number(res?.total ?? data.length ?? 0);

          this.gridLastPage.set(last);
          this.gridTotal.set(total);
          this.gridPage.set(Number(res?.current_page ?? page));

          const merged = append ? [...this.gridItems(), ...data] : data;
          this.gridItems.set(merged);

          this.gridLoading.set(false);
          this.gridLoadingMore.set(false);
        },
        error: () => {
          this.gridLoading.set(false);
          this.gridLoadingMore.set(false);
          this.banner.set({ type: 'danger', text: 'No se pudo cargar el catálogo de artículos.' });
        },
      });
  }

  onGridScroll(ev: Event) {
    const el = ev.target as HTMLElement;
    if (!el) return;

    // threshold más agresivo para cargar antes
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 100;
    if (!nearBottom) return;

    if (this.gridLoading() || this.gridLoadingMore()) return;

    const page = this.gridPage();
    const last = this.gridLastPage();

    if (page >= last) return;

    this.fetchGridPage(page + 1, true);
  }

  imgSrc(a: any): string {
    return `${environment.apiBaseUrl}/storage/${a.imagen}`;
  }

  selectArticulo(a: any) {
    const almacenId = this.form.value.almacen_id;
    if (!almacenId) {
      this.banner.set({ type: 'info', text: 'Selecciona un almacén antes de elegir artículos.' });
      return;
    }

    this.banner.set(null);
    this.selectedArticulo.set(a);
    this.loadLotes(a.id);
  }

  closeLotesModal() {
    this.showLotesModal.set(false);
  }

  selectLote(l: LoteDisponible) {
    this.addLote(l);
    this.closeLotesModal();
  }

  refreshLotes() {
    const art = this.selectedArticulo();
    if (!art?.id) return;
    this.loadLotes(art.id);
  }

  private loadLotes(articuloId: number) {
    const almacenId = this.form.value.almacen_id;
    if (!almacenId) return;

    this.loadingLotes.set(true);

    this.ventasSvc
      .lotesDisponibles({
        almacen_id: almacenId,
        articulo_id: articuloId,
        variedad: null, // Ya no usamos búsqueda de variedad
      })
      .subscribe({
        next: (rows) => {
          this.lotes.set(rows ?? []);
          this.loadingLotes.set(false);
          if (!rows?.length) {
            this.banner.set({ type: 'danger', text: 'Sin existencia disponible para este artículo.' });
          } else if (rows.length === 1) {
            this.selectLote(rows[0]);
          } else {
            this.showLotesModal.set(true);
          }
        },
        error: (err) => {
          this.loadingLotes.set(false);
          this.banner.set({
            type: 'danger',
            text: err?.error?.message ?? 'No se pudieron cargar los lotes.',
          });
        },
      });
  }

  // ====== Clientes ======
  onClienteInput(valor: string) {
    this.clienteNombreCtrl.setValue(valor, { emitEvent: false });
    this.clienteQuery.set(valor);
    this.clienteDropdownOpen.set(true);
    // Si borra el texto, limpiar selección
    if (!valor.trim()) this.form.patchValue({ cliente_id: null });
  }

  onClienteFocus() {
    this.clienteDropdownOpen.set(true);
  }

  onClienteBlur() {
    setTimeout(() => this.clienteDropdownOpen.set(false), 200);
  }

  onClienteClear() {
    this.clienteNombreCtrl.setValue('', { emitEvent: false });
    this.clienteQuery.set('');
    this.form.patchValue({ cliente_id: null });
    this.clienteDropdownOpen.set(true);
    this.clearBackendError('cliente_id');
  }

  onClienteSelect(c: any) {
    this.clienteNombreCtrl.setValue(c.nombre, { emitEvent: false });
    this.clienteQuery.set('');
    this.clienteDropdownOpen.set(false);
    this.form.patchValue({ cliente_id: c.id });
    this.clearBackendError('cliente_id');
  }

  onClienteInputChange(nombre: string) {
    const match = this.clientes().find(c => c.nombre === nombre);
    if (match) {
      this.form.patchValue({ cliente_id: match.id });
      this.clearBackendError('cliente_id');
    } else {
      this.form.patchValue({ cliente_id: null });
    }
  }

  selectCliente(c: any) {
    this.onClienteSelect(c);
  }

  // ====== Teclado numérico ======
  openKb(key: string, currentValue: number) {
    this.kbMode.set('qty');
    this.kbActiveKey.set(key);
    this.kbValue.set(String(currentValue));
  }

  openKbPrice(key: string, currentPrice: number) {
    this.kbMode.set('price');
    this.kbActiveKey.set(key);
    this.kbValue.set(String(currentPrice));
  }

  onKbChange(val: string) {
    this.kbValue.set(val);
  }

  onKbConfirm(val: string) {
    const key = this.kbActiveKey();
    if (key) {
      if (this.kbMode() === 'price') {
        this.setPrecio(key, val || '0');
        this.commitPrecio(key);
      } else {
        this.setQty(key, val || '0');
        this.commitQty(key);
      }
    }
    this.kbActiveKey.set(null);
  }

  onKbCancel() {
    this.kbActiveKey.set(null);
  }

  // ====== Ticket ======

  /** Devuelve el precio que corresponde según la cantidad: mayoreo si cantidad >= unidades_mayoreo, normal en otro caso. */
  private resolvePrice(lote: LoteDisponible, cantidad: number): number {
    const mayoreo = this.toNumber(lote.articulo?.unidades_mayoreo ?? 0);
    if (mayoreo > 0 && cantidad >= mayoreo) {
      return this.toNumber(lote.precio_min);
    }
    return this.toNumber(lote.precio);
  }

  addLote(l: LoteDisponible) {
    const key = String(l.id);
    const existing = this.cart().find((x) => x.key === key);

    if (existing) {
      const newCantidad = existing.cantidad + 1;
      const newPrecio = this.resolvePrice(l, newCantidad);
      this.cart.set(
        this.cart().map((x) =>
          x.key === key ? { ...x, cantidad: newCantidad, precio: newPrecio } : x,
        ),
      );      
      return;
    }

    const line: CartLine = {
      key,
      lote: l,
      articulo_id: l.articulo_id,
      lote_id: l.id,
      cantidad: 1,
      precio: this.resolvePrice(l, 1),
      impuestos: 0,
    };

    this.cart.set([line, ...this.cart()]);
    this.openKb(key, 1);
  }

  removeLine(key: string) {
    const line = this.cart().find((x) => x.key === key);
    if (!line) return;

    const nombre = line?.lote?.articulo?.nombre ?? 'este artículo';

    this.openConfirm({
      title: 'Eliminar artículo',
      message: `¿Seguro que quieres eliminar "${nombre}" del ticket?`,
      sub: 'Esta acción no se puede deshacer.',
      acceptText: 'Eliminar',
      onAccept: () => {
        this.cart.set(this.cart().filter((x) => x.key !== key));
        this.cantidadDraft.delete(key);
        this.precioDraft.delete(key);
      },
    });
  }

  bumpQty(key: string, delta: number) {
    const line = this.cart().find((x) => x.key === key);
    if (!line) return;

    const current = Number(line.cantidad) || 0;
    const next = current + delta;

    if (next <= 0) {
      const nombre = line?.lote?.articulo?.nombre ?? 'este artículo';

      this.openConfirm({
        title: 'Eliminar artículo',
        message: `La cantidad quedará en 0. ¿Quieres eliminar "${nombre}" del ticket?`,
        sub: 'También puedes cancelar y ajustar la cantidad manualmente.',
        acceptText: 'Eliminar',
        onAccept: () => {
          this.cart.set(this.cart().filter((x) => x.key !== key));
        },
      });

      return;
    }

    this.cart.set(
      this.cart().map((x) => {
        if (x.key !== key) return x;
        return { ...x, cantidad: this.round2(next), precio: this.resolvePrice(x.lote, next) };
      }),
    );
  }

  private maxStock(line: CartLine): number {
    return +line.lote.existencia || 0;
  }

  isOverStock(line: CartLine): boolean {
    return line.cantidad > (+line.lote.existencia || 0);
  }

  isBelowMinPrice(line: CartLine): boolean {
    return line.precio < (+line.lote.precio_min || 0);
  }

  setQty(key: string, raw: any) {
    const line = this.cart().find((x) => x.key === key);
    if (!line) return;

    const s = String(raw ?? '');

    // Guardamos el draft
    this.cantidadDraft.set(key, s);

    // Intentamos parsear
    const normalized = s.replace(',', '.').trim();

    // Estados intermedios
    if (
      normalized === '' ||
      normalized === '.' ||
      normalized === '-' ||
      normalized === '-.' ||
      normalized.endsWith('.')
    ) {
      return;
    }

    const n = Number(normalized);
    if (!Number.isFinite(n)) return;

    if (n <= 0) {
      const nombre = line?.lote?.articulo?.nombre ?? 'este artículo';

      this.openConfirm({
        title: 'Eliminar artículo',
        message: `La cantidad quedará en 0. ¿Quieres eliminar "${nombre}" del ticket?`,
        sub: 'Si cancelas, no se aplicará el cambio.',
        acceptText: 'Eliminar',
        onAccept: () => {
          this.cart.set(this.cart().filter((x) => x.key !== key));
          this.cantidadDraft.delete(key);
        },
      });

      return;
    }

    const safe = Math.max(0, n);

    // Solo actualizar si cambió
    if (line.cantidad !== safe) {
      this.cart.set(
        this.cart().map((x) => {
          if (x.key !== key) return x;
          return { ...x, cantidad: safe, precio: this.resolvePrice(x.lote, safe) };
        }),
      );
    }
  }

  commitQty(key: string) {
    const line = this.cart().find((x) => x.key === key);
    if (!line) return;

    const draft = this.cantidadDraft.get(key);
    if (draft === undefined) {
      this.cart.set(this.cart().map((x) => (x.key === key ? { ...x, cantidad: this.round2(Math.max(0, +x.cantidad || 0)) } : x)));
      return;
    }

    const normalized = draft.replace(',', '.').trim();
    const n = Number(normalized);

    if (!Number.isFinite(n)) {
      this.cantidadDraft.delete(key);
      return;
    }

    const final = this.round2(Math.max(0.01, n));

    this.cantidadDraft.delete(key);

    if (line.cantidad !== final) {
      this.cart.set(
        this.cart().map((x) => {
          if (x.key !== key) return x;
          return { ...x, cantidad: final, precio: this.resolvePrice(x.lote, final) };
        }),
      );
    }
  }

  cantidadView(key: string, fallback: number) {
    const d = this.cantidadDraft.get(key);
    return d !== undefined ? d : String(fallback ?? 0);
  }

  setPrecio(key: string, raw: any) {
    const line = this.cart().find((x) => x.key === key);
    if (!line) return;

    const s = String(raw ?? '');

    // guardamos lo que el usuario está tecleando, tal cual
    this.precioDraft.set(key, s);

    // Intentamos parsear SIN forzar formato (sin round2) para no brincar el cursor.
    // Permitimos estados intermedios como: "", ".", "20.", "20,", "-".
    const normalized = s.replace(',', '.').trim();

    // Si está vacío o es un estado incompleto, no actualizamos el número todavía.
    if (
      normalized === '' ||
      normalized === '.' ||
      normalized === '-' ||
      normalized === '-.' ||
      normalized.endsWith('.')
    ) {
      return;
    }

    const p = Number(normalized);
    if (!Number.isFinite(p)) return;

    const safe = Math.max(0, p);

    // Actualiza el precio numérico SIN redondear (para no “formatear” mientras escribe)
    this.cart.set(
      this.cart().map((x) => (x.key === key ? { ...x, precio: safe } : x)),
    );
  }

  commitPrecio(key: string) {
    const line = this.cart().find((x) => x.key === key);
    if (!line) return;

    const draft = this.precioDraft.get(key);
    // si no hay draft, igual aseguramos round2 al valor actual
    if (draft === undefined) {
      this.cart.set(this.cart().map((x) => (x.key === key ? { ...x, precio: this.round2(Math.max(0, +x.precio || 0)) } : x)));
      return;
    }

    const normalized = draft.replace(',', '.').trim();
    const p = Number(normalized);

    if (!Number.isFinite(p)) {
      // si quedó algo raro, regresamos al valor numérico actual
      this.precioDraft.delete(key);
      return;
    }

    const final = this.round2(Math.max(0, p));

    this.precioDraft.delete(key);

    this.cart.set(
      this.cart().map((x) => (x.key === key ? { ...x, precio: final } : x)),
    );
  }

  precioView(key: string, fallback: number) {
    const d = this.precioDraft.get(key);
    return d !== undefined ? d : String(fallback ?? 0);
  }

  // TrackBy para evitar re-render completo del ngFor
  trackByKey(_index: number, item: CartLine): string {
    return item.key;
  }

  trackByArticuloId(_index: number, item: any): number {
    return item.id;
  }

  trackByLoteId(_index: number, item: LoteDisponible): number {
    return item.id;
  }

  trackByCategoriaId(_index: number, item: any): number {
    return item.id;
  }

  // ====== Guardar ======
  submitVenta() {
    this.banner.set(null);
    this.fieldErrors.set({});
    this.form.markAllAsTouched();

    if (!this.canSubmit()) return;

    const raw = this.form.getRawValue();

    const detalles: VentaDetallePayload[] = this.cart().map((x) => ({
      articulo_id: x.articulo_id,
      lote_id: x.lote_id,
      cantidad: x.cantidad,
      empaque: 0,
      precio: x.precio,
      impuestos: 0,
    }));

    const payload: VentaStorePayload = {
      fecha: raw.fecha!,
      cliente_id: raw.cliente_id!,
      almacen_id: raw.almacen_id!,
      f_pago_id: raw.f_pago_id!,
      empleado_id: raw.empleado_id ?? null,
      credito: !!raw.credito,
      dias_credito: raw.credito ? (raw.dias_credito ?? undefined) : undefined,
      subtotal: this.round2(this.subtotal()),
      impuestos: 0,
      total: this.round2(this.total()),
      detalles,
    };

    this.saving.set(true);

    this.ventasSvc.store(payload).subscribe({
      next: (res) => {
        this.saving.set(false);
        const ventaId = res?.venta?.id ?? null;
        this.lastVentaId.set(ventaId);
        this.banner.set({ type: 'success', text: res?.message ?? 'Venta registrada.' });
        if (ventaId) this.showPrintDialog.set(true);

        // reset conservando almacén/pago
        const keepAlmacen = raw.almacen_id;
        const keepPago = raw.f_pago_id;

        this.cart.set([]);
        this.lotes.set([]);
        this.selectedArticulo.set(null);

        this.clientesFound.set([]);
        this.clienteQuery.set('');
        this.clienteDropdownOpen.set(false);

        this.form.reset({
          fecha: this.today(),
          almacen_id: keepAlmacen,
          cliente_id: environment.clienteMostrador,
          f_pago_id: keepPago,
          credito: false,
          dias_credito: null,
        });

        const clienteDefault = this.clientes().find(c => c.id === environment.clienteMostrador);
        this.clienteNombreCtrl.setValue(clienteDefault?.nombre ?? '', { emitEvent: false });
      },
      error: (err) => {
        this.saving.set(false);

        if (err?.status === 422) {
          this.banner.set({ type: 'danger', text: err?.error?.message ?? 'Revisa los datos.' });
          if (err?.error?.errors) this.fieldErrors.set(err.error.errors as FieldErrors);
          return;
        }

        this.banner.set({ type: 'danger', text: err?.error?.message ?? 'Error al registrar la venta.' });
      },
    });
  }

  // ====== Impresión ======
  printTicket(ventaId: number | null = this.lastVentaId(), copies = 0) {
    if (!ventaId) return;

    this.printing.set(true);

    this.ventasSvc.getTicket(ventaId, 48).subscribe({
      next: async (data) => {
        try {
          const total = 1 + copies;
          for (let i = 0; i < total; i++) {
            await this.printerSvc.print(data);
          }
          this.banner.set({ type: 'success', text: 'Ticket enviado a la impresora.' });
        } catch (err: any) {
          this.banner.set({
            type: 'danger',
            text: err?.message ?? 'Error al enviar a la impresora.',
          });
        } finally {
          this.printing.set(false);
        }
      },
      error: () => {
        this.printing.set(false);
        this.banner.set({ type: 'danger', text: 'Error al obtener el ticket del servidor.' });
      },
    });
  }

  onTileSizeChange(v: number) {
    this.tileSize.set(v);
    localStorage.setItem('pos_tile_size', String(v));
  }

  confirmPrint() {
    const copies = this.printCopies();
    localStorage.setItem('pos_print_copies', String(copies));
    this.showPrintDialog.set(false);
    this.printTicket(this.lastVentaId(), copies);
  }

  declinePrint() {
    this.showPrintDialog.set(false);
  }

  // ====== Helpers ======
  currentTime(): string {
    const d = new Date();
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }

  nuevaVenta() {
    window.open(window.location.href, '_blank');
  }

  confirmExit(event: Event) {
    if (this.cart().length === 0) {
      // Si no hay items, navegar directamente sin confirmación
      this.router.navigate(['/dashboard']);
      return;
    }

    // Prevenir la navegación
    event.preventDefault();

    // Mostrar modal de confirmación personalizado
    this.openConfirm({
      title: 'Salir del POS',
      message: 'Tienes items en el carrito. ¿Seguro que quieres salir?',
      sub: 'Se perderá la venta actual y no podrás recuperarla.',
      acceptText: 'Salir',
      onAccept: () => {
        // Permitir navegación y ejecutar
        this.allowNavigation = true;
        this.router.navigate(['/dashboard']);
      },
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any): void {
    if (this.cart().length > 0) {
      $event.returnValue = 'Tienes items en el carrito. ¿Seguro que quieres salir? Se perderá la venta actual.';
    }
  }

  money(n: number): string {
    return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private toNumber(v: any): number {
    const n = typeof v === 'string' ? Number(v) : Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private round2(v: number): number {
    return Math.round(v * 100) / 100;
  }

  backendError(field: string): string | null {
    return this.fieldErrors()[field]?.[0] ?? null;
  }

  clearBackendError(field: string) {
    const errs = { ...this.fieldErrors() };
    if (errs[field]) {
      delete errs[field];
      this.fieldErrors.set(errs);
    }
  }

  openConfirm(opts: {
    title?: string;
    message: string;
    sub?: string | null;
    acceptText?: string;
    onAccept: () => void;
  }) {
    this.confirmTitle.set(opts.title ?? 'Confirmar acción');
    this.confirmMessage.set(opts.message);
    this.confirmSub.set(opts.sub ?? null);
    this.confirmAcceptText.set(opts.acceptText ?? 'Aceptar');
    this.pendingConfirmAction = opts.onAccept;
    this.confirmOpen.set(true);
  }

  cancelConfirm() {
    this.pendingConfirmAction = null;
    this.confirmOpen.set(false);
  }

  acceptConfirm() {
    const action = this.pendingConfirmAction;
    this.pendingConfirmAction = null;
    this.confirmOpen.set(false);
    action?.();
  }
}