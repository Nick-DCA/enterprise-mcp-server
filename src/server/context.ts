import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  userEmail?: string;
  authUserId?: string;
  token?: string;
  clientId?: string;
  scopes?: string[];
  [key: string]: any;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  /**
   * Runs the provided function within the given request context.
   */
  run<R>(context: RequestContextData, fn: () => R): R {
    return asyncLocalStorage.run(context, fn);
  },

  /**
   * Retrieves the current request context store, if present.
   */
  get(): RequestContextData | undefined {
    return asyncLocalStorage.getStore();
  },

  /**
   * Retrieves the authenticated user email from context.
   */
  getUserEmail(): string | undefined {
    const store = asyncLocalStorage.getStore();
    return store?.userEmail;
  },

  /**
   * Asserts that a user email is present in the context, or throws an error.
   */
  requireUserEmail(): string {
    const email = RequestContext.getUserEmail();
    if (!email) {
      throw new Error('Authenticated user email context is required for this operation.');
    }
    return email;
  },
};
