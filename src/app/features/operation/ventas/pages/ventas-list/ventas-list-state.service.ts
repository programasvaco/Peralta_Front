import { Injectable } from '@angular/core';
import { getTodayString } from '../../../../../shared/utils/date.utils';

export interface VentasListState {
  almacen_id: number | null;
  fecha: string | null;
}

@Injectable({ providedIn: 'root' })
export class VentasListStateService {
  state: VentasListState = {
    almacen_id: null,
    fecha: getTodayString(),
  };
}
