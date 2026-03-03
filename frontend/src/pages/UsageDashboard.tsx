import React, { useState, useCallback } from 'react';
import {
  FiRefreshCw,
  FiAlertCircle,
  FiTrendingUp,
  FiCalendar,
  FiInfo,
} from 'react-icons/fi';
import { formatNumber, formatDate } from '../services/tokenUsageService';
import { useTokenUsage } from '../contexts/TokenUsageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

const UsageDashboard: React.FC = () => {
  // All data lives in the shared context — no own fetching, no double-calls.
  const {
    usageStatus,
    monthlyData,
    providerData,
    nodeMetrics,
    loading,
    dashboardLoading,
    error,
    dashboardError,
    refresh,
  } = useTokenUsage();
  const [showProviderBreakdown, setShowProviderBreakdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const getProviderColor = (provider: string): string => {
    const colors: Record<string, string> = {
      bedrock: 'bg-blue-500',
      openai: 'bg-green-500',
      gemini: 'bg-purple-500',
      anthropic: 'bg-orange-500',
      local: 'bg-gray-500',
    };
    return colors[provider.toLowerCase()] || 'bg-gray-400';
  };

  const getWarningColor = useCallback((level: string): string => {
    switch (level) {
      case 'critical':
        return 'text-red-500 border-red-500 bg-red-500/10';
      case 'high':
        return 'text-orange-500 border-orange-500 bg-orange-500/10';
      case 'medium':
        return 'text-yellow-500 border-yellow-500 bg-yellow-500/10';
      case 'normal':
      default:
        return 'text-green-500 border-green-500 bg-green-500/10';
    }
  }, []);

  const getProgressColor = (level: string): string => {
    switch (level) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'normal':
      default:
        return 'bg-green-500';
    }
  };

  if (loading || dashboardLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-(--accent-primary) border-t-transparent"></div>
        <p className="mt-4 text-(--text-secondary)">Loading usage data...</p>
      </div>
    );
  }

  const displayError = error || dashboardError;
  if (displayError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <FiAlertCircle size={48} className="mb-4 text-red-500" />
        <p className="mb-2 text-lg font-semibold text-red-500">
          Error Loading Data
        </p>
        <p className="mb-4 text-(--text-secondary)">{displayError}</p>
        <button
          onClick={() => void refresh()}
          className="rounded-lg bg-(--accent-primary) px-4 py-2 text-white transition-colors hover:bg-(--accent-hover)"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!usageStatus || !monthlyData) {
    return null;
  }

  const warningColorClass = getWarningColor(usageStatus.warning_level);
  const progressColor = getProgressColor(usageStatus.warning_level);

  return (
    <div className="h-full overflow-auto bg-(--bg-primary) p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-(--text-primary)">
              Token Usage Dashboard
            </h1>
            <p className="mt-1 text-sm text-(--text-secondary)">
              Monitor your API token consumption
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="flex items-center gap-2"
          >
            <FiRefreshCw
              size={16}
              className={refreshing ? 'animate-spin' : ''}
            />
            <span className="text-sm">Refresh</span>
          </Button>
        </div>

        {/* Warning Banner */}
        {usageStatus.warning_level !== 'normal' && (
          <div className={`rounded-lg border p-4 ${warningColorClass}`}>
            <div className="flex items-start gap-3">
              <FiAlertCircle size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">{usageStatus.message}</p>
                <p className="mt-1 text-sm opacity-90">
                  You&apos;ve used{' '}
                  {typeof usageStatus.percentage === 'number'
                    ? usageStatus.percentage.toFixed(1)
                    : '0.0'}
                  % of your monthly quota. Consider optimizing your queries or
                  contact support for quota increase.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Current Usage Card */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-4">
            <FiTrendingUp size={20} className="text-(--accent-primary)" />
            <CardTitle className="font-heading text-xl font-semibold text-(--text-primary)">
              Current Month Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs tracking-wide text-(--text-tertiary) uppercase">
                  Tokens Used
                </p>
                <p className="font-mono text-2xl font-bold text-(--text-primary)">
                  {formatNumber(usageStatus.tokens_used)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs tracking-wide text-(--text-tertiary) uppercase">
                  Monthly Limit
                </p>
                <p className="font-mono text-2xl font-bold text-(--text-primary)">
                  {formatNumber(usageStatus.tokens_limit)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs tracking-wide text-(--text-tertiary) uppercase">
                  Remaining
                </p>
                <p className="font-mono text-2xl font-bold text-(--text-primary)">
                  {formatNumber(
                    usageStatus.tokens_limit - usageStatus.tokens_used,
                  )}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-(--text-secondary)">Usage</span>
                <span
                  className={`font-bold ${warningColorClass.split(' ')[0]}`}
                >
                  {typeof usageStatus.percentage === 'number'
                    ? usageStatus.percentage.toFixed(1)
                    : '0.0'}
                  %
                </span>
              </div>
              <Progress
                value={Math.min(usageStatus?.percentage || 0, 100)}
                className={
                  progressColor
                } /* Inject the color class if Progress accepts it or via wrapping styling. Note: standard shadcn progress uses an indicator inside based on bg-primary */
              />
            </div>

            {/* Reset Date */}
            <div className="mt-4 flex items-center gap-2 border-t border-(--border-subtle) pt-4">
              <FiCalendar size={16} className="text-(--text-tertiary)" />
              <span className="text-sm text-(--text-secondary)">
                Quota resets on{' '}
                <span className="font-semibold text-(--text-primary)">
                  {formatDate(usageStatus.reset_date)}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Node Metrics (Phase 3 Slice) */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-4">
            <FiTrendingUp size={20} className="text-(--accent-primary)" />
            <CardTitle className="font-heading text-xl font-semibold text-(--text-primary)">
              Agent Node Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs tracking-wide text-(--text-tertiary) uppercase">
                  Requests
                </p>
                <p className="font-mono text-xl font-bold text-(--text-primary)">
                  {formatNumber(nodeMetrics?.summary.request_count || 0)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs tracking-wide text-(--text-tertiary) uppercase">
                  Avg Attempts / Request
                </p>
                <p className="font-mono text-xl font-bold text-(--text-primary)">
                  {(nodeMetrics?.summary.avg_attempts_per_request || 0).toFixed(
                    2,
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs tracking-wide text-(--text-tertiary) uppercase">
                  First-pass Validity
                </p>
                <p className="font-mono text-xl font-bold text-(--text-primary)">
                  {(
                    (nodeMetrics?.summary.first_pass_validity_rate || 0) * 100
                  ).toFixed(1)}
                  %
                </p>
              </div>
            </div>

            {(!nodeMetrics?.node_metrics ||
              nodeMetrics.node_metrics.length === 0) && (
              <div className="py-4 text-center text-(--text-tertiary)">
                No node telemetry available yet.
              </div>
            )}

            {nodeMetrics?.node_metrics &&
              nodeMetrics.node_metrics.length > 0 && (
                <div className="space-y-2">
                  {nodeMetrics.node_metrics.map((metric) => (
                    <div
                      key={metric.node}
                      className="grid grid-cols-1 gap-2 rounded-md border border-(--border-subtle) p-3 md:grid-cols-6"
                    >
                      <div>
                        <p className="text-xs text-(--text-tertiary)">Node</p>
                        <p className="font-mono text-sm font-semibold text-(--text-primary)">
                          {metric.node}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-(--text-tertiary)">
                          Total Tokens
                        </p>
                        <p className="font-mono text-sm text-(--text-primary)">
                          {formatNumber(metric.total_tokens)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-(--text-tertiary)">Calls</p>
                        <p className="font-mono text-sm text-(--text-primary)">
                          {formatNumber(metric.call_count)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-(--text-tertiary)">
                          Avg / P50 ms
                        </p>
                        <p className="font-mono text-sm text-(--text-primary)">
                          {metric.avg_latency_ms} / {metric.p50_latency_ms}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-(--text-tertiary)">P95 ms</p>
                        <p className="font-mono text-sm text-(--text-primary)">
                          {metric.p95_latency_ms}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-(--text-tertiary)">
                          Overlap Ratio
                        </p>
                        <p className="font-mono text-sm text-(--text-primary)">
                          {(metric.avg_overlap_ratio * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>

        {/* Historical Usage Chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <FiCalendar size={20} className="text-(--accent-primary)" />
              <CardTitle className="font-heading text-xl font-semibold text-(--text-primary)">
                Usage History
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProviderBreakdown(!showProviderBreakdown)}
            >
              {showProviderBreakdown ? 'Show Consolidated' : 'Show by Provider'}
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            {/* Table View (Simple bar chart alternative) */}
            <div className="space-y-3">
              {!showProviderBreakdown ? (
                // Consolidated View
                <>
                  {(!monthlyData?.history ||
                    monthlyData.history.length === 0) && (
                    <div className="py-8 text-center text-(--text-tertiary)">
                      <p>No historical data available yet.</p>
                      <p className="mt-2 text-sm">
                        Usage history will appear here as you use the service
                        over multiple months.
                      </p>
                    </div>
                  )}
                  {monthlyData?.history?.map((month, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="text-md flex items-center justify-between">
                        <span className="font-mono font-medium text-(--text-primary)">
                          {month.period}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-(--text-primary)">
                            {formatNumber(month.tokens_used)} /{' '}
                            {formatNumber(month.tokens_limit)}
                          </span>
                          <span className="w-12 text-right text-(--text-tertiary)">
                            {typeof month.percentage === 'number'
                              ? month.percentage.toFixed(0)
                              : '0'}
                            %
                          </span>
                        </div>
                      </div>
                      <Progress
                        value={Math.min(month.percentage || 0, 100)}
                        className={
                          (month.percentage || 0) >= 95
                            ? 'text-red-500' // Using indicator styling approach if it accepts text color or manual inline
                            : (month.percentage || 0) >= 90
                              ? 'text-orange-500'
                              : (month.percentage || 0) >= 80
                                ? 'text-yellow-500'
                                : 'text-green-500'
                        }
                      />
                    </div>
                  ))}
                </>
              ) : (
                // Provider Breakdown View
                <>
                  {(!providerData?.usage ||
                    providerData.usage.length === 0) && (
                    <div className="py-8 text-center text-(--text-tertiary)">
                      <p>No provider breakdown data available yet.</p>
                      <p className="mt-2 text-sm">
                        Provider usage will appear here as you use different
                        providers.
                      </p>
                    </div>
                  )}
                  {providerData?.usage && providerData.usage.length > 0 && (
                    <div className="space-y-4">
                      {/* Group by month */}
                      {Object.entries(
                        providerData.usage.reduce(
                          (acc, item) => {
                            if (!acc[item.month]) acc[item.month] = [];
                            acc[item.month].push(item);
                            return acc;
                          },
                          {} as Record<string, typeof providerData.usage>,
                        ),
                      )
                        .sort(([a], [b]) => b.localeCompare(a)) // Sort months desc
                        .map(([month, providers]) => (
                          <div key={month} className="space-y-4">
                            <div className="text-md font-mono font-medium text-(--text-primary)">
                              {month}
                            </div>
                            {providers.map((provider, idx) => (
                              <div key={idx} className="space-y-1 pl-4">
                                <div className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className={`gap-1 capitalize border-${getProviderColor(provider.provider).replace('bg-', '')}`}
                                    >
                                      <div
                                        className={`h-2 w-2 rounded-full ${getProviderColor(provider.provider)}`}
                                      />
                                      {provider.provider}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono text-xs text-(--text-primary)">
                                      {formatNumber(provider.total_tokens)}{' '}
                                      tokens
                                    </span>
                                    <span className="text-xs text-(--text-tertiary)">
                                      ${provider.total_cost_usd.toFixed(2)}
                                    </span>
                                    <span className="w-16 text-right text-xs text-(--text-tertiary)">
                                      {provider.request_count} reqs
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Info Box */}
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <FiInfo
              size={18}
              className="mt-0.5 shrink-0 text-(--accent-primary)"
            />
            <div className="space-y-1 text-sm text-(--text-secondary)">
              <p>
                <strong>What are tokens?</strong> Tokens are units used to
                measure API usage. They represent the amount of text processed
                by the AI models.
              </p>
              <p>
                <strong>When does my quota reset?</strong> Your monthly token
                quota resets on the first day of each month.
              </p>
              <p>
                <strong>Need more tokens?</strong> Contact your administrator to
                request a quota increase.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UsageDashboard;
