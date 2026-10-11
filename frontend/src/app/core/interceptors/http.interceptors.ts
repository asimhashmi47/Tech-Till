import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { ProblemDetails } from '../models/api.models';
import { AlertService } from '../services/alert.service';
import { AuthService } from '../services/auth.service';
import { ProgressService } from '../services/progress.service';

/** Attaches the access token to API calls. Login and refresh go out unauthenticated. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;

  if (!token || isAuthEndpoint(request.url)) {
    return next(request);
  }

  return next(withToken(request, token));
};

/** Drives the slim progress bar at the top of the shell. */
export const progressInterceptor: HttpInterceptorFn = (request, next) => {
  const progress = inject(ProgressService);
  progress.start();

  return next(request).pipe(finalize(() => progress.done()));
};

/**
 * Maps every failure to the right place: a validation summary toast for 400, a silent
 * token refresh for 401, and a navigation to the matching error page for the rest.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const alerts = inject(AlertService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      // 0 means the request never reached the server.
      if (error.status === 0) {
        void router.navigate(['/error/offline']);
        return throwError(() => error);
      }

      if (error.status === 401) {
        return handleUnauthorized(request, next, auth, router, error);
      }

      const problem = asProblem(error);

      switch (error.status) {
        case 400:
          alerts.error(problem.title ?? 'Check the form', firstError(problem) ?? problem.detail);
          break;

        case 403:
          // A forbidden read is a navigation problem, a forbidden write is a toast.
          if (request.method === 'GET' || request.url.includes('/query')) {
            void router.navigate(['/error/403']);
          } else {
            alerts.error('Not allowed', problem.detail ?? 'Your account cannot do that.');
          }
          break;

        case 404:
          alerts.error('Not found', problem.detail ?? 'That record no longer exists.');
          break;

        case 409:
          alerts.warning('Cannot continue', problem.detail ?? 'That conflicts with existing data.');
          break;

        case 429:
          alerts.warning('Too many attempts', 'Wait a minute and try again.');
          break;

        default:
          if (error.status >= 500) {
            void router.navigate(['/error/500'], {
              queryParams: { ref: problem.correlationId ?? null },
            });
          } else {
            alerts.error('Request failed', problem.detail ?? error.message);
          }
          break;
      }

      return throwError(() => error);
    }),
  );
};

/**
 * One refresh attempt, then the session is dropped. Concurrent 401s each retry once,
 * which is acceptable here because the backend rotates refresh tokens on use and the
 * app is a single operator per browser.
 */
function handleUnauthorized(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
  router: Router,
  original: HttpErrorResponse,
): Observable<HttpEvent<unknown>> {
  if (isAuthEndpoint(request.url) || !auth.refreshToken) {
    auth.clear();
    void router.navigate(['/login']);
    return throwError(() => original);
  }

  return auth.refresh().pipe(
    switchMap((result) => next(withToken(request, result.accessToken))),
    catchError(() => {
      auth.clear();
      void router.navigate(['/login']);
      return throwError(() => original);
    }),
  );
}

function withToken(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function isAuthEndpoint(url: string): boolean {
  return url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/logout');
}

function asProblem(error: HttpErrorResponse): ProblemDetails {
  const body = error.error;
  return body && typeof body === 'object' && !(body instanceof Blob) ? (body as ProblemDetails) : {};
}

/** Pulls the first field message out of a ValidationProblemDetails payload. */
function firstError(problem: ProblemDetails): string | undefined {
  const errors = problem.errors;
  if (!errors) {
    return undefined;
  }

  for (const messages of Object.values(errors)) {
    if (messages.length > 0) {
      return messages[0];
    }
  }

  return undefined;
}
