import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatMoney } from '../../core/services/currency';

export type AccentName =
  | 'indigo'
  | 'violet'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'orange'
  | 'cyan'
  | 'pink';

/**
 * One dashboard metric on its own coloured card. The whole card is the link when a route
 * is given, so the figure and the way through to the detail are the same target rather
 * than a small arrow in the corner.
 */
@Component({
  selector: 'tt-kpi-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (link()) {
      <a class="kpi" [class]="'kpi kpi--' + accent()" [routerLink]="link()">
        <ng-container *ngTemplateOutlet="body" />
        <span class="kpi__go" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h13m-5-6 6 6-6 6" />
          </svg>
        </span>
      </a>
    } @else {
      <div class="kpi" [class]="'kpi kpi--' + accent()">
        <ng-container *ngTemplateOutlet="body" />
      </div>
    }

    <ng-template #body>
      <span class="kpi__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round">
          <path [attr.d]="icon()" />
        </svg>
      </span>

      <span class="kpi__label">{{ label() }}</span>

      @if (loading()) {
        <span class="kpi__skeleton"></span>
      } @else {
        <span class="kpi__value">{{ display() }}</span>
      }

      @if (note()) {
        <span class="kpi__note">{{ note() }}</span>
      }
    </ng-template>
  `,
  styleUrl: './kpi-card.component.scss',
})
export class KpiCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly icon = input.required<string>();
  readonly accent = input<AccentName>('indigo');

  /** Money values carry the currency symbol, counts stay bare. */
  readonly money = input<boolean>(true);
  readonly note = input<string>('');
  readonly link = input<string | null>(null);
  readonly loading = input<boolean>(false);

  readonly display = computed(() => {
    const amount = this.value() ?? 0;

    // A count of items is a whole number, so it never takes currency decimals.
    return this.money()
      ? formatMoney(amount)
      : Math.round(amount).toLocaleString('en-US');
  });
}
