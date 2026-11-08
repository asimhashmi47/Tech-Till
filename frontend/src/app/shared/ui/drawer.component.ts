import { Component, computed, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/**
 * Right hand sheet used for every create and edit form. A drawer keeps the list visible
 * behind it, which matters when staff are checking a row while they type.
 */
@Component({
  selector: 'tt-drawer',
  standalone: true,
  imports: [LucideAngularModule],
  host: { '(document:keydown.escape)': 'open() && closed.emit()' },
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 bg-ink/25 backdrop-blur-[1px] enter-fade"
        style="z-index: var(--z-drawer-backdrop)"
        (click)="closed.emit()"
        aria-hidden="true"
      ></div>
      <aside
        class="fixed right-0 top-0 h-dvh bg-surface shadow-pop flex flex-col enter-drawer border-l border-line"
        [style.width]="width()"
        style="z-index: var(--z-drawer)"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="heading()"
      >
        <header class="flex items-start gap-3 px-5 py-4 border-b border-line">
          <div class="min-w-0">
            <h2 class="text-base font-bold text-ink">{{ heading() }}</h2>
            @if (subheading()) {
              <p class="text-xs text-muted mt-0.5">{{ subheading() }}</p>
            }
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-icon ml-auto"
            (click)="closed.emit()"
            aria-label="Close panel"
          >
            <lucide-icon name="x" [size]="16" />
          </button>
        </header>
        <div class="flex-1 overflow-y-auto px-5 py-4"><ng-content /></div>
        <footer
          class="px-5 py-3 border-t border-line flex items-center justify-end gap-2 bg-subtle/50"
        >
          <ng-content select="[drawerFooter]" />
        </footer>
      </aside>
    }
  `,
})
export class DrawerComponent {
  readonly open = input<boolean>(false);
  readonly heading = input<string>('');
  readonly subheading = input<string>('');
  readonly wide = input<boolean>(false);
  readonly closed = output<void>();

  readonly width = computed(() => `min(100vw, ${this.wide() ? '720px' : '520px'})`);
}
