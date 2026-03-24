import axios from 'axios';
import { getApiUrl } from '../config/api';

// Type definitions for API responses
export interface TokenUsage {
  user_id: string;
  period: string;
  tokens_used: number;
  tokens_limit: number;
  reset_date: string;
}

export interface MonthlyUsage {
  period: string;
  tokens_used: number;
  tokens_limit: number;
  percentage: number;
}

export interface MonthlyBreakdown {
  current: MonthlyUsage;
  history: MonthlyUsage[];
}

export interface UsageStatus {
  tokens_used: number;
  tokens_limit: number;
  percentage: number;
  warning_level: 'normal' | 'medium' | 'high' | 'critical';
  message: string;
  reset_date: string;
}

export interface AdminUser {
  user_id: string;
  username: string;
  tokens_used: number;
  tokens_limit: number;
  percentage: number;
  warning_level: 'normal' | 'medium' | 'high' | 'critical';
}

export interface AdminUsersResponse {
  users: AdminUser[];
  total_users: number;
}

export interface QuotaUpdate {
  tokens_limit: number;
}

export interface ProviderUsage {
  month: string;
  provider: string;
  total_tokens: number;
  total_cost_usd: number;
  request_count: number;
}

export interface ProviderBreakdown {
  usage: ProviderUsage[];
}

export interface NodeMetric {
  node: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  call_count: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  avg_selected_table_count: number;
  avg_overlap_ratio: number;
}

export interface NodeMetricsResponse {
  user_id: string;
  window: {
    start_month: string;
    end_month: string;
  };
  summary: {
    request_count: number;
    avg_attempts_per_request: number;
    first_pass_validity_rate: number;
  };
  node_metrics: NodeMetric[];
}

// Internal raw API response shapes
interface MonthlyUsageApiItem {
  month: string;
  total_tokens: number;
}
interface ProviderUsageApiItem {
  month: string;
  provider: string;
  total_tokens: number;
  total_cost_usd: number;
  request_count: number;
}
interface AdminUserApiItem {
  user_id: string;
  username: string;
  tokens_used: number;
  tokens_limit: number;
  usage_percentage: number;
  warning_level: 'normal' | 'medium' | 'high' | 'critical';
}

