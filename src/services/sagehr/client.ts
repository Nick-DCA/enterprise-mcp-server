import { getSageHrConfig, SageHrConfig } from './config.js';
import {
  SageHrApiError,
  SageHrPermissionError,
  SageHrWriteDisabledError,
  SageHrNotFoundError,
} from './errors.js';
import { AttributePrivacyEngine } from './privacy.js';
import { logger } from '../../utils/logger.js';
import { RequestContext } from '../../server/context.js';

export class SageHrService {
  /**
   * Loads verified credentials and base URL for Sage HR API.
   */
  private async getClientConfig(): Promise<{ baseURL: string; apiKey: string; config: SageHrConfig }> {
    const config = await getSageHrConfig();

    if (!config.apiKey) {
      throw new SageHrPermissionError(
        'SAGE_HR_API_KEY is not configured. Please set the secret in GCP Secret Manager or .env'
      );
    }
    if (!config.subdomain) {
      throw new SageHrPermissionError(
        'SAGE_HR_SUBDOMAIN is not configured. Please set company subdomain in Secret Manager or .env'
      );
    }

    const baseURL = `https://${config.subdomain}.sage.hr/api/v1`;
    return { baseURL, apiKey: config.apiKey, config };
  }

  /**
   * Generic request helper using native fetch with error handling and response formatting.
   */
  private async executeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<T> {
    const { baseURL, apiKey } = await this.getClientConfig();

    let url = `${baseURL}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const callStartTime = Date.now();
    try {
      logger.debug({ method, endpoint, params }, 'Calling Sage HR REST API');

      const response = await fetch(url, {
        method,
        headers: {
          'X-Auth-Token': apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Enterprise-MCP-SageHR-Gateway/2.0',
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      const durationMs = Date.now() - callStartTime;

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = { message: responseText };
      }

      RequestContext.recordSpan({
        spanId: `span_sagehr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        serviceId: 'sagehr',
        endpoint: `${method} ${endpoint}`,
        httpMethod: method,
        httpStatus: response.status,
        durationMs,
        quotaInfo: `Status: ${response.status}`,
        timestamp: new Date().toISOString(),
      });

      if (!response.ok) {
        const status = response.status;
        const errorMsg = responseData?.message || responseData?.error || response.statusText;

        if (status === 401 || status === 403) {
          throw new SageHrPermissionError(errorMsg);
        }
        if (status === 404) {
          throw new SageHrNotFoundError(errorMsg);
        }
        throw new SageHrApiError(errorMsg, status, undefined);
      }

      return responseData as T;
    } catch (error: any) {
      if (error instanceof SageHrApiError) {
        throw error;
      }
      throw new SageHrApiError(error.message || String(error));
    }
  }

  // ==========================================
  // Directory & Employee Methods
  // ==========================================

  public async listEmployees(params?: {
    active?: boolean;
    departmentId?: number;
    teamId?: number;
    page?: number;
  }): Promise<{ employees: any[]; totalCount: number }> {
    const { config } = await this.getClientConfig();
    const queryParams: Record<string, any> = {};
    if (params?.active !== undefined) queryParams.active = params.active;
    if (params?.departmentId) queryParams.department_id = params.departmentId;
    if (params?.teamId) queryParams.team_id = params.teamId;
    if (params?.page) queryParams.page = params.page;

    const rawData = await this.executeRequest<{ data?: any[] } | any[]>(
      'GET',
      '/employee/employees',
      undefined,
      queryParams
    );

    const employeeList = Array.isArray(rawData) ? rawData : rawData?.data || [];

    // Filter by allowed teams and non-blocked positions
    const filteredEmployees = employeeList.filter((emp: any) => {
      const teamName = emp.team?.name || emp.department?.name || emp.department;
      const positionName = emp.position || emp.job_title || emp.title;
      return (
        AttributePrivacyEngine.isTeamAllowed(teamName, config.allowedTeams) &&
        AttributePrivacyEngine.isPositionAllowed(positionName, config.blockedPositions)
      );
    });

    const paginated = filteredEmployees.slice(0, config.maxResults);
    const sanitized = AttributePrivacyEngine.sanitize(paginated, config);

    return {
      employees: sanitized,
      totalCount: filteredEmployees.length,
    };
  }

  public async getEmployee(employeeId: string | number): Promise<any> {
    const { config } = await this.getClientConfig();
    const rawData = await this.executeRequest<any>('GET', `/employee/employees/${employeeId}`);
    const employee = rawData?.data || rawData;

    const teamName = employee.team?.name || employee.department?.name || employee.department;
    const positionName = employee.position || employee.job_title || employee.title;

    if (!AttributePrivacyEngine.isTeamAllowed(teamName, config.allowedTeams)) {
      throw new SageHrPermissionError(`Access to employee profile in team '${teamName}' is not permitted by policy.`);
    }

    if (!AttributePrivacyEngine.isPositionAllowed(positionName, config.blockedPositions)) {
      throw new SageHrPermissionError(`Access to employee profile with position '${positionName}' is restricted by policy.`);
    }

    return AttributePrivacyEngine.sanitize(employee, config);
  }

  // ==========================================
  // Time Off & Leave Management Methods
  // ==========================================

  public async listOutOfOfficeToday(): Promise<{ outOfOffice: any[] }> {
    const { config } = await this.getClientConfig();
    const rawData = await this.executeRequest<any>('GET', '/leave-management/out-of-office-today');
    const list = Array.isArray(rawData) ? rawData : rawData?.data || [];
    const sanitized = AttributePrivacyEngine.sanitize(list, config);
    return { outOfOffice: sanitized };
  }

  public async listTimeOffRequests(params?: {
    fromDate?: string;
    toDate?: string;
    status?: string;
    employeeId?: string | number;
  }): Promise<{ requests: any[] }> {
    const { config } = await this.getClientConfig();
    const queryParams: Record<string, any> = {};
    if (params?.fromDate) queryParams.from = params.fromDate;
    if (params?.toDate) queryParams.to = params.toDate;
    if (params?.status) queryParams.status = params.status;
    if (params?.employeeId) queryParams.employee_id = params.employeeId;

    const rawData = await this.executeRequest<any>(
      'GET',
      '/leave-management/time-off-requests',
      undefined,
      queryParams
    );
    const list = Array.isArray(rawData) ? rawData : rawData?.data || [];
    const sanitized = AttributePrivacyEngine.sanitize(list.slice(0, config.maxResults), config);
    return { requests: sanitized };
  }

  public async getTimeOffBalances(employeeId?: string | number): Promise<{ balances: any[] }> {
    const { config } = await this.getClientConfig();
    const queryParams: Record<string, any> = {};
    if (employeeId) queryParams.employee_id = employeeId;

    const rawData = await this.executeRequest<any>(
      'GET',
      '/leave-management/employee-time-off-balances',
      undefined,
      queryParams
    );
    const list = Array.isArray(rawData) ? rawData : rawData?.data || [];
    const sanitized = AttributePrivacyEngine.sanitize(list, config);
    return { balances: sanitized };
  }

  public async listTimeOffPolicies(): Promise<{ policies: any[] }> {
    const { config } = await this.getClientConfig();
    const rawData = await this.executeRequest<any>('GET', '/leave-management/policies');
    const list = Array.isArray(rawData) ? rawData : rawData?.data || [];
    const sanitized = AttributePrivacyEngine.sanitize(list, config);
    return { policies: sanitized };
  }

  public async createTimeOffRequest(data: {
    employeeId: string | number;
    policyId: string | number;
    fromDate: string;
    toDate: string;
    details?: string;
  }): Promise<any> {
    const { config } = await this.getClientConfig();
    if (!config.allowWrites) {
      throw new SageHrWriteDisabledError('Creating time off requests is disabled by policy (SAGE_HR_ALLOW_WRITES=false).');
    }

    const payload = {
      employee_id: data.employeeId,
      time_off_policy_id: data.policyId,
      from: data.fromDate,
      to: data.toDate,
      details: data.details,
    };

    const rawData = await this.executeRequest<any>('POST', '/leave-management/time-off-requests', payload);
    return AttributePrivacyEngine.sanitize(rawData, config);
  }

  public async cancelTimeOffRequest(requestId: string | number): Promise<{ success: boolean; message: string }> {
    const { config } = await this.getClientConfig();
    if (!config.allowWrites) {
      throw new SageHrWriteDisabledError('Cancelling time off requests is disabled by policy (SAGE_HR_ALLOW_WRITES=false).');
    }

    await this.executeRequest<any>('DELETE', `/leave-management/time-off-requests/${requestId}`);
    return {
      success: true,
      message: `Time off request ID ${requestId} successfully cancelled/deleted in Sage HR.`,
    };
  }

  // ==========================================
  // Expense Management Methods
  // ==========================================

  public async listExpenses(params?: {
    status?: string;
    fromDate?: string;
    toDate?: string;
    employeeId?: string | number;
  }): Promise<{ expenses: any[] }> {
    const { config } = await this.getClientConfig();
    const queryParams: Record<string, any> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.fromDate) queryParams.from = params.fromDate;
    if (params?.toDate) queryParams.to = params.toDate;
    if (params?.employeeId) queryParams.employee_id = params.employeeId;

    const rawData = await this.executeRequest<any>('GET', '/expenses/expenses', undefined, queryParams);
    const list = Array.isArray(rawData) ? rawData : rawData?.data || [];
    const sanitized = AttributePrivacyEngine.sanitize(list.slice(0, config.maxResults), config);
    return { expenses: sanitized };
  }

  public async getExpense(expenseId: string | number): Promise<any> {
    const { config } = await this.getClientConfig();
    const rawData = await this.executeRequest<any>('GET', `/expenses/expenses/${expenseId}`);
    const expense = rawData?.data || rawData;
    return AttributePrivacyEngine.sanitize(expense, config);
  }

  public async listExpenseCategories(): Promise<{ categories: any[] }> {
    const { config } = await this.getClientConfig();
    const rawData = await this.executeRequest<any>('GET', '/expenses/categories');
    const list = Array.isArray(rawData) ? rawData : rawData?.data || [];
    const sanitized = AttributePrivacyEngine.sanitize(list, config);
    return { categories: sanitized };
  }

  public async createExpense(data: {
    employeeId: string | number;
    categoryId: string | number;
    amount: number;
    currency: string;
    date: string;
    title: string;
    description?: string;
  }): Promise<any> {
    const { config } = await this.getClientConfig();
    if (!config.allowWrites) {
      throw new SageHrWriteDisabledError('Creating expense claims is disabled by policy (SAGE_HR_ALLOW_WRITES=false).');
    }

    const payload = {
      employee_id: data.employeeId,
      expense_category_id: data.categoryId,
      amount: data.amount,
      currency: data.currency,
      date: data.date,
      title: data.title,
      description: data.description,
    };

    const rawData = await this.executeRequest<any>('POST', '/expenses/expenses', payload);
    return AttributePrivacyEngine.sanitize(rawData, config);
  }
}

export const sageHrService = new SageHrService();
