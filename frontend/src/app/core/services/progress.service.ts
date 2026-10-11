import { Injectable, computed, signal } from '@angular/core';

/**
 * Counts in flight HTTP calls for the top progress bar. A counter rather than a boolean,
 * so overlapping requests do not switch the bar off early.
 */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly pending = signal(0);

  readonly isActive = computed(() => this.pending() > 0);

  start(): void {
    this.pending.update((count) => count + 1);
  }

  done(): void {
    this.pending.update((count) => Math.max(0, count - 1));
  }
}
