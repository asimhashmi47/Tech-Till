import { Component, input } from '@angular/core';

import { LedgerViewComponent } from '../../shared/ui/ledger-view.component';

@Component({
  selector: 'tt-customer-ledger',
  standalone: true,
  imports: [LedgerViewComponent],
  template: `
    <tt-ledger-view
      resource="customers"
      [partyId]="id()"
      backLink="/customers"
      backLabel="Customers"
      balanceLabel="Invoices add to the balance, receipts reduce it. A positive closing balance is money still owed to you."
    />
  `,
})
export class CustomerLedgerComponent {
  readonly id = input.required<string>();
}
