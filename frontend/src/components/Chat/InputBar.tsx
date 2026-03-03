import React, { useState, useRef, type KeyboardEvent } from 'react';
import { FiSend } from 'react-icons/fi';
import { Loader2, Zap, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface InputBarProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop?: () => void;
  agentMode: 'fast' | 'multi-agent';
  setAgentMode: (mode: 'fast' | 'multi-agent') => void;
  models: Array<{ id: string; name: string }>;
  selectedModel: string;
  setSelectedModel: (id: string) => void;
}

const AGENT_MODES = [
  {
    value: 'fast',
    label: 'Fast',
    icon: Zap,
    emoji: '⚡',
    tooltip: 'Fast Mode: Straightshot execution. Lowest cost & latency.',
  },
  {
    value: 'multi-agent',
    label: 'Multi-Agent',
    icon: Cpu,
    emoji: '🤖',
    tooltip: 'Multi-Agent: Full orchestration. Highest capability.',
  },
] as const;

const InputBar: React.FC<InputBarProps> = ({
  onSend,
  isLoading,
  agentMode,
  setAgentMode,
  models,
  selectedModel,
  setSelectedModel,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (input.trim() && !isLoading) {
      onSend(input);
      setInput('');
      // Reset height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-6">
      {/* Input container */}
      <div
        className={cn(
          'bg-card flex flex-col gap-2 rounded-2xl px-5 py-3 shadow-sm',
          isLoading && 'opacity-80',
        )}
      >
        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask Mediquery..."
          rows={1}
          className={cn(
            'max-h-50 min-h-7 resize-none border-none bg-inherit shadow-none',
            'text-foreground placeholder:text-muted-foreground p-1 text-base focus-visible:ring-0',
          )}
          style={{ height: 'auto', background: 'inherit' }}
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between bg-transparent pt-1">
          {/* Left: Model + Agent Mode */}
          <div className="flex items-center gap-2">
            {/* Model selector */}
            {models.length > 0 && (
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="text-muted-foreground hover:bg-primary/20 hover:text-foreground h-7 w-auto max-w-40 cursor-pointer rounded-full border-none pl-4 text-xs font-medium shadow-none transition-colors focus:ring-0">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Separator orientation="vertical" className="h-4" />

            {/* Agent mode toggle group */}
            <ToggleGroup
              type="single"
              value={agentMode}
              onValueChange={(v) => {
                if (v) setAgentMode(v as typeof agentMode);
              }}
              className="gap-0.5"
              style={{ background: 'inherit' }}
            >
              {AGENT_MODES.map(({ value, label, emoji, tooltip }) => (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem
                      value={value}
                      aria-label={label}
                      className={cn(
                        'text-muted-foreground hover:bg-primary/20 hover:text-foreground h-7',
                        'cursor-pointer bg-transparent px-2 text-xs transition-colors',
                        agentMode === value &&
                          'bg-primary/20 text-primary ring-primary/20 ring-1',
                      )}
                    >
                      {emoji}
                      {label}
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="max-w-50 text-center text-xs"
                  >
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
          </div>

          {/* Right: Send button */}
          <Button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            size="icon"
            className={cn(
              'h-8 w-8 cursor-pointer rounded-full',
              input.trim() && !isLoading
                ? 'shadow-md hover:scale-105'
                : 'opacity-50',
            )}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FiSend size={15} />
            )}
          </Button>
        </div>
      </div>

      {/* Footer */}
      <p className="text-muted-foreground mt-2 text-center text-[10px]">
        Mediquery can make mistakes. Use with professional verification.
      </p>
    </div>
  );
};

export default InputBar;
