import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartOptions, ChartType } from 'chart.js';

/**
 * A titled panel around one Chart.js canvas. The panel owns the frame, the chart owns
 * the data, which keeps the six dashboard charts visually consistent.
 */
@Component({
  selector: 'tt-chart-card',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    <section class="chart-card">
      <header class="chart-card__head">
        <div>
          <h3 class="chart-card__title">{{ title() }}</h3>
          @if (subtitle()) {
            <p class="chart-card__sub">{{ subtitle() }}</p>
          }
        </div>
        @if (meta()) {
          <span class="chart-card__meta">{{ meta() }}</span>
        }
      </header>

      <div class="chart-card__body" [style.height]="height()">
        @if (loading()) {
          <div class="tt-skeleton chart-card__skeleton"></div>
        } @else if (empty()) {
          <div class="chart-card__empty">
            <p class="tt-muted">No data for this period yet.</p>
          </div>
        } @else {
          <canvas
            baseChart
            [type]="type()"
            [data]="data()"
            [options]="options()"
            [attr.aria-label]="title()"
            role="img"
          ></canvas>
        }
      </div>
    </section>
  `,
  styleUrl: './chart-card.component.scss',
})
export class ChartCardComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly meta = input<string>('');

  readonly type = input.required<ChartType>();
  readonly data = input.required<ChartData>();
  readonly options = input<ChartOptions>({});

  readonly height = input<string>('260px');
  readonly loading = input<boolean>(false);
  readonly empty = input<boolean>(false);
}

export type { ChartConfiguration };
