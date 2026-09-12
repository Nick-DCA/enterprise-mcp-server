import { AsyncLocalStorage } from 'node:async_hooks';
import { isValidUserEmail } from '../utils/identity.js';

export interface RequestContextData {
  userEmail?: string;
  authUserId?: string;
  token?: string;
  clientId?: string;
  isHumanUser?: boolean;
  scopes?: string[];
  [key: string]: any;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  /**
   * Runs the provided function within the given request context.
   */
  run<R>(context: RequestContextData, fn: () => R): R {
    // Normalize and compute isHumanUser
    const safeUserEmail = isValidUserEmail(context.userEmail) ? context.userEmail.trim().toLowerCase() : undefined;
    const enrichedContext: RequestContextData = {
      ...context,
      userEmail: safeUserEmail,
      isHumanUser: Boolean(safeUserEmail),
    };
    return asyncLocalStorage.run(enrichedContext, fn);
  },

  /**
   * Retrieves the current request context store, if present.
   */
  get(): RequestContextData | undefined {
    return asyncLocalStorage.getStore();
  },

  /**
   * Retrieves the validated authenticated human user email from context.
   * Returns undefined if caller is a machine identity or unauthenticated.
   */
  getUserEmail(): string | undefined {
    const store = asyncLocalStorage.getStore();
    const email = store?.userEmail;
    return email && isValidUserEmail(email) ? email : undefined;
  },

  /**
   * Retrieves the machine client ID (e.g. 'gemini-enterprise-mcp') from context.
   */
  getClientId(): string | undefined {
    const store = asyncLocalStorage.getStore();
    return store?.clientId || store?.authUserId;
  },

  /**
   * Indicates whether the current request is executed on behalf of a validated human user.
   */
  isHumanUser(): boolean {
    const store = asyncLocalStorage.getStore();
    const email = store?.userEmail;
    return Boolean(email && isValidUserEmail(email));
  },

  /**
   * Asserts that a validated human user email is present in the context, or throws an error.
   */
  requireUserEmail(): string {
    const email = RequestContext.getUserEmail();
    if (!email) {
      throw new Error('Authenticated corporate user email context is required for this operation.');
    }
    return email;
  },
};

