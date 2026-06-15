export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface CxpDetalle {
  id: number;
  cxp_id: number;
  fecha: string;
  importe: number;
  f_pago_id: number;
  tipo: 'Abono' | 'Cargo';
  forma_pago?: { id: number; descripcion: string } | null;
}

export interface CompraDetalleRef {
  id: number;
  compra_id: number;
  inventario_id: number;
  cantidad: string | number;
  costo: string | number;
  impuestos?: string | number | null;
  inventario?: {
    id: number;
    articulo_id: number;
    variedad?: string | null;
    articulo?: { id: number; nombre: string; nombre_corto?: string } | null;
  } | null;
}

export interface CtaXPagar {
  id: number;
  fecha: string;
  vencimiento: string;
  proveedor_id: number;
  compra_id?: number | null;
  importe: number;
  saldo: number;

  proveedor?: { id: number; nombre: string } | null;
  compra?: {
    id: number;
    fecha: string;
    total?: number;
    detalles?: CompraDetalleRef[];
  } | null;
  detalles?: CxpDetalle[];
}

export interface CxpResumen {
  total_pendiente: number;
  total_vencido: number;
  por_vencer_7dias: number;
  num_cuentas: number;
  num_vencidas: number;
}

export interface CxpQuery {
  proveedor_id?: number | null;
  todas?: boolean;
  vencidas?: boolean;
  per_page?: number | null;
  page?: number | null;
}

export interface PagarPayload {
  importe: number;
  f_pago_id: number;
  tipo: 'Abono' | 'Cargo';
}
