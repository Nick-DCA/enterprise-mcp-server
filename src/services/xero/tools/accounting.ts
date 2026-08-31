import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { xeroService } from '../client.js';
import { cleanObject } from '../../../utils/clean.js';
import {
  Account,
  Invoice,
  CreditNote,
  ManualJournal,
  Payment,
  Item,
  BankTransaction,
  Quote,
  TrackingCategory,
} from 'xero-node';

const lineItemSchema = z.object({
  description: z.string().describe('Line item description'),
  quantity: z.coerce.number().optional().default(1).describe('Quantity'),
  unitAmount: z.coerce.number().describe('Unit price amount'),
  accountCode: z.string().optional().describe('Account code for sales/expense category'),
  taxType: z.string().optional().describe('Tax type (e.g. OUTPUT, INPUT, NONE)'),
});

export const accountingTools: ToolDefinition[] = [
  // 1. xero-list-accounts
  {
    name: 'xero-list-accounts',
    description:
      'Retrieve Chart of Accounts from Xero. Supports optional where filtering (e.g., \'Type=="BANK"\' or \'Status=="ACTIVE"\') to inspect ledger account codes, names, classes, and tax types.',
    schema: {
      where: z.string().optional().describe('Filter expression using Xero query syntax (e.g. Type=="BANK")'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listAccounts(params.where);
    },
  },

  // 2. xero-get-account
  {
    name: 'xero-get-account',
    description:
      'Retrieve comprehensive account details for a specific Xero account by its unique Account ID (GUID), including reporting codes, currency, and tax settings.',
    schema: {
      accountId: z.string().describe('The unique Xero Account ID'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.getAccount(params.accountId);
    },
  },

  // 3. xero-create-account
  {
    name: 'xero-create-account',
    description:
      'Create a new general ledger account in the Xero Chart of Accounts with specified account code, name, account type (e.g. BANK, EXPENSE, REVENUE), tax type, and description.',
    schema: {
      code: z.string().describe('Account code (e.g. 200)'),
      name: z.string().describe('Account name (e.g. Sales Income)'),
      type: z
        .enum([
          'BANK',
          'CURRENT',
          'CURRLIAB',
          'DEPRECIATN',
          'DIRECTCOSTS',
          'EQUITY',
          'EXPENSE',
          'FIXED',
          'LIABILITY',
          'NONCURRENT',
          'OTHERINCOME',
          'PAYABLE',
          'PREPAYMENT',
          'RECEIVABLE',
          'REVENUE',
          'SALES',
          'TERMDAC',
          'UNPAIDEXP_CLAIM',
        ])
        .describe('Account type'),
      description: z.string().optional().describe('Account description'),
      taxType: z.string().optional().describe('Default tax type'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const accountData: Account = {
        code: params.code,
        name: params.name,
        type: params.type as Account['type'],
        description: params.description,
        taxType: params.taxType,
      };
      return xeroService.createAccount(accountData);
    },
  },

  // 4. xero-list-invoices
  {
    name: 'xero-list-invoices',
    description:
      'Retrieve sales invoices (ACCREC) and supplier bills (ACCPAY) from Xero. Supports where filtering (e.g., \'Status=="AUTHORISED"\'), page-based pagination (100 records/page), and summaryOnly mode.',
    schema: {
      where: z.string().optional().describe('Filter expression (e.g. Status=="AUTHORISED")'),
      page: z.coerce.number().optional().describe('Page number (100 records per page)'),
      summaryOnly: z.coerce.boolean().optional().default(true).describe('Return summary view without heavy nested line items'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listInvoices(params);
    },
  },

  // 5. xero-get-invoice
  {
    name: 'xero-get-invoice',
    description:
      'Retrieve full invoice details from Xero by unique Invoice ID or Invoice Number, including line items, unit prices, account codes, tax amounts, and payment allocations.',
    schema: {
      invoiceId: z.string().describe('The unique Xero Invoice ID'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.getInvoice(params.invoiceId);
    },
  },

  // 6. xero-create-invoice
  {
    name: 'xero-create-invoice',
    description:
      'Create a new sales invoice (ACCREC) or supplier bill (ACCPAY) in Xero with line items, contact details, issue/due dates, reference numbers, and draft/authorised status.',
    schema: {
      type: z.enum(['ACCREC', 'ACCPAY']).describe('ACCREC for sales invoice, ACCPAY for bill'),
      contactId: z.string().optional().describe('Contact ID in Xero'),
      contactName: z.string().optional().describe('Contact name (if Contact ID is unknown)'),
      date: z.string().optional().describe('Invoice date (YYYY-MM-DD)'),
      dueDate: z.string().optional().describe('Invoice due date (YYYY-MM-DD)'),
      lineItems: z.array(lineItemSchema).describe('Array of line items'),
      reference: z.string().optional().describe('Invoice reference or purchase order number'),
      status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED']).optional().default('DRAFT').describe('Status of invoice'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const invoiceData: Invoice = cleanObject({
        type: params.type as unknown as Invoice.TypeEnum,
        contact: params.contactId ? { contactID: params.contactId } : { name: params.contactName },
        date: params.date,
        dueDate: params.dueDate,
        lineItems: params.lineItems.map((item: any) =>
          cleanObject({
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            accountCode: item.accountCode,
            taxType: item.taxType,
          })
        ),
        reference: params.reference,
        status: params.status as unknown as Invoice.StatusEnum,
      });
      return xeroService.createInvoice(invoiceData);
    },
  },

  // 7. xero-update-invoice
  {
    name: 'xero-update-invoice',
    description:
      'Update an existing draft or submitted invoice in Xero by Invoice ID, including status changes (e.g., AUTHORISED, VOIDED), references, or line items.',
    schema: {
      invoiceId: z.string().describe('The unique Xero Invoice ID'),
      reference: z.string().optional().describe('Updated reference string'),
      status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'VOIDED']).optional().describe('Updated invoice status'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const invoiceData: Invoice = cleanObject({
        invoiceID: params.invoiceId,
        reference: params.reference,
        status: params.status as unknown as Invoice.StatusEnum,
      });
      return xeroService.updateInvoice(params.invoiceId, invoiceData);
    },
  },

  // 8. xero-list-credit-notes
  {
    name: 'xero-list-credit-notes',
    description:
      'Retrieve credit notes from Xero with optional where filtering (e.g., \'Type=="ACCRECCREDIT"\') and pagination, including remaining credit balances.',
    schema: {
      where: z.string().optional().describe('Filter expression'),
      page: z.coerce.number().optional().describe('Page number'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listCreditNotes(params);
    },
  },

  // 9. xero-create-credit-note
  {
    name: 'xero-create-credit-note',
    description:
      'Issue a customer credit note (ACCRECCREDIT) or supplier credit note (ACCPAYCREDIT) in Xero with line items, contact information, and reference.',
    schema: {
      type: z.enum(['ACCRECCREDIT', 'ACCPAYCREDIT']).describe('ACCRECCREDIT for sales, ACCPAYCREDIT for supplier'),
      contactId: z.string().optional().describe('Contact ID'),
      contactName: z.string().optional().describe('Contact Name'),
      lineItems: z.array(lineItemSchema).describe('Array of line items'),
      reference: z.string().optional().describe('Credit Note reference'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const creditNoteData: CreditNote = cleanObject({
        type: params.type as CreditNote.TypeEnum,
        contact: params.contactId ? { contactID: params.contactId } : { name: params.contactName },
        lineItems: params.lineItems.map((item: any) =>
          cleanObject({
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            accountCode: item.accountCode,
            taxType: item.taxType,
          })
        ),
        reference: params.reference,
      });
      return xeroService.createCreditNote(creditNoteData);
    },
  },

  // 10. xero-update-credit-note
  {
    name: 'xero-update-credit-note',
    description:
      'Update an existing credit note status (e.g., AUTHORISED, VOIDED) or details in Xero by Credit Note ID.',
    schema: {
      creditNoteId: z.string().describe('Credit Note ID'),
      status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'VOIDED']).describe('Updated status'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const creditNoteData: CreditNote = cleanObject({
        creditNoteID: params.creditNoteId,
        status: params.status as CreditNote.StatusEnum,
      });
      return xeroService.updateCreditNote(params.creditNoteId, creditNoteData);
    },
  },

  // 11. xero-list-manual-journals
  {
    name: 'xero-list-manual-journals',
    description:
      'Retrieve manual general ledger journal entries from Xero with optional where filtering and pagination to review debit/credit postings.',
    schema: {
      where: z.string().optional().describe('Filter expression'),
      page: z.coerce.number().optional().describe('Page number'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listManualJournals(params);
    },
  },

  // 12. xero-create-manual-journal
  {
    name: 'xero-create-manual-journal',
    description:
      'Post a balanced manual journal entry to the Xero general ledger with journal lines containing debit (+) and credit (-) amounts, account codes, and narration.',
    schema: {
      narration: z.string().describe('Journal entry description / narration'),
      journalLines: z
        .array(
          z.object({
            lineAmount: z.coerce.number().describe('Line debit (+) or credit (-) amount'),
            accountCode: z.string().describe('Account code'),
            description: z.string().optional().describe('Line description'),
          })
        )
        .describe('Array of journal lines'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const journalData: ManualJournal = cleanObject({
        narration: params.narration,
        journalLines: params.journalLines,
      });
      return xeroService.createManualJournal(journalData);
    },
  },

  // 13. xero-update-manual-journal
  {
    name: 'xero-update-manual-journal',
    description:
      'Update a draft manual journal in Xero by Journal ID, including narration or status updates (DRAFT, POSTED, VOIDED).',
    schema: {
      journalId: z.string().describe('Manual Journal ID'),
      narration: z.string().optional().describe('Updated narration'),
      status: z.enum(['DRAFT', 'POSTED', 'VOIDED']).optional().describe('Updated status'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const journalData: ManualJournal = cleanObject({
        manualJournalID: params.journalId,
        narration: params.narration,
        status: params.status as ManualJournal.StatusEnum,
      });
      return xeroService.updateManualJournal(params.journalId, journalData);
    },
  },

  // 14. xero-list-payments
  {
    name: 'xero-list-payments',
    description:
      'Retrieve payments recorded against invoices or credit notes in Xero with optional where filtering to reconcile accounts.',
    schema: {
      where: z.string().optional().describe('Filter expression'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listPayments(params.where);
    },
  },

  // 15. xero-create-payment
  {
    name: 'xero-create-payment',
    description:
      'Record a payment against an invoice or credit note in Xero, specifying payment amount, payment date, reference, and receiving bank account ID or code.',
    schema: {
      invoiceId: z.string().optional().describe('Invoice ID receiving payment'),
      creditNoteId: z.string().optional().describe('Credit Note ID'),
      accountId: z.string().optional().describe('Bank Account ID or Code receiving funds'),
      accountCode: z.string().optional().describe('Bank Account Code'),
      amount: z.coerce.number().describe('Payment amount'),
      date: z.string().optional().describe('Payment date (YYYY-MM-DD)'),
      reference: z.string().optional().describe('Payment reference'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const paymentData: Payment = cleanObject({
        invoice: params.invoiceId ? { invoiceID: params.invoiceId } : undefined,
        creditNote: params.creditNoteId ? { creditNoteID: params.creditNoteId } : undefined,
        account: params.accountId
          ? { accountID: params.accountId }
          : params.accountCode
          ? { code: params.accountCode }
          : undefined,
        amount: params.amount,
        date: params.date,
        reference: params.reference,
      });
      return xeroService.createPayment(paymentData);
    },
  },

  // 16. xero-list-tax-rates
  {
    name: 'xero-list-tax-rates',
    description:
      'Retrieve all registered tax rates and sales tax rules configured in Xero (e.g., OUTPUT, INPUT, EXEMPT, ZERO-RATED) with their effective percentages.',
    schema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async () => {
      return xeroService.listTaxRates();
    },
  },

  // 17. xero-list-items
  {
    name: 'xero-list-items',
    description:
      'Retrieve inventory products and tracked/untracked service items in Xero, including sales unit prices, cost of goods, and sales account codes.',
    schema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async () => {
      return xeroService.listItems();
    },
  },

  // 18. xero-create-item
  {
    name: 'xero-create-item',
    description:
      'Create a new tracked or untracked product/service inventory item in Xero with item code, name, sales description, unit price, and sales account code.',
    schema: {
      code: z.string().describe('Item Code'),
      name: z.string().optional().describe('Item Name'),
      description: z.string().optional().describe('Sales description'),
      unitPrice: z.coerce.number().optional().describe('Sales unit price'),
      accountCode: z.string().optional().describe('Sales account code'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const itemData: Item = cleanObject({
        code: params.code,
        name: params.name,
        description: params.description,
        salesDetails:
          params.unitPrice || params.accountCode
            ? { unitPrice: params.unitPrice, accountCode: params.accountCode }
            : undefined,
      });
      return xeroService.createItem(itemData);
    },
  },

  // 19. xero-update-item
  {
    name: 'xero-update-item',
    description:
      'Update an existing inventory item in Xero by Item ID or Code, modifying item name, sales description, pricing, or account mapping.',
    schema: {
      itemId: z.string().describe('The unique Xero Item ID'),
      code: z.string().optional().describe('Item code'),
      name: z.string().optional().describe('Updated name'),
      description: z.string().optional().describe('Updated description'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const itemData: Item = cleanObject({
        itemID: params.itemId,
        code: params.code,
        name: params.name,
        description: params.description,
      });
      return xeroService.updateItem(params.itemId, itemData);
    },
  },

  // 20. xero-list-bank-transactions
  {
    name: 'xero-list-bank-transactions',
    description:
      'Retrieve bank account transactions (SPEND or RECEIVE money) in Xero with optional where filtering and pagination.',
    schema: {
      where: z.string().optional().describe('Filter expression'),
      page: z.coerce.number().optional().describe('Page number'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listBankTransactions(params);
    },
  },

  // 21. xero-create-bank-transaction
  {
    name: 'xero-create-bank-transaction',
    description:
      'Create a new bank transaction (Spend/Receive money) against a specified bank account in Xero with line items, contact, and reference.',
    schema: {
      type: z
        .enum(['RECEIVE', 'RECEIVE-OVERPAYMENT', 'RECEIVE-PREPAYMENT', 'SPEND', 'SPEND-OVERPAYMENT', 'SPEND-PREPAYMENT'])
        .describe('Bank transaction type'),
      bankAccountId: z.string().describe('Bank Account ID'),
      contactId: z.string().optional().describe('Contact ID'),
      lineItems: z.array(lineItemSchema).describe('Array of line items'),
      reference: z.string().optional().describe('Transaction reference'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const bankTransactionData: BankTransaction = cleanObject({
        type: params.type as unknown as BankTransaction.TypeEnum,
        bankAccount: { accountID: params.bankAccountId },
        contact: params.contactId ? { contactID: params.contactId } : undefined,
        lineItems: params.lineItems.map((item: any) =>
          cleanObject({
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            accountCode: item.accountCode,
            taxType: item.taxType,
          })
        ),
        reference: params.reference,
      });
      return xeroService.createBankTransaction(bankTransactionData);
    },
  },

  // 22. xero-update-bank-transaction
  {
    name: 'xero-update-bank-transaction',
    description:
      'Update an existing bank transaction in Xero by Bank Transaction ID (e.g., mark as AUTHORISED or DELETED).',
    schema: {
      bankTransactionId: z.string().describe('Bank Transaction ID'),
      status: z.enum(['AUTHORISED', 'DELETED']).describe('Updated status'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const bankTransactionData = cleanObject({
        bankTransactionID: params.bankTransactionId,
        status: params.status as unknown as BankTransaction.StatusEnum,
      }) as unknown as BankTransaction;
      return xeroService.updateBankTransaction(params.bankTransactionId, bankTransactionData);
    },
  },

  // 23. xero-list-quotes
  {
    name: 'xero-list-quotes',
    description:
      'Retrieve sales quotes issued to customers in Xero with optional where filtering and pagination.',
    schema: {
      where: z.string().optional().describe('Filter expression'),
      page: z.coerce.number().optional().describe('Page number'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listQuotes(params);
    },
  },

  // 24. xero-create-quote
  {
    name: 'xero-create-quote',
    description:
      'Create and issue a new sales quote for a customer in Xero with line items, quote date, expiry date, title, and terms.',
    schema: {
      contactId: z.string().describe('Contact ID'),
      lineItems: z.array(lineItemSchema).describe('Array of line items'),
      date: z.string().optional().describe('Quote date (YYYY-MM-DD)'),
      expiryDate: z.string().optional().describe('Quote expiry date (YYYY-MM-DD)'),
      title: z.string().optional().describe('Quote title'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const quoteData: Quote = cleanObject({
        contact: { contactID: params.contactId },
        lineItems: params.lineItems.map((item: any) =>
          cleanObject({
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            accountCode: item.accountCode,
            taxType: item.taxType,
          })
        ),
        date: params.date,
        expiryDate: params.expiryDate,
        title: params.title,
      });
      return xeroService.createQuote(quoteData);
    },
  },

  // 25. xero-list-tracking-categories
  {
    name: 'xero-list-tracking-categories',
    description:
      'Retrieve cost center tracking categories and their active options/subcategories in Xero for departmental and regional tracking.',
    schema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async () => {
      return xeroService.listTrackingCategories();
    },
  },
];
