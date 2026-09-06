import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../enviroments/environment';
import { Empaque, EmpaqueClienteSaldo, EmpaqueMovimiento, MovimientoPayload } from './empaques.models';

export interface ImprimirResponse {
  ok: boolean;
  job_id: string;
}

export interface SaldosQuery {
  empaque_id?: number | null;
  cliente_id?: number | null;
  con_saldo?: boolean;
}

export interface MovimientosQuery {
  empaque_id?: number | null;
  cliente_id?: number | null;
  tipo?: 'salida' | 'entrada' | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  per_page?: number;
}

@Injectable({ providedIn: 'root' })
export class EmpaquesService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  listEmpaques(activo?: boolean): Observable<Empaque[]> {
    let params = new HttpParams();
    if (activo !== undefined) params = params.set('activo', String(activo));
    return this.http.get<Empaque[]>(`${this.base}/api/empaques`, { params });
  }

  saldos(q?: SaldosQuery): Observable<EmpaqueClienteSaldo[]> {
    let params = new HttpParams();
    if (q?.empaque_id != null) params = params.set('empaque_id', String(q.empaque_id));
    if (q?.cliente_id != null) params = params.set('cliente_id', String(q.cliente_id));
    if (q?.con_saldo)          params = params.set('con_saldo', 'true');
    return this.http.get<EmpaqueClienteSaldo[]>(`${this.base}/api/empaques/saldos`, { params });
  }

  movimientos(q?: MovimientosQuery): Observable<EmpaqueMovimiento[]> {
    let params = new HttpParams();
    if (q?.empaque_id != null)  params = params.set('empaque_id', String(q.empaque_id));
    if (q?.cliente_id != null)  params = params.set('cliente_id', String(q.cliente_id));
    if (q?.tipo)                params = params.set('tipo', q.tipo);
    if (q?.fecha_inicio)        params = params.set('fecha_inicio', q.fecha_inicio);
    if (q?.fecha_fin)           params = params.set('fecha_fin', q.fecha_fin);
    if (q?.per_page)            params = params.set('per_page', String(q.per_page));
    return this.http.get<EmpaqueMovimiento[]>(`${this.base}/api/empaque-movimientos`, { params });
  }

  registrarMovimiento(payload: MovimientoPayload): Observable<any> {
    return this.http.post(`${this.base}/api/empaque-movimientos`, payload);
  }

  /**
   * Pide al backend generar el ticket del movimiento y despacharlo por
   * WebSocket (Reverb) al print-agent de la sucursal activa.
   */
  imprimir(movimientoId: number, opts: { cols?: number; copies?: number } = {}): Observable<ImprimirResponse> {
    const { cols = 48, copies = 1 } = opts;
    return this.http.post<ImprimirResponse>(`${this.base}/api/empaque-movimientos/${movimientoId}/imprimir`, {}, {
      params: { cols: String(cols), copies: String(copies) },
    });
  }

  imprimirReporte(q: {
    cliente_id: number;
    empaque_id?: number | null;
    fecha_inicio: string;
    fecha_fin: string;
    cols?: number;
    copies?: number;
  }): Observable<ImprimirResponse> {
    let params = new HttpParams()
      .set('cliente_id', String(q.cliente_id))
      .set('fecha_inicio', q.fecha_inicio)
      .set('fecha_fin', q.fecha_fin)
      .set('cols', String(q.cols ?? 48))
      .set('copies', String(q.copies ?? 1));
    if (q.empaque_id != null) params = params.set('empaque_id', String(q.empaque_id));

    return this.http.post<ImprimirResponse>(`${this.base}/api/empaque-movimientos/reporte/imprimir`, {}, { params });
  }
}
