import { Check } from 'lucide-react';
import React from 'react';
import { FaStethoscope } from 'react-icons/fa';
import { FiLogOut, FiMonitor, FiMoon, FiSliders, FiSun } from 'react-icons/fi';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SettingsMenuProps {
  theme: 'light' | 'dark' | 'clinical-slate' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'clinical-slate' | 'system') => void;
  onOpenPreferences: () => void;
  onClose: () => void;
  isSidebarOpen: boolean;
  onLogout: () => void;
  /** The trigger button element to anchor the menu */
  trigger: React.ReactNode;
}

const themeOptions = [
  { value: 'light', label: 'Light', icon: FiSun },
  { value: 'dark', label: 'Dark', icon: FiMoon },
  { value: 'clinical-slate', label: 'Clinical Slate', icon: FaStethoscope },
  { value: 'system', label: 'System', icon: FiMonitor },
] as const;

const SettingsMenu: React.FC<SettingsMenuProps> = ({
  theme,
  setTheme,
  onOpenPreferences,
  onClose,
  isSidebarOpen,
  onLogout,
  trigger,
}) => {
  return (
    <DropdownMenu onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>

      <DropdownMenuContent
        side={isSidebarOpen ? 'top' : 'right'}
        align={isSidebarOpen ? 'start' : 'end'}
        className="w-56"
        sideOffset={8}
      >
        {/* Theme selection */}
        <DropdownMenuLabel className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
          Appearance
        </DropdownMenuLabel>

        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'clinical-slate' | 'system')}
        >
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              className="flex cursor-pointer items-center gap-2"
            >
              <Icon size={15} />
              <span>{label}</span>
              {theme === value && <Check size={13} className="ml-auto text-primary" />}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="font-bold text-muted-foreground text-xs uppercase tracking-wider">
          User Preferences
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onClick={() => {
            onOpenPreferences();
            onClose();
          }}
        >
          <FiSliders size={14} />
          Open Preferences
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Help / About */}
        <DropdownMenuItem className="cursor-pointer">Help &amp; Support</DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer">
          About {import.meta.env.VITE_APP_TITLE || 'MediqueryAI'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Sign out */}
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
          onClick={() => {
            onLogout();
            onClose();
          }}
        >
          <FiLogOut size={14} />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SettingsMenu;
