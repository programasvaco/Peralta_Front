export interface EstadoResultadosQuery {
  fecha_inicio: string;
  fecha_fin: string;
  almacen_id?: number | null;
}

export interface GastoMovimiento {
  fecha: string;
  referencia: string;
  cantidad: number;
}

export interface EstadoResultadosResponse {
  fecha_inicio: string;
  fecha_fin: string;
  ventas_periodo: {
    total: number;
    tickets: number;
    contado: number;
    credito: number;
  };
  credito_pendiente: {
    total: number;
    num_cuentas: number;
  };
  recuperacion: {
    total: number;
    abonos: number;
  };
  costo_ventas: number;
  compras_pagadas: {
    total: number;
    contado: number;
    credito_saldado: number;
    num_compras: number;
  };
  pagos_proveedores: {
    total: number;
    num_pagos: number;
  };
  gastos_adicionales: {
    total: number;
    movimientos: GastoMovimiento[];
  };
}
