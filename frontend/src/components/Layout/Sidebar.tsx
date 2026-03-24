import React from 'react';
import { FiBarChart2, FiMenu, FiPlus, FiSettings, FiShield } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Thread } from '../../App';
import { isAdmin } from '../../utils/auth';
import SettingsMenu from './SettingsMenu';
import ThreadItem from './ThreadItem';

interface SidebarProps {
  onNewChat: () => void;
  onLogout: () => void;
  threads: Thread[];
  currentChatId: string | null;
  onSelectThread: (id: string) => void;
  onRenameThread: (id: string, newTitle: string) => void;
  onDeleteThread: (id: string) => void;
  onPinThread: (id: string, pinned: boolean) => void;
  onShareThread: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  theme: 'light' | 'dark' | 'clinical-slate' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'clinical-slate' | 'system') => void;
  onOpenPreferences: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  onNewChat,
  onLogout,
  threads,
  currentChatId,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
  onPinThread,
  onShareThread,
  isOpen,
  onToggle,
  theme,
  setTheme,
  onOpenPreferences,
}) => {
  const navigate = useNavigate();
  const userIsAdmin = isAdmin();
  const appTitle = (import.meta as ImportMeta & { env?: { VITE_APP_TITLE?: string } }).env
    ?.VITE_APP_TITLE;

  return (
    <div className={cn('flex h-full flex-col bg-card', isOpen ? 'w-64' : 'w-14')}>
      {/* ── Header / Hamburger ── */}
      <div className={cn('flex items-center p-3', isOpen ? 'gap-3' : 'justify-center')}>
        {isOpen ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-9 w-9 cursor-pointer rounded-full text-muted-foreground hover:bg-primary/20 hover:text-foreground"
            aria-label="Toggle Sidebar"
          >
            <FiMenu size={18} />
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="h-9 w-9 cursor-pointer rounded-full text-muted-foreground hover:bg-primary/20 hover:text-foreground"
                aria-label="Toggle Sidebar"
              >
                <FiMenu size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Open Sidebar</TooltipContent>
          </Tooltip>
        )}
        {isOpen && (
          <span className="truncate font-heading font-semibold text-muted-foreground">
            {appTitle || 'MediqueryAI'}
          </span>
        )}
      </div>

      {/* ── New Chat ── */}
      <div className={cn('mb-3 flex items-center px-3', isOpen ? 'gap-3' : 'justify-center')}>
        {isOpen ? (
          <Button
            onClick={onNewChat}
            className="h-9 w-full cursor-pointer gap-2 rounded-full bg-primary/90 hover:bg-primary"
            title="New Chat"
          >
            <FiPlus size={16} />
            New chat
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onNewChat}
                size="icon"
                className="h-9 w-9 cursor-pointer rounded-full bg-primary/90 hover:bg-primary"
                title="New Chat"
              >
                <FiPlus size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New Chat</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* ── Thread List ── */}
      <ScrollArea className="flex-1 px-2">
        {isOpen && threads.length > 0 && (
          <p className="mb-2 px-2 font-bold text-muted-foreground text-sm uppercase tracking-wider opacity-70">
            Recent
          </p>
        )}

        {isOpen && threads.length === 0 && (
          <p className="px-4 py-8 text-center text-muted-foreground text-sm italic">
            No recent chats
          </p>
        )}

        {isOpen &&
          threads.map((thread: Thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isActive={currentChatId === thread.id}
              isSidebarOpen={isOpen}
              onSelect={onSelectThread}
              onRename={onRenameThread}
              onDelete={onDeleteThread}
              onPin={onPinThread}
              onShare={onShareThread}
            />
          ))}
      </ScrollArea>

      {/* ── Bottom Actions ── */}
      <div className="mt-auto space-y-1 p-3">
        <Separator />

        {/* Usage Dashboard */}
        {isOpen ? (
          <Button
            className="h-9 w-full cursor-pointer justify-start gap-3 rounded-full bg-transparent text-foreground hover:bg-primary/20"
            onClick={() => navigate('/dashboard')}
          >
            <FiBarChart2 size={18} />
            <span className="text-sm">Usage Dashboard</span>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="h-9 w-9 cursor-pointer rounded-full bg-transparent text-foreground hover:bg-primary/20"
                onClick={() => navigate('/dashboard')}
                aria-label="Usage Dashboard"
              >
                <FiBarChart2 size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Usage Dashboard</TooltipContent>
          </Tooltip>
        )}

        {/* Admin: Quota Management */}
        {userIsAdmin &&
          (isOpen ? (
            <Button
              className="h-9 w-full cursor-pointer justify-start gap-3 rounded-full bg-transparent text-foreground hover:bg-primary/20"
              onClick={() => navigate('/admin')}
            >
              <FiShield size={18} />
              <span className="text-sm">Quota Management</span>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="h-9 w-9 cursor-pointer rounded-full bg-transparent text-foreground hover:bg-primary/20"
                  onClick={() => navigate('/admin')}
                  aria-label="Quota Management"
                >
                  <FiShield size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Quota Management</TooltipContent>
            </Tooltip>
          ))}

        {/* Settings (DropdownMenu) */}
        <SettingsMenu
          theme={theme}
          setTheme={setTheme}
          onOpenPreferences={onOpenPreferences}
          onClose={() => {}}
          isSidebarOpen={isOpen}
          onLogout={onLogout}
          trigger={
            isOpen ? (
              <Button className="h-9 w-full cursor-pointer justify-start gap-3 rounded-full bg-transparent text-foreground hover:bg-primary/20">
                <FiSettings size={18} />
                <span className="text-sm">Settings</span>
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-9 w-9 cursor-pointer rounded-full bg-transparent text-foreground hover:bg-primary/20"
                aria-label="Settings"
                title="Settings"
              >
                <FiSettings size={18} />
              </Button>
            )
          }
        />
      </div>
    </div>
  );
};

export default Sidebar;
