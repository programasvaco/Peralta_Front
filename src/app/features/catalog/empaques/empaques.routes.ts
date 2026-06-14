import { Routes } from '@angular/router';
import { permissionMatch } from '../../../core/auth/permission.match';

export const routes: Routes = [
  {
    path: '',
    canMatch: [permissionMatch('catalogos.ver')],
    data: { title: 'Empaques' },
    loadComponent: () =>
      import('./pages/empaques-list/empaques-list.component').then(m => m.EmpaquesListComponent),
  },
  {
    path: 'nuevo',
    canMatch: [permissionMatch('catalogos.crear')],
    data: { title: 'Nuevo empaque' },
    loadComponent: () =>
      import('./pages/empaque-form/empaque-form.component').then(m => m.EmpaqueFormComponent),
  },
  {
    path: ':id/editar',
    canMatch: [permissionMatch('catalogos.editar')],
    data: { title: 'Editar empaque' },
    loadComponent: () =>
      import('./pages/empaque-form/empaque-form.component').then(m => m.EmpaqueFormComponent),
  },
];
