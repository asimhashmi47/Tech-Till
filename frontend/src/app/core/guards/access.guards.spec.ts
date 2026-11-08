import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { ModuleName } from '../models/api.models';
import { AuthService } from '../services/auth.service';
import { adminGuard, authGuard, guestGuard, moduleGuard } from './access.guards';

describe('route guards', () => {
  const signedIn = signal(true);
  const admin = signal(false);
  const auth = {
    isSignedIn: signedIn,
    isAdmin: admin,
    canRead: (m: ModuleName) => m === 'Stock' || m === 'Pos',
    canWrite: (m: ModuleName) => m === 'Pos',
  };

  const run = (guard: (r: ActivatedRouteSnapshot, s: RouterStateSnapshot) => unknown, url = '/stock') =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );

  const path = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

  beforeEach(() => {
    signedIn.set(true);
    admin.set(false);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
  });

  it('AC:UI-11 lets a signed in user through authGuard', () => expect(run(authGuard)).toBeTrue());

  it('AC:UI-11 sends a signed out user to login and remembers the target', () => {
    signedIn.set(false);
    expect(path(run(authGuard))).toBe('/login?returnUrl=%2Fstock');
  });

  it('AC:UI-11 keeps a signed in user away from login', () => {
    expect(path(run(guestGuard))).toBe('/dashboard');
    signedIn.set(false);
    expect(run(guestGuard)).toBeTrue();
  });

  it('AC:UI-11 allows a readable module', () => expect(run(moduleGuard('Stock'))).toBeTrue());

  it('AC:UI-11 sends an unreadable module to 403', () => {
    expect(path(run(moduleGuard('Reports')))).toBe('/error/403');
  });

  it('AC:UI-11 needs write when the route asks for it', () => {
    expect(run(moduleGuard('Pos', true))).toBeTrue();
    expect(path(run(moduleGuard('Stock', true)))).toBe('/error/403');
  });

  it('AC:UI-11 keeps admin areas for the owner', () => {
    expect(path(run(adminGuard))).toBe('/error/403');
    admin.set(true);
    expect(run(adminGuard)).toBeTrue();
  });
});
