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

    // Listen for approval requests
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

  return (
    <div className="flex h-full w-full flex-col rounded-xl border bg-white/90 p-3 text-xs text-gray-700">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-tight text-gray-600">
          VILAG Agent
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
          {approval ? 'Awaiting Approval' : isRunning ? 'Running' : isPaused ? 'Paused' : thinking ? 'Thinking' : 'Idle'}
        </span>
      </div>

      {/* Approval Dialog */}
      {approval ? (
        <div className="mb-2 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-2">
          <div className="text-[11px] font-semibold text-amber-800">
            Approval Required
          </div>
          <div className="text-[11px] text-amber-700">
            {approval.description}
          </div>
          <div className="text-[10px] text-amber-500">
            Risk: {approval.riskLevel}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-green-400 bg-green-50 py-1.5 text-[11px] font-medium text-green-700 hover:bg-green-100"
              onClick={handleApprove}
            >
              <Check className="h-3 w-3" />
              Approve
            </button>
            <button
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-red-300 bg-red-50 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-100"
              onClick={handleReject}
            >
              <X className="h-3 w-3" />
              Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-2 h-20 overflow-hidden text-[11px] text-gray-600">
          {lastMessage ? (
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(lastMessage.predictionParsed ?? lastMessage, null, 2)}
            </pre>
          ) : (
            <p className="text-[11px] text-gray-400">
              The agent&apos;s latest thoughts and actions will appear here.
            </p>
          )}
        </div>
      )}

      <div className="mt-auto flex justify-end gap-2 pt-2">
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
          onClick={handlePlayPause}
          disabled={(!isRunning && !isPaused) || !!approval}
        >
          {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md border border-red-300 bg-white text-red-500 hover:bg-red-50 disabled:opacity-40"
          onClick={handleStop}
          disabled={!isRunning && !isPaused && !approval}
        >
          <Square className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
