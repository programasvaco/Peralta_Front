import { Injectable } from '@angular/core';

export interface CortesListState {
  mes: number;
  anio: number;
  almacenId: number | null;
}

@Injectable({ providedIn: 'root' })
export class CortesListStateService {
  private now = new Date();

  state: CortesListState = {
    mes: this.now.getMonth() + 1,
    anio: this.now.getFullYear(),
    almacenId: null,
  };
}
