export interface Empaque {
  id: number;
  descripcion: string;
  dimensiones?: string | null;
  peso?: number | null;
  existencias: number;
  activo: boolean;
}

export interface EmpaqueClienteSaldo {
  id: number;
  empaque_id: number;
  cliente_id: number;
  saldo: number;
  empaque?: Empaque;
  cliente?: { id: number; nombre: string; telefono?: string | null; ciudad?: string | null };
}

export interface EmpaqueMovimiento {
  id: number;
  folio: string;
  fecha: string;
  empaque_id: number;
  cliente_id: number;
  tipo: 'salida' | 'entrada';
  cantidad: number;
  notas?: string | null;
  user_id: number;
  empaque?: Empaque;
  cliente?: { id: number; nombre: string };
  user?: { id: number; name: string };
  created_at: string;
}

export interface MovimientoPayload {
  fecha: string;
  empaque_id: number;
  cliente_id: number;
  tipo: 'salida' | 'entrada';
  cantidad: number;
  notas?: string | null;
}
