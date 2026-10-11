import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ModuleName } from '../models/api.models';
import { AuthService } from '../services/auth.service';

/** Blocks the app shell until there is a session. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isSignedIn()) {
    return true;
  }

  // Remember where the user was heading so sign in can return them there.
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps a signed in user away from the sign in page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isSignedIn() ? router.createUrlTree(['/dashboard']) : true;
};

/**
 * Route level module check. The backend repeats this on every call, so a user who edits
 * the URL gets a 403 from the API even if they reach the route.
 */
export function moduleGuard(module: ModuleName, write = false): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const allowed = write ? auth.canWrite(module) : auth.canRead(module);
    return allowed ? true : router.createUrlTree(['/error/403']);
  };
}

/** Owner only areas: users and the audit log. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAdmin() ? true : router.createUrlTree(['/error/403']);
};
