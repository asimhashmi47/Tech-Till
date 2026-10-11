import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'tt-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
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
        this.alerts.success(`Welcome back, ${result.user.fullName.split(' ')[0]}`);

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
