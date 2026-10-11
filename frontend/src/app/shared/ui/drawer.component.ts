import { CommonModule } from '@angular/common';
import { Component, HostListener, input, output } from '@angular/core';

/**
 * Right hand sheet used for every create and edit form. A drawer keeps the list visible
 * behind it, which matters when staff are checking a row while they type.
 */
@Component({
  selector: 'tt-drawer',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (open()) {
      <div class="scrim" (click)="requestClose()" aria-hidden="true"></div>

      <aside
        class="drawer"
        [class.drawer--wide]="wide()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="heading()"
      >
        <header class="drawer__head">
          <div>
            <h2 class="drawer__title">{{ heading() }}</h2>
            @if (subheading()) {
              <p class="drawer__sub">{{ subheading() }}</p>
            }
          </div>

          <button type="button" class="drawer__close" (click)="requestClose()" aria-label="Close">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div class="drawer__body">
          <ng-content />
        </div>

        <footer class="drawer__foot">
          <ng-content select="[drawerFooter]" />
        </footer>
      </aside>
    }
  `,
  styleUrl: './drawer.component.scss',
})
export class DrawerComponent {
  readonly open = input<boolean>(false);
  readonly heading = input<string>('');
  readonly subheading = input<string>('');
  readonly wide = input<boolean>(false);

  readonly closed = output<void>();

  requestClose(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }
}
