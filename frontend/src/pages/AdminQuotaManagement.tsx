import { type ColumnDef } from '@tanstack/react-table';
import axios from 'axios';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiAlertCircle, FiCheck, FiEdit2, FiRefreshCw, FiUsers, FiX } from 'react-icons/fi';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table';
import { DataTableColumnHeader } from '../components/ui/data-table-column-header';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';
import type { AdminUser, AdminUsersResponse } from '../services/tokenUsageService';
import { formatNumber, tokenUsageService } from '../services/tokenUsageService';
import { waitForAuthHeaders } from '../utils/auth';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

const getWarningBadgeVariant = (level: string): BadgeVariant => {
  switch (level) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'outline';
    case 'medium':
      return 'secondary';
    default:
      return 'secondary';
  }
};

const AdminQuotaManagement: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response: AdminUsersResponse = await tokenUsageService.getAdminUsers();
      setUsers(response.users);
      setError(null);
    } catch (err: unknown) {
      console.error('Failed to fetch users:', err);
      const error = err as { response?: { status?: number } };
      if (error.response?.status === 403) {
        setError('Access denied. Admin privileges required.');
      } else {
        setError('Failed to load users. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const token = localStorage.getItem('mediquery_token');
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const run = async () => {
      setLoading(true);
      try {
        const response: AdminUsersResponse = await tokenUsageService.getAdminUsers(
          controller.signal,
        );
        setUsers(response.users);
        setError(null);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const error = err as { response?: { status?: number } };
        if (error.response?.status === 403) {
          setError('Access denied. Admin privileges required.');
        } else {
          setError('Failed to load users. Please try again.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    if (!axios.defaults.headers.common.Authorization) {
      const cleanup = waitForAuthHeaders(() => void run());
      return () => {
        controller.abort();
        cleanup();
      };
    }

    void run();
    return () => {
      controller.abort();
    };
  }, []);

  const handleEditQuota = useCallback((user: AdminUser) => {
    setEditingUserId(user.user_id);
    setEditValue(user.tokens_limit.toString());
  }, []);

  const handleSaveQuota = useCallback(
    async (userId: string) => {
      const newLimit = parseInt(editValue, 10);
      if (Number.isNaN(newLimit) || newLimit < 0) {
        alert('Please enter a valid positive number');
        return;
      }

      setSaving(true);
      try {
        await tokenUsageService.updateUserQuota(userId, {
          tokens_limit: newLimit,
        });
        await fetchUsers(true);
        setEditingUserId(null);
        setEditValue('');
      } catch (err: unknown) {
        console.error('Failed to update quota:', err);
        const e = err as {
          response?: { data?: { detail?: string } };
          message?: string;
        };
        alert(`Failed to update quota: ${e.response?.data?.detail || e.message}`);
      } finally {
        setSaving(false);
      }
    },
    [editValue, fetchUsers],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingUserId(null);
    setEditValue('');
  }, []);

  const columns = useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        accessorKey: 'username',
        header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.username}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {row.original.user_id}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'tokens_used',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Used" />,
        cell: ({ row }) => (
          <span className="font-mono">{formatNumber(row.original.tokens_used)}</span>
        ),
      },
      {
        accessorKey: 'tokens_limit',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Limit" />,
        cell: ({ row }) => {
          const user = row.original;
          const isEditing = editingUserId === user.user_id;

          if (isEditing) {
            return (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="h-8 w-24 font-mono text-sm"
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-green-500"
                  onClick={() => handleSaveQuota(user.user_id)}
                  disabled={saving}
                >
                  <FiCheck size={14} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  <FiX size={14} />
                </Button>
              </div>
            );
          }

          return <span className="font-mono">{formatNumber(user.tokens_limit)}</span>;
        },
      },
      {
        accessorKey: 'percentage',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Usage %" />,
        cell: ({ row }) => {
          const percentage = row.original.percentage || 0;
          const level = row.original.warning_level;
          const colorClass =
            level === 'critical'
              ? 'bg-destructive'
              : level === 'high'
                ? 'bg-orange-500'
                : level === 'medium'
                  ? 'bg-yellow-500'
                  : 'bg-green-500';

          return (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full transition-all', colorClass)}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                />
              </div>
              <span className="font-mono text-xs">{percentage.toFixed(1)}%</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'warning_level',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const level = row.original.warning_level;
          return (
            <Badge
              variant={getWarningBadgeVariant(level)}
              className={cn(
                'capitalize',
                level === 'high' && 'border-orange-500 text-orange-500',
                level === 'medium' && 'border-yellow-500 text-yellow-500',
                level === 'normal' && 'border-green-500 text-green-500',
              )}
            >
              {level}
            </Badge>
          );
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const user = row.original;
          if (editingUserId === user.user_id) return null;

          return (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleEditQuota(user)}
            >
              <FiEdit2 size={14} />
            </Button>
          );
        },
      },
    ],
    [editingUserId, editValue, saving, handleSaveQuota, handleEditQuota, handleCancelEdit],
  );

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-(--accent-primary) border-4 border-t-transparent"></div>
        <p className="mt-4 text-(--text-secondary)">Loading users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <FiAlertCircle size={48} className="mb-4 text-red-500" />
        <p className="mb-2 font-semibold text-lg text-red-500">Error Loading Data</p>
        <p className="mb-4 text-(--text-secondary)">{error}</p>
        <button
          type="button"
          onClick={() => fetchUsers()}
          className="rounded-lg bg-(--accent-primary) px-4 py-2 text-white transition-colors hover:bg-(--accent-hover)"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold font-heading text-3xl">Quota Management</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Manage user token quotas and monitor usage
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => fetchUsers(true)}
            disabled={refreshing}
            className="gap-2"
          >
            <FiRefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>

        {/* Stats Card */}
        <Card>
          <CardHeader className="mt-2">
            <div className="flex items-center gap-2">
              <FiUsers className="text-primary" />
              <CardTitle className="text-lg">Overview</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-2 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                  Total Users
                </p>
                <p className="font-bold font-mono text-2xl">{users?.length || 0}</p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                  Normal
                </p>
                <p className="font-bold font-mono text-2xl text-green-500">
                  {users?.filter((u) => u.warning_level === 'normal').length || 0}
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                  High
                </p>
                <p className="font-bold font-mono text-2xl text-orange-500">
                  {users?.filter((u) => u.warning_level === 'high').length || 0}
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                  Critical
                </p>
                <p className="font-bold font-mono text-2xl text-destructive">
                  {users?.filter((u) => u.warning_level === 'critical').length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <DataTable
          columns={columns}
          data={users || []}
          searchPlaceholder="Search by username or user ID..."
        />
      </div>
    </div>
  );
};

export default AdminQuotaManagement;
