import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    data: { title: 'Control de Empaques' },
    loadComponent: () =>
      import('./pages/empaques-saldos/empaques-saldos.component').then(
        m => m.EmpaquesSaldosComponent
      ),
  },
];
