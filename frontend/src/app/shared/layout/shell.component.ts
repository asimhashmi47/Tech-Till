import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';

import { NAV_GROUPS, NavGroup } from '../../core/services/navigation';
import { AlertService } from '../../core/services/alert.service';
import { AuthService } from '../../core/services/auth.service';
import { ProgressService } from '../../core/services/progress.service';
import { SettingsService } from '../../core/services/settings.service';
import { ProgressBarComponent } from './progress-bar.component';

const SIDEBAR_KEY = 'techtill.sidebar.collapsed';

/**
 * The app shell: a fixed sidebar on every page, a top bar with the shop switcher and the
 * user menu, and the routed content. The sidebar only lists what the signed in account
 * may read, so the menu matches what the API will actually serve.
 */
@Component({
  selector: 'tt-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, ProgressBarComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly alerts = inject(AlertService);
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsService);
  readonly progress = inject(ProgressService);

  readonly collapsed = signal(readCollapsed());
  readonly mobileOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly shopMenuOpen = signal(false);

  readonly profile = this.auth.profile;
  readonly shops = this.auth.shops;
  readonly activeShopName = this.auth.activeShopName;
  readonly activeShopId = this.auth.activeShopId;

  /** Groups with no readable item are dropped, so no empty headings appear. */
  readonly groups = computed<NavGroup[]>(() =>
    NAV_GROUPS.map((group) => ({
      label: group.label,
      items: group.items.filter((item) =>
        item.adminOnly ? this.auth.isAdmin() : this.auth.canRead(item.module),
      ),
    })).filter((group) => group.items.length > 0),
  );

  /**
   * Which item the sidebar highlights. routerLinkActive cannot answer this on its own:
   * prefix matching lights up Customers as well as Receipts on /customers/receipts, and
   * exact matching would leave nothing lit on /customers/4/ledger. So the longest nav
   * route that the current URL sits under wins, and exactly one item is ever active.
   */
  private readonly navRoutes = NAV_GROUPS
    .flatMap((group) => group.items.map((item) => item.route))
    .sort((a, b) => b.length - a.length);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly activeRoute = computed(() => {
    const path = this.url().split('?')[0].split('#')[0];
    return (
      this.navRoutes.find((route) => path === route || path.startsWith(`${route}/`)) ?? null
    );
  });

  readonly initials = computed(() => {
    const name = this.profile()?.fullName ?? '';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length === 0) {
      return '?';
    }

    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  });

  ngOnInit(): void {
    // The shell only renders for a signed in user, which makes it the right place to
    // pull the currency that every money figure below it is formatted with.
    if (!this.settings.loaded()) {
      this.settings.load().subscribe({ error: () => undefined });
    }
  }

  toggleSidebar(): void {
    this.collapsed.update((value) => {
      const next = !value;
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch {
        // A preference that cannot be stored is not worth failing over.
      }
      return next;
    });
  }

  toggleMobile(): void {
    this.mobileOpen.update((v) => !v);
  }

  closeMobile(): void {
    this.mobileOpen.set(false);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.update((v) => !v);
    this.shopMenuOpen.set(false);
  }

  toggleShopMenu(): void {
    this.shopMenuOpen.update((v) => !v);
    this.userMenuOpen.set(false);
  }

  pickShop(shopId: number | null): void {
    this.auth.setActiveShop(shopId);
    this.shopMenuOpen.set(false);

    // Re-enter the current route so the page reloads against the new shop.
    const url = this.router.url;
    void this.router.navigateByUrl('/blank', { skipLocationChange: true })
      .then(() => this.router.navigateByUrl(url));
  }

  async signOut(): Promise<void> {
    this.userMenuOpen.set(false);
    const confirmed = await this.alerts.confirm({
      title: 'Sign out of TechTill?',
      message: 'Any unsaved form on screen will be lost.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
      icon: 'question',
      danger: false,
    });

    if (confirmed) {
      this.settings.reset();
      this.auth.logout();
    }
  }

  goToPasswordChange(): void {
    this.userMenuOpen.set(false);
    void this.router.navigate(['/change-password']);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.userMenuOpen.set(false);
    this.shopMenuOpen.set(false);
    this.mobileOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-menu]')) {
      this.userMenuOpen.set(false);
      this.shopMenuOpen.set(false);
    }
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'true';
  } catch {
    return false;
  }
}
