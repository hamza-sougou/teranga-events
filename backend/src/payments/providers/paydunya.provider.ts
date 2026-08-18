import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as paydunya from 'paydunya';

export interface InvoiceItemInput {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface CreateInvoiceInput {
  totalAmount: number;
  description: string;
  items: InvoiceItemInput[];
  callbackUrl: string;
  returnUrl: string;
  cancelUrl: string;
  customData: Record<string, string>;
}

export interface CreateInvoiceResult {
  token: string;
  paymentUrl: string;
  status: string;
}

export interface ConfirmInvoiceResult {
  status: 'completed' | 'pending' | 'canceled' | 'fail';
  totalAmount: number;
  customData: Record<string, string>;
  responseText: string;
}

export interface DisburseResult {
  transactionId: string;
  responseText: string;
}

// Thin wrapper around the `paydunya` SDK (plain JS, no types — see
// src/types/paydunya.d.ts). Every method here maps 1:1 to a real SDK call,
// inspected directly from node_modules/paydunya (no types published,
// README + source read at implementation time) — see
// docs/MODULE_PAIEMENT_SPEC.md §10/§12 for what's still unconfirmed against
// PayDunya's own docs (exact IPN payload field names).
@Injectable()
export class PaydunyaProvider {
  constructor(private readonly configService: ConfigService) {}

  private buildSetup() {
    return new paydunya.Setup({
      masterKey: this.configService.get<string>('paydunya.masterKey'),
      privateKey: this.configService.get<string>('paydunya.privateKey'),
      publicKey: this.configService.get<string>('paydunya.publicKey'),
      token: this.configService.get<string>('paydunya.token'),
      mode: this.configService.get<string>('paydunya.mode'),
    });
  }

  private buildStore() {
    return new paydunya.Store({ name: 'Zen Events' });
  }

  async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const invoice = new paydunya.CheckoutInvoice(this.buildSetup(), this.buildStore());

    invoice.description = input.description;
    for (const item of input.items) {
      invoice.addItem(item.name, item.quantity, item.unitPrice, item.totalPrice);
    }
    // Set explicitly — never let the SDK sum it from addItem() calls, per
    // docs/SPEC.md §5.2 ("le montant total facturé est calculé côté Zen
    // Events, jamais par PayDunya").
    invoice.totalAmount = input.totalAmount;
    invoice.callbackURL = input.callbackUrl;
    invoice.returnURL = input.returnUrl;
    invoice.cancelURL = input.cancelUrl;
    for (const [key, value] of Object.entries(input.customData)) {
      invoice.addCustomData(key, value);
    }

    await invoice.create();

    return {
      token: invoice.token,
      paymentUrl: invoice.url,
      status: invoice.status,
    };
  }

  // Re-fetches the authoritative status straight from PayDunya's servers
  // (GET /checkout-invoice/confirm/:token) — never trust the incoming IPN
  // payload's own status/amount fields for business decisions, only its
  // token (docs/MODULE_PAIEMENT_SPEC.md §4).
  async confirmInvoice(token: string): Promise<ConfirmInvoiceResult> {
    const invoice = new paydunya.CheckoutInvoice(this.buildSetup(), this.buildStore());
    await invoice.confirm(token);

    return {
      status: invoice.status,
      totalAmount: Number(invoice.totalAmount),
      customData: invoice.customData ?? {},
      responseText: invoice.responseText,
    };
  }

  // Organizer payout (déboursement), via DirectPay — the SDK's only
  // money-out primitive. `accountAlias` accepts "Account alias, number or
  // email" per the SDK's own doc comment, so organizations.payout_phone_number
  // is passed directly.
  async disburse(accountAlias: string, amount: number): Promise<DisburseResult> {
    const directPay = new paydunya.DirectPay(this.buildSetup());
    await directPay.creditAccount(accountAlias, amount);

    return {
      transactionId: directPay.transactionID,
      responseText: directPay.responseText,
    };
  }
}
