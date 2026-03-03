/**
 * TokenUsageContext
 *
 * Single source of truth for all token-usage data:
 *   - usageStatus  (status + warning level) — fetched on mount, updated via SSE
 *   - monthlyData  (12-month history)        — fetched once after status resolves
 *   - providerData (per-provider breakdown)  — fetched once after status resolves
 *
 * Storing everything here means the data survives React 18 StrictMode's
 * unmount→remount cycle of child components, so the dashboard never
 * double-fetches just because it re-mounted.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { tokenUsageService } from '../services/tokenUsageService';
import type {
  UsageStatus,
  MonthlyBreakdown,
  ProviderBreakdown,
  NodeMetricsResponse,
} from '../services/tokenUsageService';
import { getApiUrl } from '../config/api';

interface TokenUsageContextValue {
  usageStatus: UsageStatus | null;
  monthlyData: MonthlyBreakdown | null;
  providerData: ProviderBreakdown | null;
  nodeMetrics: NodeMetricsResponse | null;
  /** True only during the very first /status fetch. */
  loading: boolean;
  /** True while monthly + provider data is loading. */
  dashboardLoading: boolean;
  error: string | null;
  dashboardError: string | null;
  /** Re-fetch everything (status + dashboard data). Used by the Refresh button. */
  refresh: () => Promise<void>;
}

const TokenUsageContext = createContext<TokenUsageContextValue>({
  usageStatus: null,
  monthlyData: null,
  providerData: null,
  nodeMetrics: null,
  loading: true,
  dashboardLoading: false,
  error: null,
  dashboardError: null,
  refresh: async () => {},
});

export const TokenUsageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyBreakdown | null>(null);
  const [providerData, setProviderData] = useState<ProviderBreakdown | null>(
    null,
  );
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetricsResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async (tokensLimit: number) => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const [breakdown, providerBreakdown, nodeMetricsData] = await Promise.all(
        [
          tokenUsageService.getMonthlyBreakdown(tokensLimit),
          tokenUsageService.getProviderBreakdown(),
          tokenUsageService.getNodeMetrics(),
        ],
      );
      setMonthlyData(breakdown);
      setProviderData(providerBreakdown);
      setNodeMetrics(nodeMetricsData);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } };
      setDashboardError(
        e.response?.status === 403
          ? 'Access denied.'
          : 'Failed to load usage data.',
      );
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async (): Promise<UsageStatus | null> => {
    try {
      const status = await tokenUsageService.getUsageStatus();
      setUsageStatus(status);
      setError(null);
      return status;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } };
      setError(
        e.response?.status === 403 ? 'Access denied' : 'Failed to load usage',
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const status = await fetchStatus();
    if (status) await fetchDashboardData(status.tokens_limit);
  }, [fetchStatus, fetchDashboardData]);

  useEffect(() => {
    const token = localStorage.getItem('mediquery_token');
    if (!token) {
      setLoading(false);
      setError('Not authenticated');
      return;
    }

    let cancelled = false;

    const run = async () => {
      // 1. Fetch status.
      let status: UsageStatus | null = null;
      try {
        status = await tokenUsageService.getUsageStatus();
        if (!cancelled) {
          setUsageStatus(status);
          setError(null);
        }
      } catch (err: unknown) {
        const e = err as { response?: { status?: number } };
        if (!cancelled)
          setError(
            e.response?.status === 403
              ? 'Access denied'
              : 'Failed to load usage',
          );
      } finally {
        if (!cancelled) setLoading(false);
      }

      // 2. Immediately fetch dashboard data using the resolved limit.
      if (status && !cancelled) {
        void fetchDashboardData(status.tokens_limit);
      }

      // 3. SSE subscription for live status pushes.
      try {
        const response = await fetch(getApiUrl('/token-usage/events'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.body || cancelled) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const rawData = JSON.parse(line.slice(5).trim());
                const data: UsageStatus = {
                  tokens_used: rawData.tokens_used,
                  tokens_limit: rawData.tokens_limit,
                  percentage: rawData.usage_percentage ?? rawData.percentage,
                  warning_level: rawData.warning_level,
                  message: tokenUsageService.getWarningMessage(
                    rawData.warning_level,
                    rawData.usage_percentage ?? rawData.percentage,
                  ),
                  reset_date:
                    rawData.reset_date ||
                    tokenUsageService.getNextMonthFirstDay(),
                };
                if (!cancelled) setUsageStatus(data);
              } catch {
                /* skip malformed frames */
              }
            }
          }
        }
      } catch {
        /* SSE closed – silently ignore */
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [fetchDashboardData]);

  return (
    <TokenUsageContext.Provider
      value={{
        usageStatus,
        monthlyData,
        providerData,
        nodeMetrics,
        loading,
        dashboardLoading,
        error,
        dashboardError,
        refresh,
      }}
    >
      {children}
    </TokenUsageContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTokenUsage = (): TokenUsageContextValue =>
  useContext(TokenUsageContext);
