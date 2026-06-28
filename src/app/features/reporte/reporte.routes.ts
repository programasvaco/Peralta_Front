import { Routes } from '@angular/router';
import { permissionMatch } from '../../core/auth/permission.match';

export const routes: Routes = [
  {
    path: '',
    children: [
      {
        path: 'caja',
        canMatch: [permissionMatch('caja.ver')],
        data: { title: 'Caja' },
        loadComponent: () =>
          import('./pages/caja/caja.component').then((m) => m.CajaComponent),
      },
      {
        path: 'cortes',
        canMatch: [permissionMatch('caja.corte')],
        data: { title: 'Cortes de Caja' },
        loadComponent: () =>
          import('./pages/cortes/cortes-list.component').then((m) => m.CortesListComponent),
      },
      {
        path: 'cortes/:id',
        canMatch: [permissionMatch('caja.corte')],
        data: { title: 'Detalle de Corte' },
        loadComponent: () =>
          import('./pages/cortes/corte-show.component').then((m) => m.CorteShowComponent),
      },
      {
        path: 'ventas',
        canMatch: [permissionMatch('ventas.ver')],
        data: { title: 'Reporte de Ventas' },
        loadComponent: () =>
          import('./pages/ventas/ventas.component').then((m) => m.VentasReporteComponent),
      },
      {
        path: 'diario',
        canMatch: [permissionMatch('ventas.ver')],
        data: { title: 'Reporte Diario' },
        loadComponent: () =>
          import('./pages/diario/diario.component').then((m) => m.ReporteDiarioComponent),
      },
      {
        path: 'estado-resultados',
        canMatch: [permissionMatch('ventas.ver')],
        data: { title: 'Estado de Resultados' },
        loadComponent: () =>
          import('./pages/estado-resultados/estado-resultados.component').then((m) => m.EstadoResultadosComponent),
      },
      {
        path: '',
        redirectTo: 'caja',
        pathMatch: 'full',
      },
    ],
  },
];
