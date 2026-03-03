import React, { useState, useRef, useEffect } from 'react';
import {
  FiMessageSquare,
  FiMoreVertical,
  FiEdit2,
  FiTrash2,
  FiShare2,
} from 'react-icons/fi';
import { RiPushpinFill, RiPushpinLine } from 'react-icons/ri';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Thread } from '../../App';

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  isSidebarOpen: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onShare: (id: string) => void;
}

const ThreadItem: React.FC<ThreadItemProps> = ({
  thread,
  isActive,
  isSidebarOpen,
  onSelect,
  onRename,
  onDelete,
  onPin,
  onShare,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [editTitle, setEditTitle] = useState(thread.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when renaming starts
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (editTitle.trim()) {
      onRename(thread.id, editTitle.trim());
    } else {
      setEditTitle(thread.title);
    }
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit();
    if (e.key === 'Escape') {
      setIsRenaming(false);
      setEditTitle(thread.title);
    }
  };

  // Collapsed icon-only view
  if (!isSidebarOpen) {
    return (
      <button
        onClick={() => onSelect(thread.id)}
        className={cn(
          'group relative my-1 flex w-full cursor-pointer items-center justify-center rounded-md p-2 transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent',
        )}
        title={thread.title}
      >
        <FiMessageSquare size={18} />
        {thread.pinned && (
          <div className="border-card absolute top-1 right-1 h-2 w-2 rounded-full border bg-yellow-500" />
        )}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'group relative my-0.5 flex cursor-pointer items-center rounded-full pr-1 pl-4',
        isActive
          ? 'bg-primary/30 text-primary hover:bg-primary/50 hover:text-accent-foreground'
          : 'text-muted-foreground hover:bg-primary/50 hover:text-accent-foreground',
      )}
      onClick={() => !isRenaming && onSelect(thread.id)}
    >
      {/* Content */}
      <div className="min-w-0 flex-1">
        {isRenaming ? (
          <div onClick={(e) => e.stopPropagation()}>
            <Input
              ref={inputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => handleRenameSubmit()}
              aria-label="Rename thread"
              className="h-8 py-0 text-sm"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1">
            <span
              className={cn('w-40 truncate text-sm', isActive && 'font-medium')}
            >
              {thread.title}
            </span>
            {thread.pinned && (
              <RiPushpinFill
                size={11}
                className="ml-1 shrink-0 text-yellow-500"
              />
            )}
          </div>
        )}
      </div>

      {/* Context menu (visible on hover or when open) */}
      {!isRenaming && (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="text-muted-foreground hover:bg-primary hover:text-foreground h-8 w-8 cursor-pointer rounded-full opacity-0 transition-all group-hover:opacity-100 data-[state=open]:opacity-100"
                aria-label="Thread options"
              >
                <FiMoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={() => onShare(thread.id)}
              >
                <FiShare2 size={13} />
                Share conversation
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={() => setIsRenaming(true)}
              >
                <FiEdit2 size={13} />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={() => onPin(thread.id, !thread.pinned)}
              >
                <RiPushpinLine size={13} />
                {thread.pinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive cursor-pointer gap-2"
                onClick={() => onDelete(thread.id)}
              >
                <FiTrash2 size={13} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
};

export default ThreadItem;
