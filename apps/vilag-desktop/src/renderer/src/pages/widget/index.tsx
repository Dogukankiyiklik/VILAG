import { useEffect, useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';

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

export default function WidgetPage() {
  const [status, setStatus] = useState<Status>('end');
  const [thinking, setThinking] = useState(false);
  const [lastMessage, setLastMessage] = useState<any | null>(null);

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
  }, []);

  const isRunning = status === 'running';

  const handlePlayPause = async () => {
    if (isRunning) {
      await window.vilagAPI?.pauseAgent();
    } else {
      await window.vilagAPI?.resumeAgent();
    }
  };

  const handleStop = async () => {
    await window.vilagAPI?.stopAgent();
    await window.vilagAPI?.clearHistory();
  };

  return (
    <div className="flex h-full w-full flex-col rounded-xl border bg-white/90 p-3 text-xs text-gray-700">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-tight text-gray-600">
          VILAG Agent
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
          {isRunning ? 'Running' : thinking ? 'Thinking' : 'Idle'}
        </span>
      </div>

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

      <div className="mt-auto flex justify-end gap-2 pt-2">
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
          onClick={handlePlayPause}
        >
          {isRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md border border-red-300 bg-white text-red-500 hover:bg-red-50"
          onClick={handleStop}
        >
          <Square className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

