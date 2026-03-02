import React from 'react';
import { FiMoon, FiSun, FiMonitor, FiLogOut, FiSliders } from 'react-icons/fi';
import { FaStethoscope } from 'react-icons/fa';
import { Check } from 'lucide-react';
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
        <DropdownMenuLabel className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
          Appearance
        </DropdownMenuLabel>

        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) =>
            setTheme(v as 'light' | 'dark' | 'clinical-slate' | 'system')
          }
        >
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              className="flex cursor-pointer items-center gap-2"
            >
              <Icon size={15} />
              <span>{label}</span>
              {theme === value && (
                <Check size={13} className="text-primary ml-auto" />
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
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
        <DropdownMenuItem className="cursor-pointer">
          Help &amp; Support
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer">
          About {import.meta.env.VITE_APP_TITLE || 'MediqueryAI'}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Sign out */}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive cursor-pointer gap-2"
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
