import { Component, input } from '@angular/core';

import { LedgerViewComponent } from '../../shared/ui/ledger-view.component';

@Component({
  selector: 'tt-supplier-ledger',
  standalone: true,
  imports: [LedgerViewComponent],
  template: `
    <tt-ledger-view
      resource="suppliers"
      [partyId]="id()"
      backLink="/suppliers"
      backLabel="Suppliers"
      balanceLabel="Bills add to the balance, payments reduce it. A positive closing balance is money you still owe."
    />
  `,
})
export class SupplierLedgerComponent {
  readonly id = input.required<string>();
}
