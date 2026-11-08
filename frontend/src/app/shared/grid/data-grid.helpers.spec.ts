import { FilterOperator } from '../../core/models/api.models';
import { csvCell, dateRule, formatDate, numberRule } from './data-grid.component';

describe('data grid filter syntax', () => {
  it('AC:UI-07 reads a plain number as equals', () => {
    expect(numberRule('qty', '5')).toEqual({ field: 'qty', operator: FilterOperator.Equals, value: '5', value2: null });
  });

  const comparisons: [string, FilterOperator][] = [
    ['>5', FilterOperator.GreaterThan],
    ['>=5', FilterOperator.GreaterThanOrEqual],
    ['<5', FilterOperator.LessThan],
    ['<=5', FilterOperator.LessThanOrEqual],
    ['!=5', FilterOperator.NotEquals],
    ['=5', FilterOperator.Equals],
    ['> 5', FilterOperator.GreaterThan],
  ];

  comparisons.forEach(([text, operator]) => {
    it(`AC:UI-07 reads "${text}" as a comparison`, () => {
      expect(numberRule('qty', text)?.operator).toBe(operator);
      expect(numberRule('qty', text)?.value).toBe('5');
    });
  });

  it('AC:UI-07 reads a range', () => {
    expect(numberRule('qty', '10..20')).toEqual({ field: 'qty', operator: FilterOperator.Between, value: '10', value2: '20' });
  });

  it('AC:UI-07 accepts negatives and decimals', () => {
    expect(numberRule('qty', '-1.5..2.25')?.value).toBe('-1.5');
    expect(numberRule('qty', '<-3')?.value).toBe('-3');
  });

  ['abc', '1..', '..2', '>', '1,000', '5 5'].forEach((text) => {
    it(`AC:UI-07 ignores "${text}"`, () => expect(numberRule('qty', text)).toBeNull());
  });

  it('AC:UI-07 reads a full date range', () => {
    expect(dateRule('d', '2026-01-01..2026-02-01')).toEqual({
      field: 'd',
      operator: FilterOperator.Between,
      value: '2026-01-01',
      value2: '2026-02-01',
    });
  });

  it('AC:UI-07 reads an open-ended start', () => {
    expect(dateRule('d', '2026-01-01..')?.operator).toBe(FilterOperator.GreaterThanOrEqual);
  });

  it('AC:UI-07 keeps the whole end day for an open-ended finish', () => {
    const rule = dateRule('d', '..2026-02-01');
    expect(rule?.operator).toBe(FilterOperator.Between);
    expect(rule?.value2).toBe('2026-02-01');
  });

  it('AC:UI-07 ignores an empty date range', () => expect(dateRule('d', '..')).toBeNull());

  it('AC:UI-07 formats dates and leaves bad ones blank', () => {
    expect(formatDate('2026-03-05T10:00:00Z')).toContain('2026');
    expect(formatDate('nope')).toBe('');
    expect(formatDate(null)).toBe('');
  });
});

describe('CSV cells', () => {
  it('AC:UI-08 quotes every cell and doubles embedded quotes', () => {
    expect(csvCell('a')).toBe('"a"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a,b\nc')).toBe('"a,b\nc"');
  });

  ['=1+1', '+SUM(A1)', '-cmd', '@x', '\tx', '\rx'].forEach((text) => {
    it(`AC:UI-08 neutralises a formula starting "${JSON.stringify(text[0])}"`, () => {
      expect(csvCell(text).startsWith(`"'`)).toBeTrue();
    });
  });

  it('AC:UI-08 leaves real negative numbers alone', () => {
    expect(csvCell('-12.5')).toBe('"-12.5"');
  });
});
