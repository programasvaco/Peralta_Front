import { Injectable } from '@angular/core';
import { getTodayString } from '../../../../../shared/utils/date.utils';

export interface ComprasListState {
  proveedor_id: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  mes: number | null;
  anio: number | null;
  page: number;
}

@Injectable({ providedIn: 'root' })
export class ComprasListStateService {
  state: ComprasListState = {
    proveedor_id: null,
    fecha_inicio: getTodayString(),
    fecha_fin: getTodayString(),
    mes: null,
    anio: null,
    page: 1,
  };
}
