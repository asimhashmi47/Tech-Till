import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  Access,
  AuthResult,
  ModuleName,
  ShopRef,
  UserProfile,
} from '../models/api.models';

const TOKEN_KEY = 'techtill.access';
const REFRESH_KEY = 'techtill.refresh';
const PROFILE_KEY = 'techtill.profile';
const SHOP_KEY = 'techtill.shop';

/**
 * Holds the signed in session. The profile carries the per module access matrix, which
 * the sidebar, the route guards and the action buttons all read from. The backend
 * enforces the same matrix again on every call, so hiding something here is a courtesy
 * rather than the control.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = environment.apiBaseUrl;

  private readonly profileSignal = signal<UserProfile | null>(readStored<UserProfile>(PROFILE_KEY));
  private readonly shopSignal = signal<number | null>(readStoredNumber(SHOP_KEY));

  readonly profile = this.profileSignal.asReadonly();
  readonly isSignedIn = computed(() => this.profileSignal() !== null && this.accessToken !== null);
  readonly isAdmin = computed(() => this.profileSignal()?.role === 'Admin');
  readonly shops = computed<ShopRef[]>(() => this.profileSignal()?.shops ?? []);

  /** The shop switcher value. Null means every shop the user may see. */
  readonly activeShopId = this.shopSignal.asReadonly();

  readonly activeShopName = computed(() => {
    const id = this.shopSignal();
    if (id === null) {
      return 'All shops';
    }

    return this.shops().find((s) => s.id === id)?.name ?? 'All shops';
  });

  get accessToken(): string | null {
    return safeRead(TOKEN_KEY);
  }

  get refreshToken(): string | null {
    return safeRead(REFRESH_KEY);
  }

  login(username: string, password: string): Observable<AuthResult> {
    return this.http
      .post<AuthResult>(`${this.base}/auth/login`, { username, password })
      .pipe(tap((result) => this.apply(result)));
  }

  refresh(): Observable<AuthResult> {
    return this.http
      .post<AuthResult>(`${this.base}/auth/refresh`, { refreshToken: this.refreshToken ?? '' })
      .pipe(tap((result) => this.apply(result)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/change-password`, { currentPassword, newPassword });
  }

  /** Clears the session and sends the user to the sign in page. */
  logout(navigate = true): void {
    const token = this.refreshToken;
    if (token) {
      // Fire and forget. The session is cleared locally whatever the server says.
      this.http.post(`${this.base}/auth/logout`, { refreshToken: token }).subscribe({
        error: () => undefined,
      });
    }

    this.clear();

    if (navigate) {
      void this.router.navigate(['/login']);
    }
  }

  clear(): void {
    safeRemove(TOKEN_KEY);
    safeRemove(REFRESH_KEY);
    safeRemove(PROFILE_KEY);
    this.profileSignal.set(null);
  }

  setActiveShop(shopId: number | null): void {
    this.shopSignal.set(shopId);
    if (shopId === null) {
      safeRemove(SHOP_KEY);
    } else {
      safeWrite(SHOP_KEY, String(shopId));
    }
  }

  canRead(module: ModuleName): boolean {
    return this.hasAccess(module, 'Read');
  }

  canWrite(module: ModuleName): boolean {
    return this.hasAccess(module, 'Write');
  }

  private hasAccess(module: ModuleName, access: Access): boolean {
    const profile = this.profileSignal();
    if (!profile) {
      return false;
    }

    if (profile.role === 'Admin') {
      return true;
    }

    // Users, the audit log and settings stay with the owner whatever the matrix says.
    if (module === 'Users' || module === 'AuditLog' || module === 'Settings') {
      return false;
    }

    const entry = profile.permissions.find((p) => p.module === module);
    if (!entry) {
      return false;
    }

    return access === 'Write' ? entry.canWrite : entry.canRead || entry.canWrite;
  }

  private apply(result: AuthResult): void {
    safeWrite(TOKEN_KEY, result.accessToken);
    safeWrite(REFRESH_KEY, result.refreshToken);
    safeWrite(PROFILE_KEY, JSON.stringify(result.user));
    this.profileSignal.set(result.user);

    // Drop a remembered shop the user has since lost access to.
    const shopId = this.shopSignal();
    if (shopId !== null && !result.user.shops.some((s) => s.id === shopId)) {
      this.setActiveShop(null);
    }
  }
}

// Storage can throw in a locked down browser profile, so every access is guarded.
function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A session that cannot be remembered still works until the tab closes.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

function readStored<T>(key: string): T | null {
  const raw = safeRead(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readStoredNumber(key: string): number | null {
  const raw = safeRead(key);
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
