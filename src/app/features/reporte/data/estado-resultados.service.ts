import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../enviroments/environment';
import { EstadoResultadosQuery, EstadoResultadosResponse } from './estado-resultados.models';

@Injectable({ providedIn: 'root' })
export class EstadoResultadosService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  get(q: EstadoResultadosQuery): Observable<EstadoResultadosResponse> {
    let params = new HttpParams()
      .set('fecha_inicio', q.fecha_inicio)
      .set('fecha_fin',    q.fecha_fin);

    if (q.almacen_id) params = params.set('almacen_id', String(q.almacen_id));

    return this.http.get<EstadoResultadosResponse>(
      `${this.base}/api/reportes/estado-resultados`,
      { params },
    );
  }
}
