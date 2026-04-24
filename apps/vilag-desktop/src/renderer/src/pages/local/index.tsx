import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  MessageCirclePlus,
  Square,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Mic,
  MicOff,
} from 'lucide-react';

import { Card } from '@renderer/components/ui/card';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Textarea } from '@renderer/components/ui/textarea';
import { useDictation } from '@renderer/hooks/useDictation';

type DictationLang = 'tr-TR' | 'en-US';
type DictationQuality = 'fast' | 'balanced' | 'accurate';

const WHISPER_MODEL_BY_QUALITY: Record<DictationQuality, string> = {
  fast: 'Xenova/whisper-tiny',
  balanced: 'Xenova/whisper-base',
  accurate: 'Xenova/whisper-small',
};

const QUALITY_LABELS: Record<DictationQuality, string> = {
  fast: 'Hızlı',
  balanced: 'Dengeli',
  accurate: 'Doğru',
};

declare global {
  interface Window {
    vilagAPI: any;
  }
}

interface ActionInfo {
  action: string;
  x?: number;
  y?: number;
  /** true → koordinatlar ham piksel (screenshot boyutuna göre %), false → 0-1000 normalize */
  isRawPixel?: boolean;
}

/**
 * Mesajdan aksiyon ve koordinat bilgisi çıkarır.
 *
 * Önce predictionParsed (SDK'nın yapılandırılmış çıktısı) kontrol edilir,
 * bulamazsa prediction text'inden regex ile parse edilir.
 */
