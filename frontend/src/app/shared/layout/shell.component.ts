import { HttpClient, HttpContext } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { filter, map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { SILENT } from '../../core/interceptors/http.interceptors';
import { DashboardDto, ModuleName } from '../../core/models/api.models';
import { AlertService } from '../../core/services/alert.service';
import { SeenMap, browserStorage, markSeen, readSeen, unseen, writeSeen } from '../../core/services/alerts';
import { AuthService } from '../../core/services/auth.service';
import { currencySymbol, formatCompact, formatMoney } from '../../core/services/currency';
import { initials } from '../../core/services/format';
import { NAV_GROUPS, NavGroup } from '../../core/services/navigation';
import { ProgressService } from '../../core/services/progress.service';
import { SettingsService } from '../../core/services/settings.service';
import { Avatar } from '../ui/ui';
import { ProgressBarComponent } from './progress-bar.component';

interface Alert {
  key: string;
  icon: string;
  tone: string;
  text: string;
  route: string;
}

interface SearchHit {
  icon: string;
  label: string;
  route: string;
  query: Record<string, string>;
}

const SIDEBAR_KEY = 'techtill.sidebar.collapsed';
const ALERT_POLL_MS = 60_000;

/**
 * The app shell: a fixed sidebar on every page, a top bar with search, the shop switcher,
 * alerts and the user menu, and the routed content. The sidebar only lists what the signed
 * in account may read, so the menu matches what the API will actually serve.
 */
@Component({
  selector: 'tt-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, FormsModule, LucideAngularModule, Avatar, ProgressBarComponent],
  templateUrl: './shell.component.html',
  host: { '(document:click)': 'onDocClick($event)', '(document:keydown)': 'onKey($event)' },
})
export class ShellComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly alertDialogs = inject(AlertService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly progress = inject(ProgressService);

  readonly year = new Date().getFullYear();
  readonly collapsed = signal(readCollapsed());
  readonly mobileOpen = signal(false);
  readonly userMenu = signal(false);
  readonly shopMenu = signal(false);
  readonly bellOpen = signal(false);
  readonly now = signal(new Date());
  readonly alerts = signal<Alert[]>([]);
  readonly todaySales = signal<number | null>(null);
  readonly searchText = signal('');
  readonly searchOpen = signal(false);

  readonly profile = this.auth.profile;
  readonly shops = this.auth.shops;
  readonly activeShopName = this.auth.activeShopName;
  readonly activeShopId = this.auth.activeShopId;

  readonly canSeeDashboard = computed(() => this.auth.canRead('Dashboard'));
  readonly canSell = computed(() => this.auth.canWrite('Pos'));
  readonly roleLabel = computed(() => (this.profile()?.role === 'Admin' ? 'Owner' : 'Staff'));
  readonly userInitials = computed(() => initials(this.profile()?.fullName));
  readonly salesLabel = computed(() => {
    const value = this.todaySales();
    return value === null ? '' : `${currencySymbol()} ${formatCompact(value)}`;
  });

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
  private readonly navRoutes = NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => item.route),
  ).sort((a, b) => b.length - a.length);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly activeRoute = computed(() => {
    const path = this.url().split('?')[0].split('#')[0];
    return this.navRoutes.find((route) => path === route || path.startsWith(`${route}/`)) ?? null;
  });

  readonly searchHits = computed<SearchHit[]>(() => {
    const raw = this.searchText().trim();
    const q = raw.toLowerCase();
    if (!q) return [];

    const pages = this.groups()
      .flatMap((g) => g.items)
      .filter((i) => i.label.toLowerCase().includes(q))
      .map((i) => ({ icon: i.icon, label: `Go to ${i.label}`, route: i.route, query: {} }));

    const targets: { module: ModuleName; icon: string; noun: string; route: string }[] = [
      { module: 'Products', icon: 'package', noun: 'Products', route: '/products' },
      { module: 'Customers', icon: 'contact', noun: 'Customers', route: '/customers' },
      { module: 'Invoices', icon: 'file-text', noun: 'Invoices', route: '/invoices' },
      { module: 'Suppliers', icon: 'truck', noun: 'Suppliers', route: '/suppliers' },
    ];
    const records = targets
      .filter((t) => this.auth.canRead(t.module))
      .map((t) => ({
        icon: t.icon,
        label: `${t.noun} matching “${raw}”`,
        route: t.route,
        query: { search: raw },
      }));

    return [...pages.slice(0, 3), ...records];
  });

  /** What this user has already seen in the bell, with the numbers they saw. Kept across reloads. */
  private readonly seen = signal<SeenMap>(
    readSeen(browserStorage(), this.profile()?.username ?? ''),
  );

  /** The badge counts only alerts not yet seen with their current numbers. */
  readonly unseenAlerts = computed(() => unseen(this.alerts(), this.seen()));

  /** Alerts that were new when the bell was opened, marked with a dot in the list. */
  readonly freshKeys = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // The figures are per shop, so changing the switcher refreshes them.
    effect(() => {
      this.activeShopId();
      untracked(() => this.loadAlerts());
    });
  }

  ngOnInit(): void {
    // The shell only renders for a signed in user, which makes it the right place to
    // pull the currency that every money figure below it is formatted with.
    if (!this.settings.loaded()) {
      this.settings.load().subscribe({ error: () => undefined });
    }

    const clock = setInterval(() => this.now.set(new Date()), 1000);
    const poll = setInterval(() => this.loadAlerts(), ALERT_POLL_MS);
    this.destroyRef.onDestroy(() => {
      clearInterval(clock);
      clearInterval(poll);
    });

    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.mobileOpen.set(false));
  }

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
    try {
      localStorage.setItem(SIDEBAR_KEY, String(this.collapsed()));
    } catch {
      // A preference that cannot be stored is not worth failing over.
    }
  }

  private loadAlerts(): void {
    if (!this.canSeeDashboard()) return;

    const today = new Date().toISOString().slice(0, 10);
    let params: Record<string, string> = { from: today, to: today };
    const shopId = this.activeShopId();
    if (shopId !== null) params = { ...params, shopId: String(shopId) };

    this.http
      .get<DashboardDto>(`${environment.apiBaseUrl}/dashboard`, {
        params,
        context: new HttpContext().set(SILENT, true),
      })
      .subscribe({
        next: (d) => {
          const alerts: Alert[] = [];
          const lowStock = d.kpi.lowStockItems;
          if (lowStock && this.auth.canRead('Stock'))
            alerts.push({
              key: 'low-stock',
              icon: 'triangle-alert',
              tone: 'tone-warn',
              text: `${lowStock} ${lowStock === 1 ? 'product is' : 'products are'} at or below reorder level`,
              route: '/stock',
            });
          if (d.receivableAgeing.over90 > 0 && this.auth.canRead('Customers'))
            alerts.push({
              key: 'receivable-90',
              icon: 'hand-coins',
              tone: 'tone-bad',
              text: `${formatMoney(d.receivableAgeing.over90)} of receivables is over 90 days old`,
              route: '/receivables',
            });
          if (d.kpi.payables > 0 && this.auth.canRead('Suppliers'))
            alerts.push({
              key: 'payables',
              icon: 'banknote',
              tone: 'tone-info',
              text: `${formatMoney(d.kpi.payables)} is owed to suppliers`,
              route: '/payables',
            });
          this.alerts.set(alerts);
          this.todaySales.set(d.kpi.todaySales);
        },
        error: () => undefined,
      });
  }

  toggleBell(): void {
    const open = !this.bellOpen();
    this.bellOpen.set(open);
    if (!open) return;

    // Opening the bell is reading it: everything on screen now counts as seen.
    this.freshKeys.set(new Set(this.unseenAlerts().map((a) => a.key)));
    const seen = markSeen(this.alerts());
    this.seen.set(seen);
    writeSeen(browserStorage(), this.profile()?.username ?? '', seen);
  }

  toggleUserMenu(): void {
    this.userMenu.update((v) => !v);
    this.shopMenu.set(false);
  }

  toggleShopMenu(): void {
    this.shopMenu.update((v) => !v);
    this.userMenu.set(false);
  }

  pickShop(shopId: number | null): void {
    this.auth.setActiveShop(shopId);
    this.shopMenu.set(false);

    // Re-enter the current route so the page reloads against the new shop.
    const url = this.router.url;
    void this.router
      .navigateByUrl('/blank', { skipLocationChange: true })
      .then(() => this.router.navigateByUrl(url));
  }

  go(route: string, query?: Record<string, string>): void {
    this.searchOpen.set(false);
    this.bellOpen.set(false);
    this.searchText.set('');
    void this.router.navigate([route], { queryParams: query });
  }

  submitSearch(): void {
    const first = this.searchHits()[0];
    if (first) this.go(first.route, first.query);
  }

  onDocClick(e: Event): void {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-pop="user"]')) this.userMenu.set(false);
    if (!target.closest('[data-pop="shop"]')) this.shopMenu.set(false);
    if (!target.closest('[data-pop="bell"]')) this.bellOpen.set(false);
    if (!target.closest('[data-pop="search"]')) this.searchOpen.set(false);
  }

  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      document.getElementById('global-search')?.focus();
    }
    if (e.key === 'Escape') {
      this.userMenu.set(false);
      this.shopMenu.set(false);
      this.bellOpen.set(false);
      this.mobileOpen.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.userMenu.set(false);
    const confirmed = await this.alertDialogs.confirm({
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
    this.userMenu.set(false);
    void this.router.navigate(['/change-password']);
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'true';
  } catch {
    return false;
  }
}
