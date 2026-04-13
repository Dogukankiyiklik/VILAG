import { useEffect, useState } from 'react';
import { Pause, Play, Square, Check, X } from 'lucide-react';

declare global {
  interface Window {
    vilagAPI: any;
  }
}

type Status =
  | 'end'
  | 'running'
  | 'pause'
  | 'error'
  | 'max_loop'
  | 'call_user'
  | string;

interface ApprovalRequest {
  subtaskId: number;
  description: string;
  riskLevel: string;
}

export default function WidgetPage() {
  const [status, setStatus] = useState<Status>('end');
  const [thinking, setThinking] = useState(false);
  const [lastMessage, setLastMessage] = useState<any | null>(null);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    window.vilagAPI?.getState().then((state: any) => {
      if (state) {
        setStatus(state.status || 'end');
        setThinking(state.thinking || false);
        if (state.messages?.length) {
          setLastMessage(state.messages[state.messages.length - 1]);
        }
      }
    });

    window.vilagAPI?.onStateUpdate((state: any) => {
      setStatus(state.status || 'end');
      setThinking(state.thinking || false);
      if (state.messages?.length) {
        setLastMessage(state.messages[state.messages.length - 1]);
      }
    });

    window.vilagAPI?.onApprovalRequest((request: ApprovalRequest) => {
      setApproval(request);
    });
  }, []);

  const isRunning = status === 'running';
  const isPaused = status === 'pause';

  const handlePlayPause = async () => {
    if (isPaused) {
      await window.vilagAPI?.resumeAgent();
    } else if (isRunning) {
      await window.vilagAPI?.pauseAgent();
    }
  };

  const handleStop = async () => {
    await window.vilagAPI?.stopAgent();
    await window.vilagAPI?.clearHistory();
    setApproval(null);
  };

  const handleApprove = async () => {
    await window.vilagAPI?.respondApproval(true);
    setApproval(null);
  };

  const handleReject = async () => {
    await window.vilagAPI?.respondApproval(false);
    setApproval(null);
  };

  const getStatusLabel = () => {
    if (approval) return 'Awaiting Approval';
    if (isRunning) return 'Running';
    if (isPaused) return 'Paused';
    if (thinking) return 'Thinking';
    return 'Idle';
  };

  const getStatusDot = () => {
    if (approval) return 'bg-chart-4';
    if (isRunning) return 'bg-primary animate-pulse';
    if (isPaused) return 'bg-ring';
    if (thinking) return 'bg-primary animate-pulse';
    return 'bg-muted-foreground/40';
  };

  return (
    <div className="flex h-full w-full flex-col rounded-xl border border-border bg-card/95 backdrop-blur-sm p-3 text-xs text-card-foreground">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-tight text-foreground">
          VILAG Agent
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${getStatusDot()}`} />
          {getStatusLabel()}
        </span>
      </div>

      {approval ? (
        <div className="mb-2 flex flex-col gap-2 rounded-lg border border-chart-4/30 bg-chart-4/5 p-2.5">
          <div className="text-[11px] font-semibold text-foreground">
            Approval Required
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            {approval.description}
          </div>
          <div className="text-[10px] text-muted-foreground/70">
            Risk: {approval.riskLevel}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-primary/30 bg-primary/10 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
              onClick={handleApprove}
            >
              <Check className="h-3 w-3" />
              Approve
            </button>
            <button
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 py-1.5 text-[11px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
              onClick={handleReject}
            >
              <X className="h-3 w-3" />
              Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-2 h-20 overflow-hidden text-[11px] text-muted-foreground">
          {lastMessage ? (
            <pre className="whitespace-pre-wrap font-mono">
              {JSON.stringify(lastMessage.predictionParsed ?? lastMessage, null, 2)}
            </pre>
          ) : (
            <p className="text-[11px] text-muted-foreground/60">
              The agent&apos;s latest thoughts and actions will appear here.
            </p>
          )}
        </div>
      )}

      <div className="mt-auto flex justify-end gap-2 pt-2 border-t border-border/60">
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40 transition-colors"
          onClick={handlePlayPause}
          disabled={(!isRunning && !isPaused) || !!approval}
        >
          {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md border border-destructive/30 bg-card text-destructive hover:bg-destructive/10 disabled:opacity-40 transition-colors"
          onClick={handleStop}
          disabled={!isRunning && !isPaused && !approval}
        >
          <Square className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
