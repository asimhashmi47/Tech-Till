import { Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

import { initials } from '../../core/services/format';

/**
 * Page title row. Titles and subtitles that hold markup are projected through the
 * [pageTitle], [pageSub] and [pageCrumbs] slots; everything else lands on the right.
 */
@Component({
  selector: 'app-page-header',
  imports: [LucideAngularModule],
  template: `
    <div class="flex flex-wrap items-end gap-3 mb-4 enter-rise">
      <div class="min-w-0">
        <ng-content select="[pageCrumbs]" />
        <h1 class="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
          @if (icon()) {
            <span class="grid place-items-center size-8 rounded-lg bg-lilac-50 text-brand-ink"
              ><lucide-icon [name]="icon()!" [size]="17"
            /></span>
          }
          {{ title() }}
          <ng-content select="[pageTitle]" />
        </h1>
        @if (subtitle()) {
          <p class="text-[13px] text-muted mt-1">{{ subtitle() }}</p>
        }
        <p class="text-[13px] text-muted mt-1 empty:hidden"><ng-content select="[pageSub]" /></p>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2"><ng-content /></div>
    </div>
  `,
})
export class PageHeader {
  readonly title = input<string>('');
  readonly subtitle = input<string>();
  readonly icon = input<string>();
}

@Component({
  selector: 'app-avatar',
  template: `<span
    class="inline-grid place-items-center rounded-full font-bold shrink-0 bg-lilac-100 text-brand-strong"
    [style.width.px]="size()"
    [style.height.px]="size()"
    [style.font-size.px]="size() * 0.38"
    >{{ letters() }}</span
  >`,
})
export class Avatar {
  readonly name = input<string | null>('');
  readonly size = input(26);
  readonly letters = computed(() => initials(this.name()));
}

@Component({
  selector: 'app-stat',
  imports: [LucideAngularModule],
  template: `
    <div class="kpi" [style.background]="'var(--grad-' + tone() + ')'">
      <div class="relative z-10 flex items-start justify-between gap-2">
        <p class="text-xs font-semibold opacity-90">{{ label() }}</p>
        <span class="grid place-items-center size-8 rounded-full bg-white/18 ring-1 ring-white/25"
          ><lucide-icon [name]="icon()" [size]="15"
        /></span>
      </div>
      <p class="relative z-10 mt-2 text-[26px] leading-none font-bold tracking-tight tabular">
        {{ value() }}
      </p>
      <div class="relative z-10 mt-auto pt-3 flex items-center gap-1.5 text-2xs font-medium">
        <span class="opacity-90 truncate">{{ caption() }}</span>
      </div>
    </div>
  `,
})
export class Stat {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input.required<string>();
  readonly tone = input<'brand' | 'mint' | 'amber' | 'danger' | 'teal' | 'orchid'>('brand');
  readonly caption = input('');
}
