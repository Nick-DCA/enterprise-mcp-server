import {
  XeroClient,
  Invoice,
  Contact,
  Account,
  Payment,
  CreditNote,
  ManualJournal,
  Item,
  BankTransaction,
  Quote,
  TrackingCategory,
} from 'xero-node';
import { getXeroSecrets } from './config.js';
import { logger } from '../../utils/logger.js';
import { executeWithRateLimit } from './rateLimiter.js';

export class XeroService {
  private xeroClient: XeroClient | null = null;
  private activeTenantId: string | null = null;
  private tokenExpiresAt: number = 0;

  /**
   * Initializes or returns the authenticated XeroClient instance and active tenant ID.
   */
  private async getClient(): Promise<{ client: XeroClient; tenantId: string }> {
    const now = Date.now();

    // Check if client exists and token is still valid (with 60-second buffer)
    if (this.xeroClient && this.activeTenantId && now < this.tokenExpiresAt - 60000) {
      return { client: this.xeroClient, tenantId: this.activeTenantId };
    }

    logger.info('Authenticating with Xero via Custom Connection...');
    const secrets = await getXeroSecrets();

    const xero = new XeroClient({
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      grantType: 'client_credentials',
      scopes: secrets.scopes ? secrets.scopes.split(' ') : undefined,
    });

    try {
      const tokenSet = await xero.getClientCredentialsToken();
      logger.info('Successfully obtained client credentials token from Xero');

      // Update tenant list for custom connection
      await xero.updateTenants();

      if (!xero.tenants || xero.tenants.length === 0) {
        throw new Error('No Xero tenants available for this Custom Connection.');
      }

      this.xeroClient = xero;
      this.activeTenantId = secrets.tenantId || xero.tenants[0].tenantId;
      if (!this.activeTenantId) {
        throw new Error('Could not determine active Xero Tenant ID.');
      }

      const expiresInMs = (tokenSet.expires_in || 1800) * 1000;
      this.tokenExpiresAt = now + expiresInMs;

      logger.info({ tenantId: this.activeTenantId, tenantName: xero.tenants[0].tenantName }, 'Xero client ready');
      return { client: this.xeroClient, tenantId: this.activeTenantId };
    } catch (error: any) {
      logger.error({ error: error.message || error }, 'Failed to authenticate with Xero API');
      throw new Error(`Xero Authentication Error: ${error.message || 'Unknown error'}`);
    }
  }

  // --- Accounting API Methods ---