function extractAction(msg: any): ActionInfo | null {
  // 1) SDK'nın ayrıştırılmış verisini kullan (en güvenilir kaynak)
  const parsed = msg?.predictionParsed;
  if (parsed?.action_type) {
    const inputs = parsed.action_inputs || {};
    const box = inputs.start_box || inputs.point || inputs.start_point;

    if (box && typeof box.x === 'number' && typeof box.y === 'number') {
      return {
        action: parsed.action_type,
        x: box.x,
        y: box.y,
        isRawPixel: !!box.isRawPixel,
      };
    }

    // Koordinatsız aksiyon (type, wait, hotkey vb.)
    return { action: parsed.action_type };
  }

  // 2) Fallback: ham metin parse
  const text = msg?.prediction || msg?.value || (typeof msg === 'string' ? msg : '');
  if (!text) return null;

  const actionLine = text.match(/Action:\s*(.+)/s)?.[1]?.trim() || text;

  // start_box='(x,y)' — marker'lı veya marker'sız
  const boxMatch = actionLine.match(
    /^(\w+)\(.*?start_box\s*=\s*['"]?\s*(?:<\|box_start\|>)?\(\s*(\d+)\s*,\s*(\d+)\s*\)(?:<\|box_end\|>)?/
  );
  if (boxMatch) {
    const hasMarkers = actionLine.includes('<|box_start|>');
    return {
      action: boxMatch[1],
      x: parseInt(boxMatch[2], 10),
      y: parseInt(boxMatch[3], 10),
      // Marker yoksa SDK raw pixel olarak işaretliyor
      isRawPixel: !hasMarkers,
    };
  }

  // action([x1, y1, x2, y2]) — merkez
  const arrMatch = actionLine.match(
    /^(\w+)\(.*?\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/
  );
  if (arrMatch) {
    return {
      action: arrMatch[1],
      x: Math.round((parseInt(arrMatch[2], 10) + parseInt(arrMatch[4], 10)) / 2),
      y: Math.round((parseInt(arrMatch[3], 10) + parseInt(arrMatch[5], 10)) / 2),
      isRawPixel: false,
    };
  }

  // action(<point>x y</point>)
  const ptMatch = actionLine.match(
    /^(\w+)\(.*?<point>\s*(\d+)\s+(\d+)\s*<\/point>/
  );
  if (ptMatch) {
    return {
      action: ptMatch[1],
      x: parseInt(ptMatch[2], 10),
      y: parseInt(ptMatch[3], 10),
      isRawPixel: false,
    };
  }

  // Koordinatsız aksiyonlar
  const noCoordMatch = actionLine.match(
    /^(type|hotkey|navigate|navigate_back|wait|finished|call_user|scroll)\s*\(/
  );
  if (noCoordMatch) {
    return { action: noCoordMatch[1] };
  }

  return null;
}

/**
 * Koordinatları CSS yüzdesine çevirir.
 * - isRawPixel → resmin doğal boyutuna göre oran
 * - normalize (0-1000) → coord / 10
 */
function toPercent(
  coord: number,
  imgDim: number,
  isRawPixel: boolean,
): number {
  if (isRawPixel && imgDim > 0) {
    return (coord / imgDim) * 100;
  }
  return coord / 10;
}

export default function LocalPage() {
  const [status, setStatus] = useState<string>('end');
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [currentScreenshotIndex, setCurrentScreenshotIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [dictationLang, setDictationLang] = useState<DictationLang>('tr-TR');
  const [dictationQuality, setDictationQuality] = useState<DictationQuality>('balanced');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleFinalSpeech = useCallback((text: string) => {
    setInstruction((prev) => {
      const trimmed = prev.trimEnd();
      if (!trimmed) return text;
      const needsSpace = !/[\s]$/.test(prev);
      return `${prev}${needsSpace ? ' ' : ''}${text}`;
    });
  }, []);

  const {
    engine: sttEngine,
    isSupported: isSTTSupported,
    isListening,
    isTranscribing,
    isModelLoading,
    modelProgress,
    interimTranscript,
    error: sttError,
    engineNotice,
    toggle: toggleDictation,
    stop: stopDictation,
    reset: resetDictation,
  } = useDictation({
    lang: dictationLang,
    preferredEngine: 'auto',
    whisperModel: WHISPER_MODEL_BY_QUALITY[dictationQuality],
    onFinalResult: handleFinalSpeech,
  });

  const screenshots = useMemo(() => {
    return messages
      .filter((msg: any) => msg?.screenshotBase64)
      .map((msg: any) => {
        const b64 = msg.screenshotBase64;
        const src = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
        const actionInfo = extractAction(msg);
        return { src, actionInfo };
      });
  }, [messages]);

  const handleImgLoad = useCallback(() => {
    if (imgRef.current) {
      setImgSize({
        w: imgRef.current.naturalWidth,
        h: imgRef.current.naturalHeight,
      });
    }
  }, []);

  useEffect(() => {
    window.vilagAPI?.getState().then((state: any) => {
      if (state) {
        setStatus(state.status || 'end');
        setThinking(state.thinking || false);
        setMessages(state.messages || []);
        setErrorMsg(state.errorMsg);
        setInstruction(state.instructions || '');
      }
    });

    window.vilagAPI?.onStateUpdate((state: any) => {
      setStatus(state.status || 'end');
      setThinking(state.thinking || false);
      setMessages(state.messages || []);
      setErrorMsg(state.errorMsg);
      setInstruction(state.instructions || '');
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

  useEffect(() => {
    setImgSize(null);
  }, [currentScreenshotIndex]);

  const handleRun = async () => {
    if (!instruction.trim()) return;
    if (isListening) stopDictation();
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

  const handleNewChat = async () => {
    // Aktif bir çalışma varsa temiz başlangıç için önce durdur.
    if (isRunning || isPaused || thinking) {
      await window.vilagAPI?.stopAgent();
    }
    if (isListening) stopDictation();
    resetDictation();
    await window.vilagAPI?.createSession();
    setInstruction('');
    setCurrentScreenshotIndex(0);
    setImgSize(null);
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'running': return 'Running';
      case 'pause': return 'Paused';
      case 'error': return 'Error';
      case 'max_loop': return 'Max Loops';
      case 'call_user': return 'Needs Intervention';
      default: return 'Idle';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running': return 'bg-primary';
      case 'pause': return 'bg-ring';
      case 'error':
      case 'max_loop': return 'bg-destructive';
      case 'call_user': return 'bg-chart-4';
      default: return 'bg-muted-foreground/40';
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

  const currentShot = screenshots[currentScreenshotIndex];
  const hasCoords = currentShot?.actionInfo?.x !== undefined && currentShot?.actionInfo?.y !== undefined;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Local Operator</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${getStatusColor()} ${isRunning ? 'animate-pulse' : ''}`} />
            {getStatusLabel()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePauseResume} disabled={!isRunning && !isPaused}>
            {isPaused ? <><Play className="h-4 w-4" />Resume</> : <><Pause className="h-4 w-4" />Pause</>}
          </Button>
          <Button variant="outline" size="sm" onClick={handleStop} disabled={!isRunning && !isPaused && !thinking}>
            <Square className="h-4 w-4" />Stop
          </Button>
          <Button size="sm" onClick={handleRun} disabled={!instruction.trim() || thinking}>
            <Play className="h-4 w-4" />Run
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-1 gap-5 min-h-0">
        {/* Chat panel */}
        <Card className="flex-1 basis-2/5 px-0 py-4 gap-4 shadow-none flex flex-col min-h-0">
          <div className="flex items-center justify-between w-full px-4 mb-2">
            <Button variant="outline" size="sm" onClick={handleNewChat}>
              <MessageCirclePlus className="h-4 w-4" />
              New Chat
            </Button>
          </div>
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-4" ref={messagesEndRef}>
              {messages.length === 0 && (
                <div className="mt-10 text-sm text-muted-foreground text-center">
                  No messages yet. Describe a task in the input below and press Run.
                </div>
              )}
              {messages.map((msg, idx) => {
                const text = getDisplayText(msg);
                const isHuman = msg?.from === 'human';
                return (
                  <div key={idx} className="text-sm">
                    <div className={`font-medium mb-1.5 text-xs tracking-wide uppercase ${isHuman ? 'text-primary' : 'text-muted-foreground'}`}>
                      {isHuman ? 'User' : 'Agent'}
                    </div>
                    {text ? (
                      <div className={`rounded-lg px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${isHuman ? 'bg-primary/10 text-foreground' : 'bg-muted text-foreground'}`}>
                        {text}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-muted/50 px-3.5 py-2.5 text-[11px] text-muted-foreground italic">
                        [System action]
                      </div>
                    )}
                  </div>
                );
              })}
              {thinking && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:0.3s]" />
                  </span>
                  Thinking...
                </div>
              )}
              {errorMsg && (
                <div className="mt-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive break-words">
                  {errorMsg}
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="px-4 pt-2 space-y-2">
            <div className="relative">
              <Textarea
                placeholder={
                  isListening
                    ? dictationLang === 'tr-TR'
                      ? 'Dinleniyor... konuşun'
                      : 'Listening... speak now'
                    : 'What can I do for you today?'
                }
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={thinking}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleRun();
                  }
                }}
                className="pr-12"
              />
              <Button
                type="button"
                size="icon"
                variant={isListening ? 'default' : 'outline'}
                onClick={toggleDictation}
                disabled={!isSTTSupported || thinking || isTranscribing || isModelLoading}
                title={
                  !isSTTSupported
                    ? 'Sesli dikte bu ortamda desteklenmiyor'
                    : isListening
                      ? 'Dinlemeyi durdur'
                      : isModelLoading
                        ? `Model yükleniyor (%${Math.round(modelProgress)})`
                        : isTranscribing
                          ? 'Transkribe ediliyor...'
                          : `Sesli dikte başlat (${sttEngine === 'whisper' ? 'Whisper' : 'Web Speech'})`
                }
                className={`absolute right-2 bottom-2 h-8 w-8 ${isListening ? 'animate-pulse' : ''}`}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDictationLang('tr-TR')}
                    className={`px-2 py-0.5 rounded-sm transition-colors ${
                      dictationLang === 'tr-TR'
                        ? 'bg-background shadow-sm font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    aria-pressed={dictationLang === 'tr-TR'}
                  >
                    TR
                  </button>
                  <button
                    type="button"
                    onClick={() => setDictationLang('en-US')}
                    className={`px-2 py-0.5 rounded-sm transition-colors ${
                      dictationLang === 'en-US'
                        ? 'bg-background shadow-sm font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    aria-pressed={dictationLang === 'en-US'}
                  >
                    EN
                  </button>
                </div>

                <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-[11px]">
                  {(['fast', 'balanced', 'accurate'] as DictationQuality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setDictationQuality(q)}
                      disabled={isListening || isTranscribing || isModelLoading}
                      title={
                        q === 'fast'
                          ? 'Hızlı (tiny, ~40MB) — az doğru'
                          : q === 'balanced'
                            ? 'Dengeli (base, ~140MB) — önerilen'
                            : 'Doğru (small, ~470MB) — en iyi doğruluk'
                      }
                      className={`px-2 py-0.5 rounded-sm transition-colors disabled:opacity-40 ${
                        dictationQuality === q
                          ? 'bg-background shadow-sm font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      aria-pressed={dictationQuality === q}
                    >
                      {QUALITY_LABELS[q]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-w-0 text-[11px] text-muted-foreground truncate">
                {sttError ? (
                  <span className="text-destructive">{sttError}</span>
                ) : isModelLoading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    Whisper modeli indiriliyor... %{Math.round(modelProgress)}
                  </span>
                ) : isTranscribing ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    {dictationLang === 'tr-TR' ? 'Metne dönüştürülüyor...' : 'Transcribing...'}
                  </span>
                ) : isListening && interimTranscript ? (
                  <span className="italic">{interimTranscript}</span>
                ) : isListening ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                    {dictationLang === 'tr-TR' ? 'Dinleniyor' : 'Listening'}
                    <span className="text-muted-foreground/60">
                      · {sttEngine === 'whisper' ? 'Whisper' : 'Web Speech'}
                    </span>
                  </span>
                ) : engineNotice ? (
                  <span className="text-muted-foreground/80">{engineNotice}</span>
                ) : !isSTTSupported ? (
                  <span>Sesli dikte bu ortamda desteklenmiyor.</span>
                ) : (
                  <span className="text-muted-foreground/60">
                    {sttEngine === 'whisper' ? 'Whisper (yerel)' : 'Web Speech'} · hazır
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Screenshot panel */}
        <Card className="flex-1 basis-3/5 p-3 shadow-none flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 px-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Screenshots</span>
              {currentShot?.actionInfo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  {currentShot.actionInfo.action}
                  {hasCoords && (
                    <span className="text-destructive/60 ml-0.5">
                      ({currentShot.actionInfo.x}, {currentShot.actionInfo.y})
                    </span>
                  )}
                </span>
              )}
            </div>
            {screenshots.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCurrentScreenshotIndex(Math.max(0, currentScreenshotIndex - 1))}
                  disabled={currentScreenshotIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {currentScreenshotIndex + 1} / {screenshots.length}
                </span>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setCurrentScreenshotIndex(Math.min(screenshots.length - 1, currentScreenshotIndex + 1))}
                  disabled={currentScreenshotIndex === screenshots.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex-1 mt-1 rounded-lg border bg-muted/50 overflow-hidden flex items-center justify-center">
            {screenshots.length > 0 ? (
              <div className="relative inline-block max-w-full max-h-full">
                <img
                  ref={imgRef}
                  src={currentShot.src}
                  alt="Agent screenshot"
                  className="block max-w-full max-h-[calc(100vh-220px)]"
                  onLoad={handleImgLoad}
                />
                {/* Koordinatlı aksiyon overlay */}
                {hasCoords && imgSize && (() => {
                  const ai = currentShot.actionInfo!;
                  const raw = ai.isRawPixel ?? false;
                  const pctX = toPercent(ai.x!, imgSize.w, raw);
                  const pctY = toPercent(ai.y!, imgSize.h, raw);

                  return (
                    <div
                      className="absolute z-10 pointer-events-none flex flex-col items-center"
                      style={{
                        left: `${pctX}%`,
                        top: `${pctY}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <div className="absolute h-6 w-6 rounded-full border-2 border-destructive/50 animate-ping" />
                      <div className="h-3.5 w-3.5 rounded-full bg-destructive shadow-[0_0_0_2px_rgba(255,255,255,0.9)]" />
                      <span className="mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-destructive text-white shadow-md whitespace-nowrap">
                        {ai.action}
                      </span>
                    </div>
                  );
                })()}
                {/* Koordinatsız aksiyon badge */}
                {currentShot.actionInfo && !hasCoords && (
                  <div className="absolute top-2 left-2 z-10 pointer-events-none">
                    <span className="px-2 py-1 rounded-md text-[10px] font-semibold bg-destructive/90 text-white shadow-md">
                      {currentShot.actionInfo.action}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground flex flex-col items-center gap-1.5">
                <span>No screenshots available yet.</span>
                <span className="text-muted-foreground/60">Run the agent to see progress.</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
