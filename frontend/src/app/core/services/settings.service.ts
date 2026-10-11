import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { ApiService } from './api.service';
import {
  CurrencyOption,
  DEFAULT_CURRENCY,
  setActiveCurrency,
  setAvailableCurrencies,
} from './currency';

export interface AppSettingsDto {
  currency: CurrencyOption;
  available: CurrencyOption[];
}

/**
 * Loads the application settings once per session and pushes the currency into the shared
 * signal the formatters read. Changing it here changes every money figure in the app.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly api = inject(ApiService);

  readonly currency = signal<CurrencyOption>(DEFAULT_CURRENCY);
  readonly loaded = signal(false);

  load(): Observable<AppSettingsDto> {
    return this.api.get<AppSettingsDto>('settings').pipe(tap((result) => this.apply(result)));
  }

  save(currencyCode: string): Observable<AppSettingsDto> {
    return this.api
      .put<AppSettingsDto>('settings', { currencyCode })
      .pipe(tap((result) => this.apply(result)));
  }

  /** Called on sign out so the next account starts from the server's value again. */
  reset(): void {
    this.loaded.set(false);
    this.currency.set(DEFAULT_CURRENCY);
    setActiveCurrency(DEFAULT_CURRENCY);
  }

  private apply(result: AppSettingsDto): void {
    this.currency.set(result.currency);
    setActiveCurrency(result.currency);
    setAvailableCurrencies(result.available);
    this.loaded.set(true);
  }
}