  async listAccounts(where?: string) {
    return executeWithRateLimit('listAccounts', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getAccounts(tenantId, undefined, where);
      return response.body.accounts || [];
    });
  }

  async getAccount(accountId: string) {
    return executeWithRateLimit('getAccount', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getAccount(tenantId, accountId);
      return response.body.accounts?.[0] || response.body;
    });
  }

  async createAccount(account: Account) {
    return executeWithRateLimit('createAccount', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.createAccount(tenantId, account);
      return response.body.accounts?.[0] || response.body;
    });
  }

  async listInvoices(params?: { where?: string; page?: number; summaryOnly?: boolean }) {
    return executeWithRateLimit('listInvoices', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getInvoices(
        tenantId,
        undefined, // ifModifiedSince
        params?.where,
        undefined, // order
        undefined, // ids
        undefined, // invoiceNumbers
        undefined, // contactIds
        undefined, // statuses
        params?.page,
        undefined, // includeArchived
        undefined, // createdByMyApp
        undefined, // unitdp
        params?.summaryOnly ?? true
      );
      return response.body.invoices || [];
    });
  }

  async getInvoice(invoiceId: string) {
    return executeWithRateLimit('getInvoice', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getInvoice(tenantId, invoiceId);
      return response.body.invoices?.[0] || response.body;
    });
  }

  async createInvoice(invoice: Invoice) {
    return executeWithRateLimit('createInvoice', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.createInvoices(tenantId, { invoices: [invoice] });
      return response.body.invoices?.[0] || response.body;
    });
  }

  async updateInvoice(invoiceId: string, invoice: Invoice) {
    return executeWithRateLimit('updateInvoice', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.updateInvoice(tenantId, invoiceId, { invoices: [invoice] });
      return response.body.invoices?.[0] || response.body;
    });
  }

  async listCreditNotes(params?: { where?: string; page?: number }) {
    return executeWithRateLimit('listCreditNotes', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getCreditNotes(tenantId, undefined, params?.where, undefined, params?.page);
      return response.body.creditNotes || [];
    });
  }

  async createCreditNote(creditNote: CreditNote) {
    return executeWithRateLimit('createCreditNote', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.createCreditNotes(tenantId, { creditNotes: [creditNote] });
      return response.body.creditNotes?.[0] || response.body;
    });
  }

  async updateCreditNote(creditNoteId: string, creditNote: CreditNote) {
    return executeWithRateLimit('updateCreditNote', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.updateCreditNote(tenantId, creditNoteId, { creditNotes: [creditNote] });
      return response.body.creditNotes?.[0] || response.body;
    });
  }

  async listManualJournals(params?: { where?: string; page?: number }) {
    return executeWithRateLimit('listManualJournals', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getManualJournals(tenantId, undefined, params?.where, undefined, params?.page);
      return response.body.manualJournals || [];
    });
  }

  async createManualJournal(journal: ManualJournal) {
    return executeWithRateLimit('createManualJournal', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.createManualJournals(tenantId, { manualJournals: [journal] });
      return response.body.manualJournals?.[0] || response.body;
    });
  }

  async updateManualJournal(journalId: string, journal: ManualJournal) {
    return executeWithRateLimit('updateManualJournal', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.updateManualJournal(tenantId, journalId, { manualJournals: [journal] });
      return response.body.manualJournals?.[0] || response.body;
    });
  }

  async listPayments(where?: string) {
    return executeWithRateLimit('listPayments', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getPayments(tenantId, undefined, where);
      return response.body.payments || [];
    });
  }

  async createPayment(payment: Payment) {
    return executeWithRateLimit('createPayment', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.createPayment(tenantId, payment);
      return response.body.payments?.[0] || response.body;
    });
  }

  async listTaxRates() {
    return executeWithRateLimit('listTaxRates', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getTaxRates(tenantId);
      return response.body.taxRates || [];
    });
  }

  async listItems() {
    return executeWithRateLimit('listItems', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getItems(tenantId);
      return response.body.items || [];
    });
  }

  async createItem(item: Item) {
    return executeWithRateLimit('createItem', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.createItems(tenantId, { items: [item] });
      return response.body.items?.[0] || response.body;
    });
  }

  async updateItem(itemId: string, item: Item) {
    return executeWithRateLimit('updateItem', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.updateItem(tenantId, itemId, { items: [item] });
      return response.body.items?.[0] || response.body;
    });
  }

  async listBankTransactions(params?: { where?: string; page?: number }) {
    return executeWithRateLimit('listBankTransactions', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getBankTransactions(tenantId, undefined, params?.where, undefined, params?.page);
      return response.body.bankTransactions || [];
    });
  }

  async createBankTransaction(bankTransaction: BankTransaction) {
    return executeWithRateLimit('createBankTransaction', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.createBankTransactions(tenantId, { bankTransactions: [bankTransaction] });
      return response.body.bankTransactions?.[0] || response.body;
    });
  }

  async updateBankTransaction(bankTransactionId: string, bankTransaction: BankTransaction) {
    return executeWithRateLimit('updateBankTransaction', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.updateBankTransaction(tenantId, bankTransactionId, { bankTransactions: [bankTransaction] });
      return response.body.bankTransactions?.[0] || response.body;
    });
  }

  async listQuotes(params?: { where?: string; page?: number }) {
    return executeWithRateLimit('listQuotes', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getQuotes(tenantId, undefined, params?.where, undefined, params?.page as any);
      return response.body.quotes || [];
    });
  }

  async createQuote(quote: Quote) {
    return executeWithRateLimit('createQuote', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.createQuotes(tenantId, { quotes: [quote] });
      return response.body.quotes?.[0] || response.body;
    });
  }

  async listTrackingCategories() {
    return executeWithRateLimit('listTrackingCategories', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getTrackingCategories(tenantId);
      return response.body.trackingCategories || [];
    });
  }

  // --- Contacts API Methods ---

  async listContacts(params?: { where?: string; page?: number; summaryOnly?: boolean }) {
    return executeWithRateLimit('listContacts', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getContacts(
        tenantId,
        undefined, // ifModifiedSince
        params?.where,
        undefined, // order
        undefined, // ids
        params?.page,
        undefined, // includeArchived
        params?.summaryOnly ?? true
      );
      return response.body.contacts || [];
    });
  }

  async getContact(contactId: string) {
    return executeWithRateLimit('getContact', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getContact(tenantId, contactId);
      return response.body.contacts?.[0] || response.body;
    });
  }

  async createContact(contact: Contact) {
    return executeWithRateLimit('createContact', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.createContacts(tenantId, { contacts: [contact] });
      return response.body.contacts?.[0] || response.body;
    });
  }

  async updateContact(contactId: string, contact: Contact) {
    return executeWithRateLimit('updateContact', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.updateContact(tenantId, contactId, { contacts: [contact] });
      return response.body.contacts?.[0] || response.body;
    });
  }

  async listContactGroups() {
    return executeWithRateLimit('listContactGroups', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getContactGroups(tenantId);
      return response.body.contactGroups || [];
    });
  }

  async getReportAgedReceivablesByContact(contactId?: string, date?: string) {
    return executeWithRateLimit('getReportAgedReceivablesByContact', async () => {
      const { client, tenantId } = await this.getClient();
      if (!contactId) {
        throw new Error('contactId is required to generate Aged Receivables report by contact.');
      }
      const response = await client.accountingApi.getReportAgedReceivablesByContact(tenantId, contactId, date);
      return response.body;
    });
  }

  async getReportAgedPayablesByContact(contactId?: string, date?: string) {
    return executeWithRateLimit('getReportAgedPayablesByContact', async () => {
      const { client, tenantId } = await this.getClient();
      if (!contactId) {
        throw new Error('contactId is required to generate Aged Payables report by contact.');
      }
      const response = await client.accountingApi.getReportAgedPayablesByContact(tenantId, contactId, date);
      return response.body;
    });
  }

  // --- Reports API Methods ---

  async listProfitAndLoss(params?: {
    fromDate?: string;
    toDate?: string;
    periods?: number;
    timeframe?: 'MONTH' | 'QUARTER' | 'YEAR';
    paymentsOnly?: boolean;
  }) {
    return executeWithRateLimit('listProfitAndLoss', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getReportProfitAndLoss(
        tenantId,
        params?.fromDate,
        params?.toDate,
        params?.periods,
        params?.timeframe,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        params?.paymentsOnly
      );
      return response.body;
    });
  }

  async listBalanceSheet(date?: string, paymentsOnly?: boolean) {
    return executeWithRateLimit('listBalanceSheet', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getReportBalanceSheet(tenantId, date, undefined, undefined, undefined, undefined, undefined, paymentsOnly);
      return response.body;
    });
  }

  async listTrialBalance(date?: string, paymentsOnly?: boolean) {
    return executeWithRateLimit('listTrialBalance', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getReportTrialBalance(tenantId, date, paymentsOnly);
      return response.body;
    });
  }

  async listOrganisationDetails() {
    return executeWithRateLimit('listOrganisationDetails', async () => {
      const { client, tenantId } = await this.getClient();
      const response = await client.accountingApi.getOrganisations(tenantId);
      return response.body.organisations || [];
    });
  }
}

export const xeroService = new XeroService();
