export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface CxcDetalle {
  id: number;
  cxc_id: number;
  fecha: string;
  importe: number;
  concepto?: string | null;
  f_pago_id: number | null;
  forma_pago?: { id: number; descripcion: string } | null;
}

export interface CtaXCobrar {
  id: number;
  fecha: string;
  vencimiento: string;
  cliente_id: number;
  venta_id?: number | null;
  importe: number;
  saldo: number;

  cliente?: { id: number; nombre: string } | null;
  venta?: { id: number; fecha: string } | null;
  detalles?: CxcDetalle[];
}

export interface CxcResumen {
  total_pendiente: number;
  total_vencido: number;
  por_vencer_7dias: number;
  num_cuentas: number;
  num_vencidas: number;
}

export interface CxcQuery {
  cliente_id?: number | null;
  todas?: boolean;
  vencidas?: boolean;
  per_page?: number | null;
  page?: number | null;
}

export interface AbonarPayload {
  importe: number;
  f_pago_id: number;
}
