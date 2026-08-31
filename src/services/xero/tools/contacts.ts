import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { xeroService } from '../client.js';
import { cleanObject } from '../../../utils/clean.js';
import { Contact, Phone } from 'xero-node';

export const contactsTools: ToolDefinition[] = [
  // 1. xero-list-contacts
  {
    name: 'xero-list-contacts',
    description:
      'Retrieve customer and supplier contacts from Xero. Supports search queries, where filtering (e.g. \'IsCustomer==true\'), and pagination.',
    schema: {
      where: z.string().optional().describe('Filter expression (e.g. IsCustomer==true or Name.Contains("Acme"))'),
      page: z.coerce.number().optional().describe('Page number (100 records per page)'),
      summaryOnly: z.coerce.boolean().optional().default(true).describe('Return summary mode to reduce response payload'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listContacts(params);
    },
  },

  // 2. xero-get-contact
  {
    name: 'xero-get-contact',
    description:
      'Retrieve detailed profile information for a specific customer or vendor in Xero by Contact ID, including billing addresses, phone numbers, and tax numbers.',
    schema: {
      contactId: z.string().describe('The unique Xero Contact ID'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.getContact(params.contactId);
    },
  },

  // 3. xero-create-contact
  {
    name: 'xero-create-contact',
    description:
      'Create a new customer or vendor contact in Xero with company/individual name, email address, phone numbers, addresses, and customer/supplier flags.',
    schema: {
      name: z.string().describe('Full name or company name of the contact'),
      emailAddress: z.string().optional().describe('Primary email address'),
      firstName: z.string().optional().describe('First name'),
      lastName: z.string().optional().describe('Last name'),
      phones: z
        .array(
          z.object({
            phoneType: z.enum(['DEFAULT', 'DDI', 'MOBILE', 'FAX']).optional().default('DEFAULT'),
            phoneNumber: z.string(),
          })
        )
        .optional()
        .describe('Phone numbers'),
      isCustomer: z.coerce.boolean().optional().default(true).describe('Is contact a customer'),
      isSupplier: z.coerce.boolean().optional().default(false).describe('Is contact a supplier'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const contactData: Contact = cleanObject({
        name: params.name,
        emailAddress: params.emailAddress,
        firstName: params.firstName,
        lastName: params.lastName,
        phones: params.phones?.map((p: any) => ({
          phoneType: p.phoneType as Phone['phoneType'],
          phoneNumber: p.phoneNumber,
        })),
        isCustomer: params.isCustomer,
        isSupplier: params.isSupplier,
      });
      return xeroService.createContact(contactData);
    },
  },

  // 4. xero-update-contact
  {
    name: 'xero-update-contact',
    description:
      'Update profile details, contact name, email, phones, or bank account details for an existing contact in Xero by Contact ID.',
    schema: {
      contactId: z.string().describe('The unique Xero Contact ID'),
      name: z.string().optional().describe('Updated name'),
      emailAddress: z.string().optional().describe('Updated email address'),
      firstName: z.string().optional().describe('Updated first name'),
      lastName: z.string().optional().describe('Updated last name'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
    execute: async (params) => {
      const contactData: Contact = cleanObject({
        contactID: params.contactId,
        name: params.name,
        emailAddress: params.emailAddress,
        firstName: params.firstName,
        lastName: params.lastName,
      });
      return xeroService.updateContact(params.contactId, contactData);
    },
  },

  // 5. xero-list-contact-groups
  {
    name: 'xero-list-contact-groups',
    description:
      'Retrieve contact groups and member lists in Xero for categorized customer or supplier segments.',
    schema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async () => {
      return xeroService.listContactGroups();
    },
  },

  // 6. xero-get-aged-receivables-by-contact
  {
    name: 'xero-get-aged-receivables-by-contact',
    description:
      'Generate an Aged Receivables (unpaid customer debt) report breakdown (Current, 30, 60, 90+ days overdue) for a specific customer contact in Xero.',
    schema: {
      contactId: z.string().describe('The unique Xero Contact ID'),
      date: z.string().optional().describe('Report date (YYYY-MM-DD)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.getReportAgedReceivablesByContact(params.contactId, params.date);
    },
  },

  // 7. xero-get-aged-payables-by-contact
  {
    name: 'xero-get-aged-payables-by-contact',
    description:
      'Generate an Aged Payables (outstanding supplier bills) report breakdown (Current, 30, 60, 90+ days overdue) for a specific supplier contact in Xero.',
    schema: {
      contactId: z.string().describe('The unique Xero Contact ID'),
      date: z.string().optional().describe('Report date (YYYY-MM-DD)'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.getReportAgedPayablesByContact(params.contactId, params.date);
    },
  },
];
