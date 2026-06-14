export interface Empaque {
  id: number;
  descripcion: string;
  dimensiones?: string | null;
  peso?: number | null;
  existencias: number;
  activo: boolean;
}

export interface EmpaqueShowResponse {
  empaque: Empaque;
  total_prestado: number;
}
