import React, { useEffect, useRef, Component, useState } from 'react';
import type { ErrorInfo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  FiDatabase,
  FiDownload,
  FiChevronDown,
  FiAlertTriangle,
} from 'react-icons/fi';
import { LiaFileMedicalAltSolid } from 'react-icons/lia';
import { Maximize2 } from 'lucide-react';
import PlotlyVisualizer from '@/components/Chat/PlotlyVisualizer';
import VisualizationDialog from '@/components/Chat/VisualizationDialog';
import { exportToCSV } from '@/utils/export';
import type { Message } from '@/App';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

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
        <div className="bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg p-4">
          <FiAlertTriangle />
          <div className="font-mono text-xs">
            Visualization Error: {this.state.error?.message}
          </div>
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
        <button className="group text-primary hover:text-foreground hover:bg-primary/20 mb-2 flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors select-none">
          <span>Show thinking</span>
          <FiChevronDown
            className={cn('transition-transform', isOpen && 'rotate-180')}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="animate-in fade-in-0 slide-in-from-top-1">
        <div className="border-subtle ml-6 space-y-2 border-l-2 pl-2">
          {thoughts.map((thought, idx) => (
            <div key={idx} className="thinking-process-text p-1">
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
  const [chartSelector, setChartSelector] = useState<ChartSelectorState | null>(
    null,
  );

  return (
    <Card className="mt-4 overflow-hidden">
      <CardHeader className="bg-muted/30 flex flex-row items-center justify-between px-4 py-2">
        {/* Left: label */}
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-muted-foreground shrink-0 text-xs font-bold tracking-wide uppercase">
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
            className="text-muted-foreground hover:bg-primary/20 hover:text-foreground h-8 w-8 cursor-pointer rounded-full"
          >
            <FiDownload size={13} />
          </Button>

          {/* Expand */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onExpand}
            className="text-muted-foreground hover:bg-primary/20 hover:text-foreground h-8 w-8 cursor-pointer rounded-full"
            title="Expand visualization"
          >
            <Maximize2 size={13} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="bg-card w-full p-0">
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

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  theme,
  onUpdateMessage,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);
  const lastMessage = messages[messages.length - 1];
  const lastMessageId = lastMessage?.id;
  const lastMessageText = lastMessage?.text;
  const lastMessageThoughtsCount = lastMessage?.thoughts?.length;

  // Scroll to bottom when messages are added or when the last message's content changes (streaming).
  // We specifically exclude visualization_type changes from the dependencies to prevent the UI
  // from jumping/scrolling when the user switches between chart types in an existing message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [
    messages.length,
    lastMessageId,
    lastMessageText,
    lastMessageThoughtsCount,
  ]);

  // Find the message whose visualization is expanded
  const expandedMsg = messages.find((m) => m.id === expandedMsgId);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center opacity-50">
        <div className="bg-muted text-primary mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <LiaFileMedicalAltSolid size={32} />
        </div>
        <h2 className="font-heading text-foreground mb-2 text-xl font-medium">
          How can I help you today?
        </h2>
        <p className="text-muted-foreground max-w-md">
          Ask about patient demographics, admission trends, or encounter analytics. I
          can visualize data and write SQL.
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
              className="animate-in fade-in-0 slide-in-from-bottom-2 group"
            >
              {/* ── User Message ── */}
              {msg.sender === 'user' ? (
                <div className="mb-6 flex justify-end">
                  <div className="bg-muted text-foreground max-w-full rounded-2xl rounded-tr-sm px-5 py-3 shadow-sm @sm:max-w-[80%]">
                    {msg.text}
                  </div>
                </div>
              ) : (
                /* ── Bot Message ── */
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="flex items-center gap-2">
                      {/* Avatar */}
                      <div className="from-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-tr to-primary text-white shadow-sm">
                        <LiaFileMedicalAltSolid size={16} />
                      </div>
                      {/* Sender Badge */}
                      <div className="flex h-8 items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="text-sm font-semibold"
                        >
                          Agent
                        </Badge>
                      </div>
                    </div>

                    {/* Thinking process */}
                    {msg.thoughts && (
                      <ThinkingProcess thoughts={msg.thoughts} />
                    )}

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
                          <button className="text-muted-foreground hover:text-foreground flex w-fit cursor-pointer items-center gap-1 text-xs transition-colors select-none">
                            <FiDatabase size={12} />
                            View SQL Query
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="bg-muted/50 mt-2 overflow-x-auto rounded-md p-3">
                            <code className="text-primary font-mono text-xs break-all whitespace-pre-wrap">
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
