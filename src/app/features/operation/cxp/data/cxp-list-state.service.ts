import { Injectable } from '@angular/core';

export interface CxpListState {
  proveedor_id: number | null;
  estado: 'pendientes' | 'vencidas' | 'todas';
  page: number;
}

@Injectable({ providedIn: 'root' })
export class CxpListStateService {
  state: CxpListState = {
    proveedor_id: null,
    estado: 'pendientes',
    page: 1,
  };
}
