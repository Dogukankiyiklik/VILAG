import { useEffect, useRef, useState } from 'react';
import { MessageCirclePlus, Square, Play } from 'lucide-react';

import { Card } from '@renderer/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@renderer/components/ui/tabs';
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleRun = async () => {
    if (!instruction.trim()) return;
    await window.vilagAPI?.setInstructions(instruction.trim());
    await window.vilagAPI?.runAgent();
  };

  const handleStop = async () => {
    await window.vilagAPI?.stopAgent();
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
            onClick={handleStop}
            disabled={!isRunning && !thinking}
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
                      <div className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                        Full details available in the \"Raw Messages\" tab.
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
          <Tabs defaultValue="screenshot" className="flex-1 flex flex-col">
            <TabsList>
              <TabsTrigger value="screenshot">Screenshot</TabsTrigger>
              <TabsTrigger value="raw">Raw Messages</TabsTrigger>
            </TabsList>
            <TabsContent value="screenshot" className="flex-1 mt-3">
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground border rounded-md">
                Screenshot gallery will be implemented here.
              </div>
            </TabsContent>
            <TabsContent value="raw" className="flex-1 mt-3">
              <ScrollArea className="h-full rounded-md border px-2 py-1">
                <pre className="text-[11px] whitespace-pre-wrap">
                  {JSON.stringify(messages, null, 2)}
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