// API Service Functions
export const tokenUsageService = {
  /**
   * Get current month token usage for authenticated user
   */
  async getCurrentUsage(): Promise<TokenUsage> {
    const response = await axios.get(getApiUrl('/token-usage'));
    return response.data;
  },

  /**
   * Get monthly breakdown with history (last 12 months).
   * @param tokensLimit  The user's token limit (obtained from getUsageStatus)
   *                     — passed in to avoid a redundant /status call.
   */
  async getMonthlyBreakdown(tokensLimit: number): Promise<MonthlyBreakdown> {
    // Calculate date range for last 12 months
    const now = new Date();
    const endMonth = now.toISOString().slice(0, 7); // Current month YYYY-MM

    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1); // 12 months ago
    const startMonth = startDate.toISOString().slice(0, 7);

    const response = await axios.get(getApiUrl('/token-usage/monthly'), {
      params: { start_month: startMonth, end_month: endMonth },
    });
    const data = response.data;

    // Backend returns { user_id, usage: [] }, transform to { current, history }
    const usageArray = data.usage || [];

    // Use the provided limit directly — caller already has it from getUsageStatus.
    const limit = tokensLimit;

    // Transform usage array to MonthlyUsage format with percentage
    const transformed = usageArray.map((item: MonthlyUsageApiItem) => ({
      period: item.month,
      tokens_used: item.total_tokens,
      tokens_limit: limit,
      percentage: limit > 0 ? (item.total_tokens / limit) * 100 : 0,
    }));

    return {
      current: transformed[0] || {
        period: new Date().toISOString().slice(0, 7),
        tokens_used: 0,
        tokens_limit: limit,
        percentage: 0,
      },
      history: transformed, // Show all months including current
    };
  },

  /**
   * Get per-provider breakdown (last 12 months)
   */
  async getProviderBreakdown(): Promise<ProviderBreakdown> {
    // Calculate date range for last 12 months
    const now = new Date();
    const endMonth = now.toISOString().slice(0, 7); // Current month YYYY-MM

    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1); // 12 months ago
    const startMonth = startDate.toISOString().slice(0, 7);

    const response = await axios.get(getApiUrl('/token-usage/monthly/breakdown'), {
      params: { start_month: startMonth, end_month: endMonth },
    });
    const data = response.data;

    // Backend returns { user_id, usage: [{ month, provider, total_tokens, ... }] }
    const usageArray = data.usage || [];

    // Transform to frontend format
    const transformed = usageArray.map((item: ProviderUsageApiItem) => ({
      month: item.month,
      provider: item.provider,
      total_tokens: item.total_tokens,
      total_cost_usd: item.total_cost_usd,
      request_count: item.request_count,
    }));

    return {
      usage: transformed,
    };
  },

  /**
   * Get per-node telemetry metrics (tokens/latency/retrieval overlap)
   */
  async getNodeMetrics(): Promise<NodeMetricsResponse> {
    const now = new Date();
    const endMonth = now.toISOString().slice(0, 7);
    const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const startMonth = startDate.toISOString().slice(0, 7);

    const response = await axios.get(getApiUrl('/token-usage/metrics/nodes'), {
      params: { start_month: startMonth, end_month: endMonth },
    });

    return response.data as NodeMetricsResponse;
  },

  /**
   * Get usage status with warning level
   */
  async getUsageStatus(): Promise<UsageStatus> {
    const response = await axios.get(getApiUrl('/token-usage/status'));
    const data = response.data;
    // Map API response to frontend interface
    return {
      tokens_used: data.tokens_used,
      tokens_limit: data.tokens_limit,
      percentage: data.usage_percentage, // Backend returns usage_percentage
      warning_level: data.warning_level,
      message: this.getWarningMessage(data.warning_level, data.usage_percentage),
      reset_date: data.reset_date || this.getNextMonthFirstDay(),
    };
  },

  /**
   * Admin: Get all users with their usage
   */
  async getAdminUsers(signal?: AbortSignal): Promise<AdminUsersResponse> {
    const response = await axios.get(getApiUrl('/token-usage/admin/users'), {
      signal,
    });
    const usersArray = response.data; // Backend returns array directly

    // Transform backend response to match frontend interface
    const transformedUsers = usersArray.map((user: AdminUserApiItem) => ({
      user_id: user.user_id,
      username: user.username,
      tokens_used: user.tokens_used,
      tokens_limit: user.tokens_limit,
      percentage: user.usage_percentage, // Map usage_percentage to percentage
      warning_level: user.warning_level,
    }));

    return {
      users: transformedUsers,
      total_users: transformedUsers.length,
    };
  },

  /**
   * Admin: Update user quota
   */
  async updateUserQuota(userId: string, quotaUpdate: QuotaUpdate): Promise<TokenUsage> {
    const response = await axios.put(
      getApiUrl(`/token-usage/admin/users/${userId}/quota`),
      quotaUpdate,
    );
    return response.data;
  },

  // Helper functions
  getWarningMessage(level: string, percentage: number): string {
    switch (level) {
      case 'critical':
        return `Critical: You've used ${percentage.toFixed(1)}% of your quota. Upgrade or contact support.`;
      case 'high':
        return `Warning: You've used ${percentage.toFixed(1)}% of your quota. Consider upgrading soon.`;
      case 'medium':
        return `Notice: You've used ${percentage.toFixed(1)}% of your quota.`;
      default:
        return `You're using ${percentage.toFixed(1)}% of your monthly quota.`;
    }
  },

  getNextMonthFirstDay(): string {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toISOString().split('T')[0];
  },
};

// Helper function to get color based on warning level
export const getWarningColor = (level: string): string => {
  switch (level) {
    case 'critical':
      return 'red';
    case 'high':
      return 'orange';
    case 'medium':
      return 'yellow';
    default:
      return 'green';
  }
};

// Helper function to format numbers with commas
export const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

// Helper function to format date
export const formatDate = (dateString?: string): string => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};
