import { FilterOperator } from '../../core/models/api.models';

export type ColumnKind = 'text' | 'number' | 'money' | 'date' | 'bool' | 'enum' | 'custom';

export interface GridColumn<T = Record<string, unknown>> {
  /** Must match a whitelisted field name on the server's QuerySpec. */
  field: string;
  header: string;
  kind: ColumnKind;

  width?: number;
  minWidth?: number;
  flex?: number;

  /** Hidden by default but still offered in the column chooser. */
  hidden?: boolean;

  sortable?: boolean;
  filterable?: boolean;

  /** Options for an enum column's filter dropdown. */
  options?: readonly string[];

  /** Renders the cell. Return a plain string, or HTML when `html` is true. */
  render?: (row: T) => string;
  html?: boolean;

  /** Extra class on the cell, for example to right align a number. */
  cellClass?: string;
}

export interface GridAction<T = Record<string, unknown>> {
  label: string;
  icon?: string;
  kind?: 'default' | 'danger';
  run: (row: T) => void;

  /** Hide the action for rows it does not apply to. */
  visible?: (row: T) => boolean;
}

/** The operators offered per column kind, in the order they appear in the UI. */
export const OPERATORS_BY_KIND: Record<ColumnKind, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: FilterOperator.Contains, label: 'contains' },
    { value: FilterOperator.Equals, label: 'is' },
    { value: FilterOperator.NotEquals, label: 'is not' },
    { value: FilterOperator.StartsWith, label: 'starts with' },
    { value: FilterOperator.EndsWith, label: 'ends with' },
    { value: FilterOperator.IsEmpty, label: 'is empty' },
    { value: FilterOperator.IsNotEmpty, label: 'has a value' },
  ],
  number: [
    { value: FilterOperator.Equals, label: '=' },
    { value: FilterOperator.NotEquals, label: 'is not' },
    { value: FilterOperator.GreaterThan, label: 'more than' },
    { value: FilterOperator.GreaterThanOrEqual, label: 'at least' },
    { value: FilterOperator.LessThan, label: 'less than' },
    { value: FilterOperator.LessThanOrEqual, label: 'at most' },
    { value: FilterOperator.Between, label: 'between' },
  ],
  money: [
    { value: FilterOperator.Equals, label: '=' },
    { value: FilterOperator.GreaterThan, label: 'more than' },
    { value: FilterOperator.GreaterThanOrEqual, label: 'at least' },
    { value: FilterOperator.LessThan, label: 'less than' },
    { value: FilterOperator.LessThanOrEqual, label: 'at most' },
    { value: FilterOperator.Between, label: 'between' },
  ],
  date: [
    { value: FilterOperator.Equals, label: 'on' },
    { value: FilterOperator.GreaterThanOrEqual, label: 'from' },
    { value: FilterOperator.LessThanOrEqual, label: 'until' },
    { value: FilterOperator.Between, label: 'between' },
  ],
  bool: [{ value: FilterOperator.Equals, label: 'is' }],
  enum: [
    { value: FilterOperator.Equals, label: 'is' },
    { value: FilterOperator.NotEquals, label: 'is not' },
    { value: FilterOperator.In, label: 'is one of' },
  ],
  custom: [{ value: FilterOperator.Contains, label: 'contains' }],
};

export const PAGE_SIZES = [10, 25, 50, 100] as const;
