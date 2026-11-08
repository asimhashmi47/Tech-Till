import { markSeen, readSeen, unseen, writeSeen } from './alerts';
import {
  DEFAULT_CURRENCY,
  formatAmount,
  formatCompact,
  formatMoney,
  setActiveCurrency,
} from './currency';
import { humanize, initials } from './format';
import { TOAST_MS, toastOptions } from './toast';

function memoryStore(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('bell alerts', () => {
  const low = { key: 'low', text: '3 products' };

  it('AC:UI-09 counts an alert that was never seen', () => {
    expect(unseen([low], {})).toEqual([low]);
  });

  it('AC:UI-09 stops counting once seen', () => {
    expect(unseen([low], markSeen([low]))).toEqual([]);
  });

  it('AC:UI-09 counts again when the numbers change', () => {
    expect(unseen([{ key: 'low', text: '4 products' }], markSeen([low])).length).toBe(1);
  });

  it('AC:UI-09 keeps seen state per user', () => {
    const store = memoryStore();
    writeSeen(store, 'sara', markSeen([low]));
    expect(readSeen(store, 'sara')).toEqual({ low: '3 products' });
    expect(readSeen(store, 'zoya')).toEqual({});
  });

  it('AC:UI-09 survives corrupt storage', () => {
    const store = memoryStore();
    store.setItem('techtill.alerts-seen:sara', '{not json');
    expect(readSeen(store, 'sara')).toEqual({});
  });

  it('AC:UI-09 survives a store that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSeen(broken, 'x')).toEqual({});
    expect(() => writeSeen(broken, 'x', {})).not.toThrow();
  });
});

describe('money formats', () => {
  afterEach(() => setActiveCurrency(DEFAULT_CURRENCY));

  it('AC:UI-10 uses the default currency', () => {
    expect(formatMoney(1234.5)).toBe('Rs 1,234.50');
    expect(formatAmount(1234.5)).toBe('1,234.50');
  });

  it('AC:UI-10 follows the active currency decimals and symbol position', () => {
    setActiveCurrency({ code: 'JPY', symbol: '¥', name: 'Yen', decimals: 0, symbolFirst: false });
    expect(formatMoney(1234.5)).toBe('1,235 ¥');
  });

  it('AC:UI-10 treats null as zero and rejects non-numbers', () => {
    expect(formatMoney(null)).toBe('Rs 0.00');
    expect(formatMoney('abc')).toBe('');
    expect(formatAmount('abc')).toBe('');
  });

  it('AC:UI-10 shortens large figures for chart axes', () => {
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(1500)).toBe('1.5k');
    expect(formatCompact(25000)).toBe('25k');
    expect(formatCompact(1500000)).toBe('1.5M');
    expect(formatCompact(25000000)).toBe('25M');
  });
});

describe('labels', () => {
  it('AC:UI-10 humanizes enum names', () => {
    expect(humanize('PettyCash')).toBe('Petty cash');
    expect(humanize('LoginFailed')).toBe('Login failed');
    expect(humanize('')).toBe('');
    expect(humanize(null)).toBe('');
  });

  it('AC:UI-10 builds initials from unicode names', () => {
    expect(initials('Sara Khan')).toBe('SK');
    expect(initials('  zoya  ')).toBe('Z');
    expect(initials(null)).toBe('?');
  });
});

describe('toasts', () => {
  it('AC:UI-08 sends user data as plain text, never html', () => {
    const options = toastOptions('error', '<img src=x onerror=alert(1)>', 'Title') as Record<string, unknown>;
    expect(options['html']).toBeUndefined();
    expect(options['title']).toBeUndefined();
    expect(options['titleText']).toBe('Title');
    expect(options['text']).toBe('<img src=x onerror=alert(1)>');
  });

  it('AC:UI-09 runs for ten seconds with a progress bar', () => {
    const options = toastOptions('success', 'Saved');
    expect(options.timer).toBe(TOAST_MS);
    expect(options.timerProgressBar).toBeTrue();
    expect(options.titleText).toBe('Saved');
    expect(options.text).toBeUndefined();
  });
});
