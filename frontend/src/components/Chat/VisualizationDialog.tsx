import React, { useState } from 'react';
import { Minimize2, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import PlotlyVisualizer from './PlotlyVisualizer';
import { exportToCSV } from '../../utils/export';

interface VisualizationData {
  columns: string[];
  data: unknown[];
  row_count: number;
}

interface VisualizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: VisualizationData;
  visualizationType: string;
  theme: 'light' | 'dark' | 'clinical-slate' | 'system';
  onVisualizationTypeChange?: (type: string) => void;
}

interface ChartSelectorState {
  types: string[];
  current: string;
  setCurrent: (t: string) => void;
}

const VisualizationDialog: React.FC<VisualizationDialogProps> = ({
  open,
  onOpenChange,
  data,
  visualizationType,
  theme,
  onVisualizationTypeChange,
}) => {
  const [chartSelector, setChartSelector] = useState<ChartSelectorState | null>(
    null,
  );

  // Reset to the incoming type whenever dialog opens with a new viz
  React.useEffect(() => {
    if (!open) setChartSelector(null);
  }, [open]);

  const handleExport = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    exportToCSV(
      data.data as Record<string, unknown>[],
      data.columns,
      `mediquery-expanded-${timestamp}`,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        hideClose: Shadcn adds an absolute-positioned X by default.
        We provide our own Minimize2 icon so we suppress the default one
        via [&>button]:hidden on DialogContent.
      */}
      <DialogContent
        className="flex flex-col gap-0 rounded-none border-none p-0 [&>button:last-child]:hidden"
        style={{
          maxWidth: '100vw',
          width: '100vw',
          height: '100dvh',
          maxHeight: '100dvh',
        }}
      >
        {/* ── Header ── */}
        <DialogHeader className="bg-card flex shrink-0 flex-row items-center justify-between px-6 py-3">
          <DialogTitle className="text-base font-semibold">
            Visualization Workspace
          </DialogTitle>

          <div className="flex items-center gap-2">
            {/* Chart type selector — only when multiple types available */}
            {chartSelector && chartSelector.types.length > 1 && (
              <Select
                value={chartSelector.current}
                onValueChange={(newType) => {
                  chartSelector.setCurrent(newType);
                  onVisualizationTypeChange?.(newType);
                }}
              >
                <SelectTrigger className="text-muted-foreground hover:bg-primary/20 hover:text-foreground h-7 cursor-pointer gap-1 rounded-full border-none pl-4 text-xs font-medium shadow-none transition-colors focus:ring-0">
                  <SelectValue placeholder="Select chart" />
                </SelectTrigger>
                <SelectContent>
                  {chartSelector.types.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Export */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              className="text-muted-foreground hover:bg-primary/20 hover:text-foreground h-8 w-8 cursor-pointer rounded-full"
              title="Export CSV"
            >
              <Download size={13} />
            </Button>

            {/* Close — Minimize2 icon (shrink arrows pointing inward) */}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-primary/20 hover:text-foreground h-8 w-8 cursor-pointer rounded-full"
                aria-label="Close visualization workspace"
                title="Minimize"
              >
                <Minimize2 size={16} />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <Separator />

        {/* ── Content ── */}
        <div className="bg-background flex-1 overflow-auto p-4">
          <PlotlyVisualizer
            data={data}
            visualizationType={visualizationType}
            theme={theme}
            expandedMode
            onChartTypesReady={(types, current, setCurrent) => {
              setChartSelector((prev) => {
                // Only update if something actually changed to avoid infinite loop
                if (
                  prev?.current === current &&
                  prev.types.join(',') === types.join(',')
                )
                  return prev;
                return { types, current, setCurrent };
              });
            }}
          />
        </div>

        {/* ── Footer ── */}
        <div className="bg-card shrink-0 px-6 py-2">
          <p className="text-muted-foreground text-center text-xs">
            {data.row_count.toLocaleString()} rows · {data.columns.length}{' '}
            columns · Scroll to zoom · Drag to pan
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VisualizationDialog;
