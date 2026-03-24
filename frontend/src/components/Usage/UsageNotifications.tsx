import React, { useState } from 'react';
import { FiAlertCircle, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useTokenUsage } from '../../contexts/TokenUsageContext';

const UsageNotifications: React.FC = () => {
  const navigate = useNavigate();
  const { usageStatus } = useTokenUsage();

  // Initialize dismissed notifications from localStorage
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('dismissed_usage_notifications');
    if (stored) {
      try {
        return new Set(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse dismissed notifications:', e);
        return new Set();
      }
    }
    return new Set();
  });

  const handleDismiss = (notificationId: string) => {
    const newDismissed = new Set(dismissed);
    newDismissed.add(notificationId);
    setDismissed(newDismissed);
    localStorage.setItem('dismissed_usage_notifications', JSON.stringify(Array.from(newDismissed)));
  };

  if (!usageStatus || usageStatus.warning_level === 'normal') {
    return null;
  }

  // Safety check for percentage
  if (typeof usageStatus.percentage !== 'number') {
    return null;
  }

  // Create notification ID based on period and warning level
  const notificationId = `${usageStatus.percentage.toFixed(0)}-${usageStatus.warning_level}`;

  // Don't show if already dismissed (but show again if usage increases to next level)
  if (dismissed.has(notificationId)) {
    return null;
  }

  const getBannerColor = (level: string): string => {
    switch (level) {
      case 'critical':
        return 'bg-red-500/20 border-red-500 text-red-500';
      case 'high':
        return 'bg-orange-500/20 border-orange-500 text-orange-500';
      case 'medium':
        return 'bg-yellow-500/20 border-yellow-500 text-yellow-500';
      default:
        return 'bg-blue-500/20 border-blue-500 text-blue-500';
    }
  };

  const colorClass = getBannerColor(usageStatus.warning_level);

  // Critical usage shows as modal
  if (usageStatus.warning_level === 'critical' && usageStatus.percentage >= 100) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-lg border-2 border-red-500 bg-(--bg-secondary) p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <FiAlertCircle size={24} className="mt-1 shrink-0 text-red-500" />
            <div className="flex-1">
              <h3 className="mb-2 font-bold text-lg text-red-500">Token Quota Exceeded</h3>
              <p className="mb-4 text-(--text-primary)">
                You have reached your monthly token limit. Your queries will be rate-limited until
                the quota resets.
              </p>
              <div className="space-y-2 text-(--text-secondary) text-sm">
                <p>
                  <strong>Usage:</strong> {usageStatus.percentage.toFixed(1)}%
                </p>
                <p>
                  <strong>Resets:</strong> {new Date(usageStatus.reset_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                handleDismiss(notificationId);
                navigate('/dashboard');
              }}
              className="flex-1 rounded-lg bg-(--accent-primary) px-4 py-2 text-white transition-colors hover:bg-(--accent-hover)"
            >
              View Dashboard
            </button>
            <button
              type="button"
              onClick={() => handleDismiss(notificationId)}
              className="flex-1 rounded-lg bg-(--bg-tertiary) px-4 py-2 text-(--text-primary) transition-colors hover:bg-(--bg-primary)"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Warning banner for medium/high/critical below 100%
  return (
    <div className={`fixed top-0 right-0 left-0 z-40 border-b ${colorClass}`}>
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center gap-3">
          <FiAlertCircle size={20} className="shrink-0" />
          <p className="flex-1 font-medium text-sm">
            {usageStatus.message} ({usageStatus.percentage.toFixed(1)}% used)
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="rounded bg-white/20 px-3 py-1 font-medium text-xs transition-colors hover:bg-white/30"
            >
              View Details
            </button>
            <button
              type="button"
              onClick={() => handleDismiss(notificationId)}
              className="rounded p-1 transition-colors hover:bg-white/20"
              title="Dismiss"
            >
              <FiX size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UsageNotifications;
