import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../../enviroments/environment';
import {
  PaginatedResponse,
  ReporteVentasQuery,
  ResumenFormasPagoResponse,
  ResumenPorArticuloResponse,
  VentaListItem,
  VentaShow,
  VentasQuery,
} from './ventas-list.models';

@Injectable({ providedIn: 'root' })
export class VentasListService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(q: VentasQuery = {}): Observable<PaginatedResponse<VentaListItem> | VentaListItem[]> {
    let params = new HttpParams();

    if (q.fecha)       params = params.set('fecha', q.fecha);
    if (q.almacen_id)  params = params.set('almacen_id', String(q.almacen_id));
    if (q.per_page)    params = params.set('per_page', String(q.per_page));
    if (q.page)        params = params.set('page', String(q.page));

    return this.http.get<PaginatedResponse<VentaListItem> | VentaListItem[]>(
      `${this.base}/api/ventas`,
      { params },
    );
  }

  get(id: number): Observable<VentaShow> {
    return this.http.get<VentaShow>(`${this.base}/api/ventas/${id}`);
  }

  porArticulo(q: ReporteVentasQuery = {}): Observable<ResumenPorArticuloResponse> {
    let params = new HttpParams();

    if (q.fecha_inicio) params = params.set('fecha_inicio', q.fecha_inicio);
    if (q.fecha_fin)    params = params.set('fecha_fin', q.fecha_fin);
    if (q.almacen_id)   params = params.set('almacen_id', String(q.almacen_id));

    return this.http.get<ResumenPorArticuloResponse>(
      `${this.base}/api/ventas/reportes/por-articulo`,
      { params },
    );
  }

  formasPago(q: ReporteVentasQuery = {}): Observable<ResumenFormasPagoResponse> {
    let params = new HttpParams();

    if (q.fecha_inicio) params = params.set('fecha_inicio', q.fecha_inicio);
    if (q.fecha_fin)    params = params.set('fecha_fin', q.fecha_fin);
    if (q.almacen_id)   params = params.set('almacen_id', String(q.almacen_id));

    return this.http.get<ResumenFormasPagoResponse>(
      `${this.base}/api/ventas/reportes/formas-pago`,
      { params },
    );
  }
}
