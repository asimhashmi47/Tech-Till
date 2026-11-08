import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { PageHeader } from '../../shared/ui/ui';

@Component({
  selector: 'tt-change-password',
  standalone: true,
  imports: [PageHeader, CommonModule, FormsModule],
  template: `
    <div class="page-stack">
      <app-page-header title="Change password" icon="key-round">
        <span pageSub>Signed in as {{ profile()?.username }}. Changing this signs you out of every other browser and device.</span>
      </app-page-header>

      <div class="card overflow-hidden narrow">
        <div class="p-4">
          <form class="grid gap-3.5" (ngSubmit)="submit()">
            <div class="block min-w-0">
              <label class="label" for="current">Current password</label>
              <input
                id="current"
                class="input"
                type="password"
                name="current"
                autocomplete="current-password"
                required
                [class.invalid]="errors()['current']"
                [ngModel]="current()"
                (ngModelChange)="current.set($event)"
              />
              @if (errors()['current']) {
                <p class="error-text">{{ errors()['current'] }}</p>
              }
            </div>

            <div class="block min-w-0">
              <label class="label" for="next">New password</label>
              <input
                id="next"
                class="input"
                type="password"
                name="next"
                autocomplete="new-password"
                required
                [class.invalid]="errors()['next']"
                [ngModel]="next()"
                (ngModelChange)="next.set($event)"
              />
              @if (errors()['next']) {
                <p class="error-text">{{ errors()['next'] }}</p>
              } @else {
                <p class="hint">At least 8 characters.</p>
              }
            </div>

            <div class="block min-w-0">
              <label class="label" for="confirm">Repeat new password</label>
              <input
                id="confirm"
                class="input"
                type="password"
                name="confirm"
                autocomplete="new-password"
                required
                [class.invalid]="errors()['confirm']"
                [ngModel]="confirm()"
                (ngModelChange)="confirm.set($event)"
              />
              @if (errors()['confirm']) {
                <p class="error-text">{{ errors()['confirm'] }}</p>
              }
            </div>

            <div class="flex items-center justify-end gap-2 pt-2">
              <button type="button" class="btn btn-neutral" (click)="cancel()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="busy() || !ready()">
                {{ busy() ? 'Changing' : 'Change password' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .narrow {
        max-width: 520px;
      }
    `,
  ],
})
export class ChangePasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(AlertService);
  private readonly router = inject(Router);

  readonly profile = this.auth.profile;
  readonly current = signal('');
  readonly next = signal('');
  readonly confirm = signal('');
  readonly busy = signal(false);
  readonly errors = signal<Record<string, string>>({});

  readonly ready = computed(
    () => this.current().length > 0 && this.next().length > 0 && this.confirm().length > 0,
  );

  submit(): void {
    const found: Record<string, string> = {};

    if (!this.current()) {
      found['current'] = 'Enter your current password.';
    }

    if (this.next().length < 8) {
      found['next'] = 'Use at least 8 characters.';
    }

    if (this.next() !== this.confirm()) {
      found['confirm'] = 'The two new passwords do not match.';
    }

    if (this.current() && this.next() === this.current()) {
      found['next'] = 'Choose a password you have not used here before.';
    }

    this.errors.set(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    this.busy.set(true);
    this.auth.changePassword(this.current(), this.next()).subscribe({
      next: () => {
        this.busy.set(false);
        this.alerts.success('Password changed', 'Sign in again with the new password.');

        // Every session was revoked server side, so this one has to go too.
        this.auth.logout();
      },
      error: () => {
        this.busy.set(false);
        this.errors.set({ current: 'That current password is not correct.' });
      },
    });
  }

  cancel(): void {
    void this.router.navigate(['/dashboard']);
  }
}
