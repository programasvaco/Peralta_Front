export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface Compra {
  id: number;
  fecha: string; // YYYY-MM-DD
  referencia: string;
  proveedor_id: number;
  user_id: number;
  subtotal: number;
  impuestos: number;
  total: number;
  estatus?: string | null;

  proveedor?: { id: number; nombre: string; rfc?: string | null };
  user?: { id: number; name: string };

  detalles?: CompraDetalle[];
  cta_por_pagar?: any;
}

export interface CompraDetalle {
  id?: number;
  compra_id?: number;
  inventario_id?: number;
  articulo_id?: number;
  variedad?: string;
  cantidad: number | string;
  empaque?: number | string | null;
  costo: number | string;
  impuestos?: number | string | null;

  inventario?: {
    id: number;
    almacen_id?: number;
    articulo_id: number;
    variedad?: string | null;
    precio?: string | number | null;
    precio_min?: string | number | null;
    articulo?: {
      id: number;
      nombre: string;
      categoria?: { id: number; descripcion: string };
    } | null;
  } | null;

  articulo?: {
    id: number;
    nombre: string;
    categoria?: { id: number; descripcion: string };
  } | null;
}

export interface CompraShowResponse {
  id: number;
  fecha: string;
  referencia: string;
  proveedor_id: number;
  almacen_id?: number | null;
  subtotal: number;
  impuestos: number;
  total: number;
  estatus?: string | null;

  proveedor?: { id: number; nombre: string; rfc?: string | null };
  user?: { id: number; name: string };

  detalles: CompraDetalle[];

  cta_por_pagar?: any;
  ctaPorPagar?: any;
}

export interface CompraCreatePayload {
  fecha: string;
  referencia?: string | null;
  proveedor_id: number;
  almacen_id: number;

  subtotal: number;
  impuestos?: number;
  total: number;

  credito?: boolean;
  dias_credito?: number;

  f_pago_id?: number; // required_unless credito=true

  detalles: Array<{
    articulo_id: number;
    variedad: string;
    cantidad: number;
    empaque?: number;
    costo: number;
    impuestos?: number;
    precio: number;
    precio_min: number;
  }>;
}