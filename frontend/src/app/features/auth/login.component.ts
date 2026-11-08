import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';

declare const ngDevMode: unknown;

interface DemoAccount {
  username: string;
  password: string;
  role: string;
  description: string;
}

// The production build sets ngDevMode to false, which removes the seeded credentials from
// the bundle. They only ever match a local database created by the demo seed.
const DEMO_ACCOUNTS: DemoAccount[] =
  typeof ngDevMode !== 'undefined' && ngDevMode
    ? [
        { username: 'admin', password: 'TechTill#2026', role: 'Owner', description: 'Everything' },
        { username: 'sara', password: 'TechTill#2026', role: 'Staff', description: 'Till, shop 1' },
        { username: 'bilal', password: 'TechTill#2026', role: 'Staff', description: 'Till and cash, shop 2' },
        { username: 'hina', password: 'TechTill#2026', role: 'Staff', description: 'Stock and buying' },
        { username: 'omar', password: 'TechTill#2026', role: 'Staff', description: 'Expenses and cash' },
        { username: 'zoya', password: 'TechTill#2026', role: 'Staff', description: 'Read only, shop 1' },
      ]
    : [];

@Component({
  selector: 'tt-login',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(AlertService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly username = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly busy = signal(false);
  readonly failed = signal(false);
  readonly demoAccounts = DEMO_ACCOUNTS;

  readonly highlights = [
    {
      icon: 'warehouse',
      title: 'Stock per shop',
      text: 'Transfers and adjustments that leave a trail.',
    },
    {
      icon: 'shopping-cart',
      title: 'A till that takes every payment',
      text: 'Cash, card, bank and credit, with a printed invoice.',
    },
    {
      icon: 'scale',
      title: 'Books from the same records',
      text: 'Profit and loss, balance sheet and cash flow.',
    },
  ];

  useDemo(account: DemoAccount): void {
    this.username.set(account.username);
    this.password.set(account.password);
    this.submit();
  }

  submit(): void {
    const username = this.username().trim();
    const password = this.password();

    if (!username || !password) {
      this.failed.set(true);
      return;
    }

    this.busy.set(true);
    this.failed.set(false);

    this.auth.login(username, password).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.alerts.success('Welcome back', `Signed in as ${result.user.fullName}.`);

        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl && returnUrl !== '/login' ? returnUrl : '/dashboard');
      },
      error: () => {
        // The interceptor shows the toast. This only drives the inline message.
        this.busy.set(false);
        this.failed.set(true);
        this.password.set('');
      },
    });
  }

  toggleVisibility(): void {
    this.showPassword.update((v) => !v);
  }
}
