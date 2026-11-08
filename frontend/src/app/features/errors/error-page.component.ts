import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { LucideAngularModule } from 'lucide-angular';

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
    icon: 'circle-alert',
    tone: 'amber',
  },
  '401': {
    code: '401',
    title: 'Your session has ended',
    message: 'Sign in again to carry on. Nothing you saved has been lost.',
    icon: 'lock',
    tone: 'indigo',
  },
  '403': {
    code: '403',
    title: 'You cannot open that page',
    message: 'Your account does not have access to this area.',
    hint: 'Ask the owner to grant the module in Users and permissions.',
    icon: 'lock-keyhole',
    tone: 'rose',
  },
  '404': {
    code: '404',
    title: 'That page does not exist',
    message: 'The link may be out of date, or the record may have been removed.',
    icon: 'info',
    tone: 'slate',
  },
  '500': {
    code: '500',
    title: 'Something broke on our side',
    message: 'The server could not finish that request. Trying again often works.',
    hint: 'Quote the reference below if you report it.',
    icon: 'triangle-alert',
    tone: 'rose',
  },
  offline: {
    code: 'Offline',
    title: 'No connection to the server',
    message: 'The app could not reach TechTill. Check the network, then try again.',
    hint: 'If the backend is running locally, make sure it is still started.',
    icon: 'wifi-off',
    tone: 'amber',
  },
};

/** One page for 400, 401, 403, 404, 500 and the offline case, chosen by the route. */
@Component({
  selector: 'tt-error-page',
  standalone: true,
  imports: [LucideAngularModule, CommonModule, RouterLink],
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
