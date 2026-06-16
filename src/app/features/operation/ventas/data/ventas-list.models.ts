export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface VentaListItem {
  id: number;
  fecha: string;
  cliente_id: number;
  almacen_id: number;
  f_pago_id: number;
  subtotal: number;
  impuestos?: number | null;
  total: number;
  credito?: boolean | null;
  estatus?: string | null;

  cliente?: { id: number; nombre: string } | null;
  almacen?: { id: number; descripcion: string; direccion: string; ciudad?: string; telefono?: string; } | null;
  forma_pago?: { id: number; descripcion: string } | null;
  user?: { id: number; name: string } | null;
}

export interface VentaDetalle {
  id: number;
  venta_id?: number;
  articulo_id: number;
  cantidad: number;
  precio: number;
  impuestos?: number | null;
  subtotal?: number | null;

  articulo?: { id: number; nombre: string; nombre_corto?: string; unidad?: string | null } | null;
  lote?: {id: number; variedad?: string | null} | null;
}

export interface VentaShow extends VentaListItem {
  dias_credito?: number | null;
  detalles?: VentaDetalle[];
}

export interface VentasQuery {
  fecha?: string | null;
  almacen_id?: number | null;
  per_page?: number | null;
  page?: number | null;
}

export interface ReporteVentasQuery {
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  almacen_id?: number | null;
}

export interface VentaPorArticuloRow {
  id: number;
  nombre: string;
  unidad?: string | null;
  cantidad: number;
  subtotal: number;
  impuestos: number;
  total: number;
}

export interface ResumenPorArticuloResponse {
  fecha_inicio: string;
  fecha_fin: string;
  articulos: VentaPorArticuloRow[];
  totales: { cantidad: number; subtotal: number; impuestos: number; total: number };
}

export interface VentaFormaPagoRow {
  f_pago_id: number | null;
  forma_pago: string;
  tickets: number;
  total: number;
}

export interface ResumenFormasPagoResponse {
  fecha_inicio: string;
  fecha_fin: string;
  formas_pago: VentaFormaPagoRow[];
  totales: { tickets: number; total: number };
}
