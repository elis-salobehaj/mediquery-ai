import { Download, Minimize2 } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { exportToCSV } from '../../utils/export';
import PlotlyVisualizer from './PlotlyVisualizer';

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
  const [chartSelector, setChartSelector] = useState<ChartSelectorState | null>(null);

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
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between bg-card px-6 py-3">
          <DialogTitle className="font-semibold text-base">Visualization Workspace</DialogTitle>

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
                <SelectTrigger className="h-7 cursor-pointer gap-1 rounded-full border-none pl-4 font-medium text-muted-foreground text-xs shadow-none transition-colors hover:bg-primary/20 hover:text-foreground focus:ring-0">
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
              className="h-8 w-8 cursor-pointer rounded-full text-muted-foreground hover:bg-primary/20 hover:text-foreground"
              title="Export CSV"
            >
              <Download size={13} />
            </Button>

            {/* Close — Minimize2 icon (shrink arrows pointing inward) */}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 cursor-pointer rounded-full text-muted-foreground hover:bg-primary/20 hover:text-foreground"
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
        <div className="flex-1 overflow-auto bg-background p-4">
          <PlotlyVisualizer
            data={data}
            visualizationType={visualizationType}
            theme={theme}
            expandedMode
            onChartTypesReady={(types, current, setCurrent) => {
              setChartSelector((prev) => {
                // Only update if something actually changed to avoid infinite loop
                if (prev?.current === current && prev.types.join(',') === types.join(','))
                  return prev;
                return { types, current, setCurrent };
              });
            }}
          />
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 bg-card px-6 py-2">
          <p className="text-center text-muted-foreground text-xs">
            {data.row_count.toLocaleString()} rows · {data.columns.length} columns · Scroll to zoom
            · Drag to pan
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VisualizationDialog;
