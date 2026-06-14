export interface Almacen {
  id: number;
  descripcion: string;
  direccion: string;
  ciudad?: string | null;
  telefono?: string | null;
  activo: boolean;
  imagen?: string | null;
}

export interface AlmacenShowResponse {
  almacen: Almacen;
  valor_inventario: number;
}

export interface InventarioItem {
  id: number;
  articulo_id: number;
  existencia: number;
  costo: number;
  precio?: number | null;
  precio_min?: number | null;
  variedad?: string | null;
  empaque?: number | null;
  articulo?: {
    id: number;
    nombre: string;
    nombre_corto?: string;
    unidad?: string;
    categoria?: { id: number; descripcion: string; activo: boolean };
  };
}