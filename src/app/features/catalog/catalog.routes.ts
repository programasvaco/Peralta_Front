import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    children: [
      {
        path: 'categorias',
        data: { title: 'Categorías' },
        loadChildren: () =>
          import('./categorias/categorias.routes').then((m) => m.routes),
      },
      {
        path: 'articulos',
        data: { title: 'Artículos' },
        loadChildren: () =>
          import('./articulos/articulos.routes').then((m) => m.routes),
      },
      {
        path: 'proveedores',
        data: { title: 'Proveedores' },
        loadChildren: () =>
          import('./proveedores/proveedores.routes').then((m) => m.routes),
      },
      {
        path: 'clientes',
        data: { title: 'Clientes' },
        loadChildren: () =>
          import('./clientes/clientes.routes').then((m) => m.routes),
      },
      {
        path: 'formas-pago',
        data: { title: 'Formas de pago' },
        loadChildren: () =>
          import('./formas-pago/formas-pago.routes').then((m) => m.routes),
      },
      {
        path: 'empleados',
        data: { title: 'Empleados' },
        loadChildren: () =>
          import('./empleados/empleados.routes').then((m) => m.routes),
      },
      {
        path: 'empaques',
        data: { title: 'Empaques' },
        loadChildren: () =>
          import('./empaques/empaques.routes').then((m) => m.routes),
      },
      {
        path: '',
        redirectTo: 'categorias',
        pathMatch: 'full',
      },
    ],
  },
];
