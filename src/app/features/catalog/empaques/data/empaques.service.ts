import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../../enviroments/environment';
import { Empaque, EmpaqueShowResponse } from './empaques.models';

@Injectable({ providedIn: 'root' })
export class EmpaquesService {
  private base = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  list(activo?: boolean | null): Observable<Empaque[]> {
    let params = new HttpParams();
    if (activo !== undefined && activo !== null) {
      params = params.set('activo', String(activo));
    }
    return this.http.get<Empaque[]>(`${this.base}/api/empaques`, { params });
  }

  get(id: number): Observable<EmpaqueShowResponse> {
    return this.http.get<EmpaqueShowResponse>(`${this.base}/api/empaques/${id}`);
  }

  create(payload: Partial<Empaque>): Observable<any> {
    return this.http.post(`${this.base}/api/empaques`, payload);
  }

  update(id: number, payload: Partial<Empaque>): Observable<any> {
    return this.http.put(`${this.base}/api/empaques/${id}`, payload);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.base}/api/empaques/${id}`);
  }
}
