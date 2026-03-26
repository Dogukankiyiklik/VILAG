import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCirclePlus, Square, Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';

import { Card } from '@renderer/components/ui/card';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Textarea } from '@renderer/components/ui/textarea';

declare global {
  interface Window {
    vilagAPI: any;
  }
}

export default function LocalPage() {
  const [status, setStatus] = useState<string>('end');
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [currentScreenshotIndex, setCurrentScreenshotIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Derive screenshots from messages - each conversation has screenshotBase64
  const screenshots = useMemo(() => {
    return messages
      .filter((msg: any) => msg?.screenshotBase64)
      .map((msg: any) => {
        const b64 = msg.screenshotBase64;
        // If already a data URI, use as-is; otherwise add prefix
        if (b64.startsWith('data:')) return b64;
        return `data:image/jpeg;base64,${b64}`;
      });
  }, [messages]);

  useEffect(() => {
    window.vilagAPI?.getState().then((state: any) => {
      if (state) {
        setStatus(state.status || 'end');
        setThinking(state.thinking || false);
        setMessages(state.messages || []);
        setErrorMsg(state.errorMsg);
      }
    });

    window.vilagAPI?.onStateUpdate((state: any) => {
      setStatus(state.status || 'end');
      setThinking(state.thinking || false);
      setMessages(state.messages || []);
      setErrorMsg(state.errorMsg);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking, errorMsg]);

  useEffect(() => {
    if (screenshots.length > 0) {
      setCurrentScreenshotIndex(screenshots.length - 1);
    }
  }, [screenshots.length]);

  const handleRun = async () => {
    if (!instruction.trim()) return;
    await window.vilagAPI?.setInstructions(instruction.trim());
    await window.vilagAPI?.runAgent();
  };

  const handleStop = async () => {
    await window.vilagAPI?.stopAgent();
  };

  const handlePauseResume = async () => {
    if (status === 'pause') {
      await window.vilagAPI?.resumeAgent();
    } else {
      await window.vilagAPI?.pauseAgent();
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'running':
        return 'Running';
      case 'pause':
        return 'Paused';
      case 'error':
        return 'Error';
      case 'max_loop':
        return 'Max Loops';
      case 'call_user':
        return 'Needs Intervention';
      default:
        return 'Idle';
    }
  };

  const isRunning = status === 'running';
  const isPaused = status === 'pause';

  const getDisplayText = (msg: any) => {
    if (!msg) return '';

    if (typeof msg === 'string') return msg;
    if (typeof msg.value === 'string') return msg.value;
    if (typeof msg.prediction === 'string') return msg.prediction;

    return '';
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Local Operator</span>
          <span className="text-xs text-muted-foreground">
            ({getStatusLabel()})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePauseResume}
            disabled={!isRunning && !isPaused}
          >
            {isPaused ? (
              <>
                <Play className="h-4 w-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleStop}
            disabled={!isRunning && !isPaused && !thinking}
          >
            <Square className="h-4 w-4" />
            Stop
          </Button>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={!instruction.trim() || thinking}
          >
            <Play className="h-4 w-4" />
            Run
          </Button>
        </div>
      </div>

      <div className="px-5 pb-5 flex flex-1 gap-5">
        <Card className="flex-1 basis-2/5 px-0 py-4 gap-4 h-[calc(100vh-76px)] flex flex-col">
          <div className="flex items-center justify-between w-full px-4 mb-2">
            <Button variant="outline" size="sm">
              <MessageCirclePlus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-3" ref={messagesEndRef}>
              {messages.length === 0 && (
                <div className="mt-10 text-sm text-muted-foreground">
                  No messages yet. Describe a task in the input below and press
                  Run.
                </div>
              )}

              {messages.map((msg, idx) => {
                const text = getDisplayText(msg);

                return (
                  <div key={idx} className="text-sm">
                    <div className="font-medium mb-1">
                      {msg?.from === 'human' ? 'User' : 'Agent'}
                    </div>
                    {text ? (
                      <div className="rounded-md bg-muted px-3 py-2 text-xs whitespace-pre-wrap">
                        {text}
                      </div>
                    ) : (
                      <div className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground italic">
                        [System action]
                      </div>
                    )}
                  </div>
                );
              })}

              {thinking && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Thinking...
                </div>
              )}
              {errorMsg && (
                <div className="mt-2 text-xs text-red-500 break-words">
                  {errorMsg}
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="px-4 pt-2">
            <Textarea
              placeholder="What can I do for you today?"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={thinking}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  handleRun();
                }
              }}
            />
          </div>
        </Card>

        <Card className="flex-1 basis-3/5 p-3 h-[calc(100vh-76px)] flex flex-col">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-sm font-medium">Screenshots</span>
            {screenshots.length > 0 && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentScreenshotIndex(Math.max(0, currentScreenshotIndex - 1))}
                  disabled={currentScreenshotIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs">{currentScreenshotIndex + 1} / {screenshots.length}</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setCurrentScreenshotIndex(Math.min(screenshots.length - 1, currentScreenshotIndex + 1))}
                  disabled={currentScreenshotIndex === screenshots.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex-1 mt-1 rounded-md border bg-muted overflow-hidden flex items-center justify-center">
            {screenshots.length > 0 ? (
              <img 
                src={screenshots[currentScreenshotIndex]} 
                alt="Agent screenshot" 
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-xs text-muted-foreground flex flex-col items-center gap-2">
                <span>No screenshots available yet.</span>
                <span>Run the agent to see progress.</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

