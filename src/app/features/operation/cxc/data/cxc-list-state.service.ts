import { Injectable } from '@angular/core';

export interface CxcListState {
  cliente_id: number | null;
  estado: 'pendientes' | 'vencidas' | 'todas';
  page: number;
}

@Injectable({ providedIn: 'root' })
export class CxcListStateService {
  state: CxcListState = {
    cliente_id: null,
    estado: 'pendientes',
    page: 1,
  };
}
