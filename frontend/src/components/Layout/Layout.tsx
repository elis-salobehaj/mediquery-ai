import React, { useState } from 'react';
import { Separator } from '@/components/ui/separator';
import type { Thread } from '../../App';
import UsageIndicator from '../Usage/UsageIndicator';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  onNewChat: () => void;
  onLogout: () => void;
  threads: Thread[];
  currentChatId: string | null;
  onSelectThread: (id: string) => void;
  onRenameThread: (id: string, newTitle: string) => void;
  onDeleteThread: (id: string) => void;
  onPinThread: (id: string, pinned: boolean) => void;
  onShareThread: (id: string) => void;
  theme: 'light' | 'dark' | 'clinical-slate' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'clinical-slate' | 'system') => void;
  onOpenPreferences: () => void;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  onNewChat,
  onLogout,
  threads,
  currentChatId,
  onSelectThread,
  onRenameThread,
  onDeleteThread,
  onPinThread,
  onShareThread,
  theme,
  setTheme,
  onOpenPreferences,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        onNewChat={onNewChat}
        onLogout={onLogout}
        threads={threads}
        currentChatId={currentChatId}
        onSelectThread={onSelectThread}
        onRenameThread={onRenameThread}
        onDeleteThread={onDeleteThread}
        onPinThread={onPinThread}
        onShareThread={onShareThread}
        theme={theme}
        setTheme={setTheme}
        onOpenPreferences={onOpenPreferences}
      />

      <Separator orientation="vertical" />

      <main className="relative flex h-full flex-1 flex-col overflow-hidden">
        {/* Top header bar with usage indicator */}
        <div className="flex items-center justify-end bg-card px-4 py-2">
          <UsageIndicator />
        </div>
        <Separator />

        {children}
      </main>
    </div>
  );
};

export default Layout;
