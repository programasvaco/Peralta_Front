import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../enviroments/environment';
import { LoteDisponible, VentaStorePayload, VentaStoreResponse } from './ventas.models';

export interface ImprimirResponse {
  ok: boolean;
  job_id: string;
}

@Injectable({ providedIn: 'root' })
export class VentasService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  lotesDisponibles(q: { almacen_id: number; articulo_id?: number | null; variedad?: string | null }): Observable<LoteDisponible[]> {
    let params = new HttpParams().set('almacen_id', String(q.almacen_id));
    if (q.articulo_id) params = params.set('articulo_id', String(q.articulo_id));
    if (q.variedad) params = params.set('variedad', q.variedad);

    return this.http.get<LoteDisponible[]>(`${this.base}/api/ventas/lotes-disponibles`, { params });
  }

  store(payload: VentaStorePayload): Observable<VentaStoreResponse> {
    return this.http.post<VentaStoreResponse>(`${this.base}/api/ventas`, payload);
  }

  /**
   * Pide al backend generar el ticket de la venta y despacharlo por
   * WebSocket (Reverb) al print-agent de la sucursal de la venta.
   */
  imprimir(ventaId: number, opts: { cols?: number; copies?: number } = {}): Observable<ImprimirResponse> {
    const { cols = 48, copies = 1 } = opts;
    return this.http.post<ImprimirResponse>(`${this.base}/api/ventas/${ventaId}/imprimir`, {}, {
      params: { cols: String(cols), copies: String(copies) },
    });
  }
}