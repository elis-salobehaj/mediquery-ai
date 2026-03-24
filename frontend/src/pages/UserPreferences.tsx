import axios from 'axios';
import { useEffect, useState } from 'react';
import { FiClock, FiCpu, FiSliders } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getApiUrl } from '@/config/api';

type AgentMode = 'fast' | 'multi-agent';

interface UserPreferencesProps {
  enable_memory: boolean;
  setEnableMemory: (enabled: boolean) => void;
  onClearMemory: () => Promise<void>;
  agentMode: AgentMode;
  setAgentMode: (mode: AgentMode) => void;
}

interface MemoryPreferencesResponse {
  preferred_units: string | null;
  preferred_chart_style: string | null;
}

const CLINICAL_UNIT_SYSTEMS = ['SI', 'conventional'] as const;
const DEFAULT_UNITS = 'SI';
const DEFAULT_CHART_STYLE = 'table';

function isClinicalUnitSystem(value: string | null): value is string {
  return !!value && CLINICAL_UNIT_SYSTEMS.includes(value as never);
}

const UserPreferences: React.FC<UserPreferencesProps> = ({
  enable_memory,
  setEnableMemory,
  onClearMemory,
  agentMode,
  setAgentMode,
}) => {
  const [preferredUnits, setPreferredUnits] = useState(DEFAULT_UNITS);
  const [preferredChartStyle, setPreferredChartStyle] = useState(DEFAULT_CHART_STYLE);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isClearingMemory, setIsClearingMemory] = useState(false);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const res = await axios.get(getApiUrl('/memory/preferences'));
        const data = res.data as MemoryPreferencesResponse;

        setPreferredUnits(
          isClinicalUnitSystem(data.preferred_units) ? data.preferred_units : DEFAULT_UNITS,
        );
        setPreferredChartStyle(data.preferred_chart_style || DEFAULT_CHART_STYLE);
      } catch (error) {
        console.warn('Failed to load user preferences', error);
      }
    };

    fetchPreferences();
  }, []);

  const updatePreference = async (units: string, chartStyle: string) => {
    try {
      await axios.patch(getApiUrl('/memory/preferences'), {
        preferred_units: units,
        preferred_chart_style: chartStyle,
      });
    } catch (error) {
      console.error('Failed to save user preferences', error);
    }
  };

  return (
    <div className="h-full overflow-auto bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="font-bold font-heading text-3xl">User Preferences</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Manage your default AI behavior and long-lived memory preferences.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-4">
            <FiClock size={20} className="text-(--accent-primary)" />
            <div>
              <CardTitle className="font-heading font-semibold text-xl">Memory</CardTitle>
              <CardDescription className="mt-1">
                Configure how memory is used for your requests.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between rounded-md border border-(--border-subtle) p-4">
              <div className="space-y-1">
                <Label className="font-medium text-sm">Enable Thread Memory</Label>
                <p className="text-muted-foreground text-xs">
                  When disabled, each request starts without previous thread context.
                </p>
              </div>
              <Switch
                checked={enable_memory}
                onCheckedChange={setEnableMemory}
                aria-label="Enable thread memory"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-(--border-subtle) p-4">
              <div className="space-y-1">
                <Label className="font-medium text-sm">Clear Memory</Label>
                <p className="text-muted-foreground text-xs">
                  Delete all memory from previous threads and saved preferences.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={isClearingMemory}
              >
                Clear Memory
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-4">
            <FiSliders size={20} className="text-(--accent-primary)" />
            <div>
              <CardTitle className="font-heading font-semibold text-xl">
                Long-lived Preferences
              </CardTitle>
              <CardDescription className="mt-1">
                Saved in your account and reused when memory is enabled.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-4">
            <div className="space-y-2 rounded-md border border-(--border-subtle) p-4">
              <Label htmlFor="preferred-units">Preferred Unit System</Label>
              <Select
                value={preferredUnits}
                onValueChange={async (value) => {
                  setPreferredUnits(value);
                  await updatePreference(value, preferredChartStyle);
                }}
              >
                <SelectTrigger id="preferred-units" className="w-full">
                  <SelectValue placeholder="Select unit system" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SI">SI (e.g., mmol/L, kg, cm)</SelectItem>
                  <SelectItem value="conventional">Conventional (e.g., mg/dL)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 rounded-md border border-(--border-subtle) p-4">
              <Label htmlFor="preferred-chart-style">Preferred Chart Style</Label>
              <Select
                value={preferredChartStyle}
                onValueChange={async (value) => {
                  setPreferredChartStyle(value);
                  await updatePreference(preferredUnits, value);
                }}
              >
                <SelectTrigger id="preferred-chart-style" className="w-full">
                  <SelectValue placeholder="Select chart style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">Table First</SelectItem>
                  <SelectItem value="bar">Bar Charts</SelectItem>
                  <SelectItem value="line">Line Charts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 p-4">
            <FiCpu size={20} className="text-(--accent-primary)" />
            <div>
              <CardTitle className="font-heading font-semibold text-xl">Query Experience</CardTitle>
              <CardDescription className="mt-1">
                Choose your default assistant operating mode.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            <Label htmlFor="default-agent-mode">Default Agent Mode</Label>
            <Select value={agentMode} onValueChange={(value) => setAgentMode(value as AgentMode)}>
              <SelectTrigger id="default-agent-mode" className="w-full">
                <SelectValue placeholder="Select default mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multi-agent">Multi-Agent</SelectItem>
                <SelectItem value="fast">Fast</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Memory?</DialogTitle>
            <DialogDescription>
              This will delete all memory from previous threads. New interactions will start with no
              memory of previous interactions. Do you want to proceed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isClearingMemory}
            >
              No
            </Button>
            <Button
              variant="destructive"
              disabled={isClearingMemory}
              onClick={async () => {
                try {
                  setIsClearingMemory(true);
                  await onClearMemory();
                  setConfirmOpen(false);
                } finally {
                  setIsClearingMemory(false);
                }
              }}
            >
              Yes, Clear Memory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserPreferences;
