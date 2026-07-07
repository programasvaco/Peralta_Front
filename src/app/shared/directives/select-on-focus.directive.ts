import { Directive, HostListener } from '@angular/core';

/**
 * Selecciona todo el contenido del input al recibir el foco.
 * Pensado para pantallas táctiles: evita que el cursor quede al inicio
 * del valor (ej. un "0") y que escribir un dígito lo inserte en vez de
 * sobreescribir el valor completo.
 */
@Directive({
  selector: '[appSelectOnFocus]',
  standalone: true,
})
export class SelectOnFocusDirective {
  @HostListener('focus', ['$event'])
  onFocus(event: FocusEvent) {
    (event.target as HTMLInputElement).select();
  }
}
