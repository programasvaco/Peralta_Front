import { ColDef } from 'ag-grid-community';

/**
 * defaultColDef compartido por todos los listados con ag-Grid.
 * minWidth evita que las columnas se compriman por debajo de un ancho
 * legible al achicar la ventana: ag-Grid muestra scroll horizontal en
 * vez de cortar/traslapar contenido.
 */
export const AG_GRID_DEFAULT_COL_DEF: ColDef = {
  sortable: true,
  resizable: true,
  filter: false,
  minWidth: 110,
};
