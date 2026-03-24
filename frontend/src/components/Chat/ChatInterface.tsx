import { Maximize2 } from 'lucide-react';
import type { ErrorInfo } from 'react';
import React, { Component, useEffect, useRef, useState } from 'react';
import { FiAlertTriangle, FiChevronDown, FiDatabase, FiDownload } from 'react-icons/fi';
import { LiaFileMedicalAltSolid } from 'react-icons/lia';
import ReactMarkdown from 'react-markdown';
import type { Message } from '@/App';
import PlotlyVisualizer from '@/components/Chat/PlotlyVisualizer';
import VisualizationDialog from '@/components/Chat/VisualizationDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { exportToCSV } from '@/utils/export';

// ── Error Boundary ──────────────────────────────────────────────────────────

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Visualizer Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-destructive">
          <FiAlertTriangle />
          <div className="font-mono text-xs">Visualization Error: {this.state.error?.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── ThinkingProcess ─────────────────────────────────────────────────────────

interface ChatInterfaceProps {
  messages: Message[];
  theme: 'light' | 'dark' | 'clinical-slate' | 'system';
  onUpdateMessage?: (id: string, updates: Partial<Message>) => void;
}

const ThinkingProcess: React.FC<{ thoughts: string[] }> = ({ thoughts }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  if (!thoughts || thoughts.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-3">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group mb-2 flex cursor-pointer select-none items-center gap-2 rounded-full px-4 py-2 font-medium text-primary text-sm transition-colors hover:bg-primary/20 hover:text-foreground"
        >
          <span>Show thinking</span>
          <FiChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="fade-in-0 slide-in-from-top-1 animate-in">
        <div className="ml-6 space-y-2 border-subtle border-l-2 pl-2">
          {thoughts.map((thought) => (
            <div key={thought} className="thinking-process-text p-1">
              {thought}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ── Chart selector state for inline card header ──────────────────────────────

interface ChartSelectorState {
  types: string[];
  current: string;
  setCurrent: (t: string) => void;
}

// ── VisualizationCard ────────────────────────────────────────────────────────

interface VisualizationCardProps {
  msg: Message;
  theme: ChatInterfaceProps['theme'];
  onExpand: () => void;
  onUpdateMessage?: ChatInterfaceProps['onUpdateMessage'];
}

const VisualizationCard: React.FC<VisualizationCardProps> = ({
  msg,
  theme,
  onExpand,
  onUpdateMessage,
}) => {
  const [chartSelector, setChartSelector] = useState<ChartSelectorState | null>(null);

  return (
    <Card className="mt-4 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between bg-muted/30 px-4 py-2">
        {/* Left: label */}
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 font-bold text-muted-foreground text-xs uppercase tracking-wide">
            Visualization
          </span>
        </div>

        {/* Right: actions (Reordered: Dropdown -> Export -> Expand) */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Chart type selector — only shown when multiple types are available */}
          {chartSelector && chartSelector.types.length > 1 && (
            <Select
              value={chartSelector.current}
              onValueChange={(newType) => {
                chartSelector.setCurrent(newType);
                onUpdateMessage?.(msg.id, { visualization_type: newType });
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

          {/* Export CSV */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              exportToCSV(
                msg.data?.data as Record<string, unknown>[],
                msg.data?.columns as string[],
                `mediquery-${timestamp}`,
              );
            }}
            title="Export CSV"
            className="h-8 w-8 cursor-pointer rounded-full text-muted-foreground hover:bg-primary/20 hover:text-foreground"
          >
            <FiDownload size={13} />
          </Button>

          {/* Expand */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onExpand}
            className="h-8 w-8 cursor-pointer rounded-full text-muted-foreground hover:bg-primary/20 hover:text-foreground"
            title="Expand visualization"
          >
            <Maximize2 size={13} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="w-full bg-card p-0">
        <ErrorBoundary>
          <PlotlyVisualizer
            data={
              msg.data as {
                columns: string[];
                data: unknown[];
                row_count: number;
              }
            }
            visualizationType={msg.visualization_type ?? 'table'}
            theme={theme}
            onChartTypesReady={(types, current, setCurrent) => {
              setChartSelector({ types, current, setCurrent });
            }}
          />
        </ErrorBoundary>
      </CardContent>
    </Card>
  );
};

// ── ChatInterface ───────────────────────────────────────────────────────────

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, theme, onUpdateMessage }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  // Find the message whose visualization is expanded
  const expandedMsg = messages.find((m) => m.id === expandedMsgId);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center opacity-50">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-primary">
          <LiaFileMedicalAltSolid size={32} />
        </div>
        <h2 className="mb-2 font-heading font-medium text-foreground text-xl">
          How can I help you today?
        </h2>
        <p className="max-w-md text-muted-foreground">
          Ask about patient demographics, admission trends, or encounter analytics. I can visualize
          data and write SQL.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Full-screen visualization dialog */}
      {expandedMsg?.data && (
        <VisualizationDialog
          open={!!expandedMsgId}
          onOpenChange={(open) => !open && setExpandedMsgId(null)}
          data={
            expandedMsg.data as {
              columns: string[];
              data: unknown[];
              row_count: number;
            }
          }
          visualizationType={expandedMsg.visualization_type ?? 'table'}
          theme={theme}
          onVisualizationTypeChange={(newType) => {
            if (expandedMsgId) {
              onUpdateMessage?.(expandedMsgId, { visualization_type: newType });
            }
          }}
        />
      )}

      <div className="custom-scrollbar @container relative flex-1 overflow-y-auto scroll-smooth py-6">
        <div className="mx-auto max-w-4xl space-y-8 px-4 pb-12">
          {messages.map((msg) => (
            <div
              key={msg.id}
              id={msg.id}
              className="fade-in-0 slide-in-from-bottom-2 group animate-in"
            >
              {/* ── User Message ── */}
              {msg.sender === 'user' ? (
                <div className="mb-6 flex justify-end">
                  <div className="@sm:max-w-[80%] max-w-full rounded-2xl rounded-tr-sm bg-muted px-5 py-3 text-foreground shadow-sm">
                    {msg.text}
                  </div>
                </div>
              ) : (
                /* ── Bot Message ── */
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="flex items-center gap-2">
                      {/* Avatar */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-tr from-primary to-primary text-white shadow-sm">
                        <LiaFileMedicalAltSolid size={16} />
                      </div>
                      {/* Sender Badge */}
                      <div className="flex h-8 items-center gap-2">
                        <Badge variant="secondary" className="font-semibold text-sm">
                          Agent
                        </Badge>
                      </div>
                    </div>

                    {/* Thinking process */}
                    {msg.thoughts && <ThinkingProcess thoughts={msg.thoughts} />}

                    {/* Text Content */}
                    <div className="prose prose-sm dark:prose-invert chat-message-text max-w-none pl-2">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>

                    {/* ── Visualization Card (Phase 6 + chart selector) ── */}
                    {msg.data && (
                      <VisualizationCard
                        msg={msg}
                        theme={theme}
                        onExpand={() => setExpandedMsgId(msg.id)}
                        onUpdateMessage={onUpdateMessage}
                      />
                    )}

                    {/* ── SQL Trace ── */}
                    {msg.sql && (
                      <Collapsible className="mt-2">
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="flex w-fit cursor-pointer select-none items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
                          >
                            <FiDatabase size={12} />
                            View SQL Query
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 overflow-x-auto rounded-md bg-muted/50 p-3">
                            <code className="whitespace-pre-wrap break-all font-mono text-primary text-xs">
                              {msg.sql}
                            </code>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </>
  );
};

export default ChatInterface;
