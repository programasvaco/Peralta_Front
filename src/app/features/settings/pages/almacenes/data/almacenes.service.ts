import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Almacen, AlmacenShowResponse, InventarioItem } from './almacenes.models';
import { environment } from '../../../../../../enviroments/environment';

export interface AlmacenesQuery {
  activo?: boolean | null;
}

@Injectable({
  providedIn: 'root',
})
export class AlmacenesService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(q?: AlmacenesQuery): Observable<Almacen[]> {
    let params = new HttpParams();

    if (q?.activo !== null && q?.activo !== undefined) {
      params = params.set('activo', String(q.activo));
    }

    return this.http.get<Almacen[]>(`${this.base}/api/almacenes`, { params });
  }

  get(id: number): Observable<AlmacenShowResponse | any> {
    return this.http.get(`${this.base}/api/almacenes/${id}`);
  }

  create(payload: FormData): Observable<any> {
    return this.http.post(`${this.base}/api/almacenes`, payload);
  }

  update(id: number, payload: FormData): Observable<any> {
    // Laravel no acepta archivos via PUT; usamos POST con _method spoofing
    return this.http.post(`${this.base}/api/almacenes/${id}`, payload);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.base}/api/almacenes/${id}`);
  }

  inventario(id: number, soloConStock?: boolean): Observable<InventarioItem[]> {
    let params = new HttpParams();
    if (soloConStock) params = params.set('solo_con_stock', 'true');

    return this.http.get<InventarioItem[]>(
      `${this.base}/api/almacenes/${id}/inventario`,
      { params },
    );
  }
}
