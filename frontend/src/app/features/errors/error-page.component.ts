import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

interface ErrorCopy {
  code: string;
  title: string;
  message: string;
  hint?: string;
  icon: string;
  tone: 'rose' | 'amber' | 'indigo' | 'slate';
}

const COPY: Record<string, ErrorCopy> = {
  '400': {
    code: '400',
    title: 'That request was not valid',
    message: 'Something in the form did not pass the checks. Go back and correct the highlighted fields.',
    icon: 'M12 8v5m0 3.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
    tone: 'amber',
  },
  '401': {
    code: '401',
    title: 'Your session has ended',
    message: 'Sign in again to carry on. Nothing you saved has been lost.',
    icon: 'M17 11V8a5 5 0 0 0-10 0v3M5 11h14v10H5V11Z',
    tone: 'indigo',
  },
  '403': {
    code: '403',
    title: 'You cannot open that page',
    message: 'Your account does not have access to this area.',
    hint: 'Ask the owner to grant the module in Users and permissions.',
    icon: 'M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm3-10V7a3 3 0 0 1 6 0v4',
    tone: 'rose',
  },
  '404': {
    code: '404',
    title: 'That page does not exist',
    message: 'The link may be out of date, or the record may have been removed.',
    icon: 'M11 11h1v5m-1 0h2M12 7.5h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
    tone: 'slate',
  },
  '500': {
    code: '500',
    title: 'Something broke on our side',
    message: 'The server could not finish that request. Trying again often works.',
    hint: 'Quote the reference below if you report it.',
    icon: 'M12 9v4m0 3.5v.5M10.3 4.9 2.5 19a1.6 1.6 0 0 0 1.4 2.4h16.2a1.6 1.6 0 0 0 1.4-2.4L13.7 4.9a1.6 1.6 0 0 0-2.8 0Z',
    tone: 'rose',
  },
  offline: {
    code: 'Offline',
    title: 'No connection to the server',
    message: 'The app could not reach TechTill. Check the network, then try again.',
    hint: 'If the backend is running locally, make sure it is still started.',
    icon: 'M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5.6 12.9a9 9 0 0 1 3.2-2.1m6.4-.1a9 9 0 0 1 2.9 2M2.5 9.5A13 13 0 0 1 7 6.8m10.2-.2a13 13 0 0 1 4.3 2.9M12 20h.01',
    tone: 'amber',
  },
};

/** One page for 400, 401, 403, 404, 500 and the offline case, chosen by the route. */
@Component({
  selector: 'tt-error-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './error-page.component.html',
  styleUrl: './error-page.component.scss',
})
export class ErrorPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  private readonly params = toSignal(this.route.paramMap, { initialValue: null });
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: null });

  readonly copy = computed<ErrorCopy>(() => {
    const code = this.params()?.get('code') ?? '404';
    return COPY[code] ?? COPY['404'];
  });

  readonly reference = computed(() => this.query()?.get('ref') ?? null);
  readonly isSignedIn = this.auth.isSignedIn;

  retry(): void {
    // A full reload is the honest answer for an offline or server error page.
    window.location.reload();
  }

  goBack(): void {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      void this.router.navigate(['/dashboard']);
    }
  }

  signIn(): void {
    this.auth.clear();
    void this.router.navigate(['/login']);
  }
}
