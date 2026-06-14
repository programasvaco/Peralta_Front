import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../../../enviroments/environment';
import { Empaque, EmpaqueClienteSaldo, EmpaqueMovimiento, MovimientoPayload } from './empaques.models';

function utf8ToCp850(input: ArrayBuffer): ArrayBuffer {
  const map2: Record<number, Record<number, number>> = {
    0xC2: { 0xA1: 0xAD, 0xBF: 0xA8, 0xAA: 0xA6, 0xBA: 0xA7, 0xAB: 0xAE, 0xBB: 0xAF, 0xB0: 0xF8 },
    0xC3: {
      0x80: 0x85, 0x81: 0xB5, 0x82: 0x83, 0x84: 0x8E, 0x87: 0x80, 0x89: 0x90,
      0x91: 0xA5, 0x93: 0xE0, 0x94: 0x99, 0x99: 0x9A, 0x9A: 0xE9,
      0xA0: 0xA0, 0xA1: 0x85, 0xA7: 0x87, 0xA9: 0x82, 0xAD: 0xA1,
      0xB1: 0xA4, 0xB2: 0xA2, 0xB3: 0xA2, 0xB6: 0x94, 0xBA: 0xA3, 0xBC: 0x81,
    },
  };
  const src = new Uint8Array(input);
  const dst = new Uint8Array(src.length);
  let si = 0, di = 0;
  while (si < src.length) {
    const b0 = src[si], b1 = src[si + 1];
    const cp850 = map2[b0]?.[b1];
    if (cp850 !== undefined) { dst[di++] = cp850; si += 2; }
    else { dst[di++] = b0; si++; }
  }
  return dst.buffer.slice(0, di);
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

  getTicket(movimientoId: number, cols: number = 48): Observable<ArrayBuffer> {
    return this.http.get(`${this.base}/api/empaque-movimientos/${movimientoId}/ticket`, {
      params: { cols: String(cols) },
      responseType: 'arraybuffer',
    }).pipe(map(utf8ToCp850));
  }
}
