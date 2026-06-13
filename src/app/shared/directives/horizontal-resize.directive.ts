import { Directive, ElementRef, HostListener, Input, OnDestroy } from '@angular/core';

/**
 * Directiva para redimensionar dos paneles horizontalmente con el mouse.
 * Coloca el elemento host como separador entre los dos paneles.
 * El contenedor debe usar display:grid con 3 columnas: left handle right.
 *
 * Uso:
 *   <div [appHorizontalResize]="containerEl" ...></div>
 */
@Directive({
  selector: '[appHorizontalResize]',
  standalone: true,
  host: { class: 'resize-handle-directive' },
})
export class HorizontalResizeDirective implements OnDestroy {
  /** Elemento contenedor cuyo gridTemplateColumns se actualizará */
  @Input('appHorizontalResize') container!: HTMLElement;

  /** Porcentaje mínimo del panel izquierdo */
  @Input() resizeMin = 20;

  /** Porcentaje máximo del panel izquierdo */
  @Input() resizeMax = 80;

  private dragging = false;
  private startX = 0;
  private startLeftPct = 0;

  private readonly onMove       = (e: MouseEvent) => this.handleMove(e);
  private readonly onUp         = ()              => this.stopDrag();
  private readonly onTouchMove  = (e: TouchEvent) => this.handleTouchMove(e);
  private readonly onTouchEnd   = ()              => this.stopDrag();

  constructor(private el: ElementRef<HTMLElement>) {}

  @HostListener('mousedown', ['$event'])
  onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();

    this.startDrag(e.clientX);
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mouseup',   this.onUp);
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    e.preventDefault();

    this.startDrag(e.touches[0].clientX);
    document.addEventListener('touchmove',   this.onTouchMove, { passive: false });
    document.addEventListener('touchend',    this.onTouchEnd);
    document.addEventListener('touchcancel', this.onTouchEnd);
  }

  private startDrag(clientX: number) {
    this.dragging      = true;
    this.startX        = clientX;
    this.startLeftPct  = this.currentLeftPct();
  }

  private handleMove(e: MouseEvent) {
    if (!this.dragging) return;
    this.applyDelta(e.clientX);
  }

  private handleTouchMove(e: TouchEvent) {
    if (!this.dragging || e.touches.length !== 1) return;
    e.preventDefault();
    this.applyDelta(e.touches[0].clientX);
  }

  private applyDelta(clientX: number) {
    const containerW = this.container.offsetWidth;
    if (!containerW) return;

    const dx       = clientX - this.startX;
    const deltaPct = (dx / containerW) * 100;
    const newLeft  = Math.min(this.resizeMax, Math.max(this.resizeMin, this.startLeftPct + deltaPct));

    this.applyColumns(newLeft);
  }

  private stopDrag() {
    this.dragging = false;
    document.removeEventListener('mousemove',   this.onMove);
    document.removeEventListener('mouseup',     this.onUp);
    document.removeEventListener('touchmove',   this.onTouchMove);
    document.removeEventListener('touchend',    this.onTouchEnd);
    document.removeEventListener('touchcancel', this.onTouchEnd);
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  }

  /** Lee el % actual del panel izquierdo desde el inline style o calcula desde computedStyle */
  private currentLeftPct(): number {
    const inline = this.container.style.gridTemplateColumns;
    if (inline) {
      const match = inline.match(/^([\d.]+)%/);
      if (match) return parseFloat(match[1]);
    }
    // Fallback: mide el primer track del grid computado
    const cols = getComputedStyle(this.container).gridTemplateColumns;
    const leftPx = parseFloat(cols.split(' ')[0]);
    return (leftPx / this.container.offsetWidth) * 100;
  }

  private applyColumns(leftPct: number) {
    const handlePx  = this.el.nativeElement.offsetWidth || 8;
    const rightPct  = 100 - leftPct;
    // Usamos calc para descontar el handle del espacio total
    this.container.style.gridTemplateColumns =
      `calc(${leftPct}% - ${handlePx / 2}px) ${handlePx}px calc(${rightPct}% - ${handlePx / 2}px)`;
  }

  ngOnDestroy() {
    this.stopDrag();
  }
}
