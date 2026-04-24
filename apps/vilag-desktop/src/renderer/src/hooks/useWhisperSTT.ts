import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Electron içinde çalışan, tamamen yerel bir Speech-to-Text hook'u.
 *
 * Tasarım:
 * - `navigator.mediaDevices.getUserMedia` ile mikrofondan ses alır.
 * - `MediaRecorder` ile ses parçası (webm/opus) olarak kaydeder.
 * - Kayıt bitince Blob → Float32Array'e çözümlenip 16kHz mono'ya çevrilir.
 * - `@xenova/transformers` üzerinden Whisper modeliyle transkripsiyon yapılır.
 *
 * Neden Web Speech API değil?
 * Electron'un paketlenmiş Chromium'unda Google Speech API anahtarı yoktur;
 * bu nedenle `webkitSpeechRecognition` sessizce reddedilir. Transformers.js
 * tamamen cihaz üzerinde çalışır; ilk kullanımda küçük bir model indirir
 * (~40 MB / whisper-tiny) ve sonrasında offline çalışır.
 */

// Varsayılan model; daha iyi doğruluk için 'Xenova/whisper-base' (~140MB) tercih edilebilir.
const DEFAULT_MODEL = 'Xenova/whisper-tiny';
const TARGET_SAMPLE_RATE = 16000;

// Whisper dil kodları BCP-47 değil, İngilizce dil isimleridir.
const LANG_MAP: Record<string, string> = {
  'tr-TR': 'turkish',
  tr: 'turkish',
  'en-US': 'english',
  'en-GB': 'english',
  en: 'english',
};

function toWhisperLang(lang: string): string {
  return LANG_MAP[lang] ?? 'english';
}

type TranscriberFn = (
  audio: Float32Array,
  opts: Record<string, unknown>,
) => Promise<{ text: string }>;

let transcriberPromise: Promise<TranscriberFn> | null = null;

async function getTranscriber(
  model: string,
  onProgress?: (ratio: number) => void,
): Promise<TranscriberFn> {
  if (transcriberPromise) return transcriberPromise;

  transcriberPromise = (async () => {
    const mod = await import('@xenova/transformers');
    // Uzaktan (HF Hub) model yüklemeye izin ver, yerel aramaları kapat.
    mod.env.allowLocalModels = false;
    mod.env.allowRemoteModels = true;
    // Tarayıcı önbelleğini kullan (IndexedDB üzerinden).
    mod.env.useBrowserCache = true;

    const pipe = await mod.pipeline('automatic-speech-recognition', model, {
      progress_callback: (data: any) => {
        if (onProgress && typeof data?.progress === 'number') {
          onProgress(Math.max(0, Math.min(100, data.progress)));
        }
      },
    });
    return pipe as unknown as TranscriberFn;
  })();

  return transcriberPromise;
}

async function blobToFloat32Mono(
  blob: Blob,
  targetSampleRate = TARGET_SAMPLE_RATE,
): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  // Hedef örnekleme hızında AudioContext ile otomatik yeniden örnekleme yap.
  const AudioCtx =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioCtx({ sampleRate: targetSampleRate });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

  if (audioBuffer.numberOfChannels === 1) {
    const out = new Float32Array(audioBuffer.getChannelData(0));
    try {
      await audioContext.close();
    } catch {
      // noop
    }
    return out;
  }

  // Çok kanallı ise mono'ya indir
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);
  const mono = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    mono[i] = (left[i] + right[i]) / 2;
  }
  try {
    await audioContext.close();
  } catch {
    // noop
  }
  return mono;
}

function pickSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return '';
}

export interface UseWhisperSTTOptions {
  /** BCP-47 ('tr-TR', 'en-US') ya da kısa ('tr', 'en') kod. */
  lang?: string;
  /** Her tamamlanmış metin parçası için çağrılır. */
  onFinalResult?: (transcript: string) => void;
  /** HuggingFace model adı. Varsayılan: 'Xenova/whisper-tiny'. */
  model?: string;
}

export interface UseWhisperSTTReturn {
  isSupported: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  isModelLoading: boolean;
  modelProgress: number;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  reset: () => void;
}

export function useWhisperSTT(
  options: UseWhisperSTTOptions = {},
): UseWhisperSTTReturn {
  const { lang = 'tr-TR', onFinalResult, model = DEFAULT_MODEL } = options;

  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelProgress, setModelProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('');
  const onFinalResultRef = useRef(onFinalResult);
  const langRef = useRef(lang);

  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  }, [onFinalResult]);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof (window as any).MediaRecorder !== 'undefined';

  const cleanupStream = useCallback(() => {
    try {
      recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // noop
    }
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      // noop
    }
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const transcribeChunks = useCallback(
    async (chunks: Blob[], mime: string) => {
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: mime || 'audio/webm' });
      if (blob.size < 1024) {
        // Çok kısa / boş kayıt — transkripte gerek yok.
        return;
      }
      setIsTranscribing(true);
      try {
        if (transcriberPromise === null) setIsModelLoading(true);
        const transcriber = await getTranscriber(model, (ratio) => {
          setModelProgress(ratio);
        });
        setIsModelLoading(false);
        setModelProgress(100);

        const audio = await blobToFloat32Mono(blob);
        const whisperLang = toWhisperLang(langRef.current);
        const result = await transcriber(audio, {
          language: whisperLang,
          task: 'transcribe',
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: false,
        });
        const text = (result?.text || '').trim();
        if (text) onFinalResultRef.current?.(text);
      } catch (e: any) {
        const msg = e?.message || 'Transcription failed';
        setError(msg);
      } finally {
        setIsTranscribing(false);
      }
    },
    [model],
  );

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('Microphone API is not available in this environment.');
      return;
    }
    if (isListening) return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mime = pickSupportedMimeType();
      mimeRef.current = mime;
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event: any) => {
        const msg = event?.error?.message || 'Recorder error';
        setError(msg);
      };

      recorder.onstop = async () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        cleanupStream();
        setIsListening(false);
        await transcribeChunks(chunks, mimeRef.current);
      };

      // Kayıt başlasın; periyodik chunk'lar da olsun.
      recorder.start(1000);
      setIsListening(true);
    } catch (e: any) {
      const msg = e?.message || 'Failed to access microphone';
      setError(msg);
      setIsListening(false);
      cleanupStream();
    }
  }, [cleanupStream, isListening, isSupported, transcribeChunks]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      setIsListening(false);
      return;
    }
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // noop
      }
    } else {
      cleanupStream();
      setIsListening(false);
    }
  }, [cleanupStream]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else void start();
  }, [isListening, start, stop]);

  const reset = useCallback(() => {
    setError(null);
    setModelProgress(0);
  }, []);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // noop
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  return {
    isSupported,
    isListening,
    isTranscribing,
    isModelLoading,
    modelProgress,
    error,
    start,
    stop,
    toggle,
    reset,
  };
}
