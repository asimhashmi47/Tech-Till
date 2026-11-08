import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AlertService } from '../services/alert.service';
import { AuthService } from '../services/auth.service';
import { ProgressService } from '../services/progress.service';
import { SILENT, authInterceptor, errorInterceptor, progressInterceptor } from './http.interceptors';

describe('http interceptors', () => {
  let http: HttpClient;
  let mock: HttpTestingController;
  const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
  const alerts = jasmine.createSpyObj<AlertService>('AlertService', ['error', 'warning']);
  const progress = jasmine.createSpyObj<ProgressService>('ProgressService', ['start', 'done']);
  const auth = { accessToken: 'tok' as string | null, refreshToken: null as string | null, clear: jasmine.createSpy('clear') };

  beforeEach(() => {
    router.navigate.calls.reset();
    alerts.error.calls.reset();
    alerts.warning.calls.reset();
    progress.start.calls.reset();
    auth.clear.calls.reset();
    auth.accessToken = 'tok';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([progressInterceptor, authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: AlertService, useValue: alerts },
        { provide: ProgressService, useValue: progress },
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  const fail = (status: number, silent = false, method: 'GET' | 'POST' = 'GET', url = '/api/x') => {
    const context = new HttpContext().set(SILENT, silent);
    http.request(method, url, { context }).subscribe({ error: () => undefined });
    mock.expectOne(url).flush({ detail: 'nope' }, { status, statusText: 'x' });
  };

  it('AC:UI-12 a silent poll that fails neither toasts nor redirects', () => {
    [0, 403, 404, 500].forEach((status) => {
      if (status === 0) {
        http.get('/api/p', { context: new HttpContext().set(SILENT, true) }).subscribe({ error: () => undefined });
        mock.expectOne('/api/p').error(new ProgressEvent('error'));
      } else {
        fail(status, true);
      }
    });
    expect(router.navigate).not.toHaveBeenCalled();
    expect(alerts.error).not.toHaveBeenCalled();
  });

  it('AC:UI-12 a silent poll skips the progress bar', () => {
    http.get('/api/p', { context: new HttpContext().set(SILENT, true) }).subscribe();
    mock.expectOne('/api/p').flush({});
    expect(progress.start).not.toHaveBeenCalled();
  });

  it('AC:UI-12 a normal request drives the progress bar', () => {
    http.get('/api/p').subscribe();
    mock.expectOne('/api/p').flush({});
    expect(progress.start).toHaveBeenCalledTimes(1);
    expect(progress.done).toHaveBeenCalled();
  });

  it('AC:UI-12 a server error redirects', () => {
    fail(500);
    expect(router.navigate).toHaveBeenCalledWith(['/error/500'], jasmine.anything());
  });

  it('AC:UI-12 a forbidden read redirects and a forbidden write toasts', () => {
    fail(403);
    expect(router.navigate).toHaveBeenCalledWith(['/error/403']);
    fail(403, false, 'POST', '/api/products');
    expect(alerts.error).toHaveBeenCalledTimes(1);
  });

  it('AC:UI-12 attaches the token except on auth endpoints', () => {
    http.get('/api/x').subscribe();
    expect(mock.expectOne('/api/x').request.headers.get('Authorization')).toBe('Bearer tok');
    http.post('/api/auth/login', {}).subscribe();
    expect(mock.expectOne('/api/auth/login').request.headers.has('Authorization')).toBeFalse();
    mock.match(() => true).forEach((r) => r.flush({}));
  });

  it('AC:UI-12 a 401 with nothing to refresh ends the session', () => {
    fail(401);
    expect(auth.clear).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
