import React, { useState } from 'react';
import { FiAlertCircle, FiBarChart2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useTokenUsage } from '../../contexts/TokenUsageContext';
import { formatNumber } from '../../services/tokenUsageService';

const UsageIndicator: React.FC = () => {
  const navigate = useNavigate();
  const { usageStatus, loading, error } = useTokenUsage();
  const [showTooltip, setShowTooltip] = useState(false);

  // Hide indicator if not authenticated
  if (error === 'Not authenticated' || error === 'Authentication required') {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-(--text-tertiary) text-xs">
        <div className="h-4 w-4 animate-spin rounded-full border-(--accent-primary) border-2 border-t-transparent"></div>
        <span>Loading usage...</span>
      </div>
    );
  }

  if (error || !usageStatus) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-(--text-tertiary) text-xs">
        <FiAlertCircle size={14} />
        <span>Usage unavailable</span>
      </div>
    );
  }

  // Determine progress bar color based on warning level
  const getProgressColor = (level: string): string => {
    switch (level) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-green-500';
    }
  };

  const getTextColor = (level: string): string => {
    switch (level) {
      case 'critical':
        return 'text-red-500';
      case 'high':
        return 'text-orange-500';
      case 'medium':
        return 'text-yellow-500';
      default:
        return 'text-green-500';
    }
  };

  const progressColor = getProgressColor(usageStatus.warning_level);
  const textColor = getTextColor(usageStatus.warning_level);

  return (
    <div
      className="relative"
      onPointerEnter={() => setShowTooltip(true)}
      onPointerLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-(--bg-tertiary)"
        onClick={() => navigate('/dashboard')}
        title="View detailed usage dashboard"
      >
        {/* Icon */}
        <FiBarChart2 size={16} className={textColor} />

        {/* Usage Text */}
        <div className="flex items-center gap-1 font-mono text-xs">
          <span className={textColor}>{formatNumber(usageStatus.tokens_used)}</span>
          <span className="text-(--text-tertiary)">/</span>
          <span className="text-(--text-secondary)">{formatNumber(usageStatus.tokens_limit)}</span>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted/50">
          <div
            className={`h-full ${progressColor} transition-all`}
            style={{ width: `${Math.min(usageStatus.percentage, 100)}%` }}
          />
        </div>

        {/* Warning Icon for high usage */}
        {usageStatus.warning_level !== 'normal' && (
          <FiAlertCircle size={14} className={textColor} />
        )}
      </button>

      {/* Tooltip - No gap, use pt-2 on inner content for visual spacing */}
      {showTooltip && usageStatus && (
        <div className="absolute top-full right-0 z-50 w-64 pt-2">
          <div className="rounded-lg border border-(--border-subtle) bg-(--bg-secondary) p-3 shadow-lg">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-(--text-primary) text-xs">Token Usage</span>
                <span className={`font-bold text-xs ${textColor}`}>
                  {typeof usageStatus.percentage === 'number'
                    ? usageStatus.percentage.toFixed(1)
                    : '0.0'}
                  %
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-(--text-tertiary)">Used:</span>
                  <span className="font-mono text-(--text-primary)">
                    {formatNumber(usageStatus.tokens_used || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-(--text-tertiary)">Limit:</span>
                  <span className="font-mono text-(--text-primary)">
                    {formatNumber(usageStatus.tokens_limit || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-(--text-tertiary)">Remaining:</span>
                  <span className="font-mono text-(--text-primary)">
                    {formatNumber((usageStatus.tokens_limit || 0) - (usageStatus.tokens_used || 0))}
                  </span>
                </div>
              </div>

              {usageStatus.message && (
                <div className={`text-xs ${textColor} mt-2 border-(--border-subtle) border-t pt-2`}>
                  {usageStatus.message}
                </div>
              )}

              <div className="border-(--border-subtle) border-t pt-2 text-(--text-tertiary) text-xs">
                Resets:{' '}
                {usageStatus.reset_date
                  ? new Date(usageStatus.reset_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'N/A'}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/dashboard');
                }}
                className="mt-2 w-full cursor-pointer rounded bg-(--accent-primary) px-2 py-1.5 text-white text-xs transition-colors hover:bg-(--accent-hover)"
              >
                View Full Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsageIndicator;
