/**
 * Obtiene la fecha actual en formato YYYY-MM-DD para inputs de tipo date
 */
export function getTodayString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formatea una fecha al formato dd-mmm-yyyy (ej: 28-feb-2026)
 */
export function formatDate(value: string | Date | null | undefined): string {
  const months = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
  ];

  if (!value) return '-';

  try {
    const date = typeof value === 'string' ? new Date(value) : value;
    
    if (isNaN(date.getTime())) return '-';

    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
  } catch {
    return '-';
  }
}

/**
 * Formatea una fecha con hora al formato dd-mmm-yyyy HH:mm (ej: 21-jun-2026 06:00)
 * Si `value` es un string ISO (con o sin zona horaria), se leen los componentes
 * literalmente para evitar que la conversión a la zona horaria del navegador
 * desplace el día/hora mostrados.
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  const months = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
  ];

  if (!value) return '-';

  try {
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hours, minutes] = match;
        return `${day}-${months[Number(month) - 1]}-${year} ${hours}:${minutes}`;
      }
    }

    const date = typeof value === 'string' ? new Date(value) : value;

    if (isNaN(date.getTime())) return '-';

    const day     = String(date.getDate()).padStart(2, '0');
    const month   = months[date.getMonth()];
    const year    = date.getFullYear();
    const hours   = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}`;
  } catch {
    return '-';
  }
}
