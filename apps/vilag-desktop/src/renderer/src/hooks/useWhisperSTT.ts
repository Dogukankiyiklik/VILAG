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

// Varsayılan: `whisper-base` (~140 MB). Türkçe doğruluğu `tiny`'den belirgin
// şekilde daha iyidir. Daha hızlı istiyorsanız 'Xenova/whisper-tiny' (~40 MB),
// daha doğru istiyorsanız 'Xenova/whisper-small' (~470 MB) kullanın.
const DEFAULT_MODEL = 'Xenova/whisper-base';
const TARGET_SAMPLE_RATE = 16000;

// --- Sessizlik algılama (VAD) ayarları ---
// Kullanıcı konuşmayı bırakıp bu kadar süre sessiz kalınca kayıt otomatik durur.
const SILENCE_DURATION_MS = 1500;
// RMS ses seviyesi bu eşiğin üstündeyse "konuşma" sayılır (0..1 arası).
const SPEECH_THRESHOLD = 0.012;
// Ses seviyesini ne sıklıkla ölçeceğimiz.
const VAD_INTERVAL_MS = 100;
// Hiç konuşma algılanmazsa güvenlik amaçlı otomatik kapanış süresi.
const NO_SPEECH_TIMEOUT_MS = 8000;

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

// Her model ayrı cache'lenir; kullanıcı kalite seviyesini değiştirirse
// önceki model bellekte kalır ama yeni istek doğru pipeline'ı yükler.
const transcriberCache = new Map<string, Promise<TranscriberFn>>();

async function getTranscriber(
  model: string,
  onProgress?: (ratio: number) => void,
): Promise<TranscriberFn> {
  const cached = transcriberCache.get(model);
  if (cached) return cached;

  const promise = (async () => {
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

  // Hata olursa bir sonraki denemede tekrar yüklensin diye cache'ten kaldır.
  promise.catch(() => {
    if (transcriberCache.get(model) === promise) {
      transcriberCache.delete(model);
    }
  });

  transcriberCache.set(model, promise);
  return promise;
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

/**
 * Whisper'ın sessiz/boş ses parçalarında ürettiği yaygın halüsinasyon
 * cümlelerini temizler. Bunlar eğitim verisindeki YouTube altyazılarından
 * gelen boilerplate metinlerdir ve gerçek konuşma değildir.
 */
const HALLUCINATION_PATTERNS: RegExp[] = [
  /^alt\s*yaz[ıi]/i,
  /^subtitles?\s+by/i,
  /translated\s+by/i,
  /transcript(ion)?\s+by/i,
  /abone\s+ol/i,
  /be[ğg]enmeyi\s+unutmay[ıi]n/i,
  /thanks?\s+for\s+watching/i,
  /^teşekkür(ler)?\s*$/i,
  /^thank\s+you\.?$/i,
  /\[music\]/i,
  /\[müzik\]/i,
  /m\.?k\.?\s+meet$/i,
];

function filterHallucinations(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  // Çok kısa çıktılarda şüpheli kalıpları at.
  if (trimmed.length < 80) {
    for (const pattern of HALLUCINATION_PATTERNS) {
      if (pattern.test(trimmed)) return '';
    }
  }
  return trimmed;
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
  // Sessizlik algılama için Web Audio kaynakları.
  const vadCtxRef = useRef<AudioContext | null>(null);
  const vadTimerRef = useRef<number | null>(null);

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
    // Sessizlik algılamayı kapat.
    if (vadTimerRef.current !== null) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    if (vadCtxRef.current) {
      try {
        void vadCtxRef.current.close();
      } catch {
        // noop
      }
      vadCtxRef.current = null;
    }
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
        if (!transcriberCache.has(model)) setIsModelLoading(true);
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
          // Halüsinasyonu azaltmak için deterministic decoding.
          temperature: 0,
          // Önceki segmentlere koşullandırmayı kapat — kısa dikte komutlarında
          // yaygın bir halüsinasyon (tekrar eden cümleler) sorununu azaltır.
          condition_on_previous_text: false,
          no_repeat_ngram_size: 3,
        });
        const text = (result?.text || '').trim();
        // Whisper bazı sessiz/çok kısa kayıtlarda boilerplate üretir; filtrele.
        const cleaned = filterHallucinations(text);
        if (cleaned) onFinalResultRef.current?.(cleaned);
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

      // --- Sessizlik algılama (VAD) ---
      // Kullanıcı konuşmayı bırakıp kısa süre sessiz kalınca kaydı otomatik
      // durdur; böylece mikrofonu ikinci kez kapatmaya gerek kalmaz. Kayıt
      // durunca `recorder.onstop` transkripsiyonu tetikler ve metin kutuya düşer.
      try {
        const AudioCtx =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        const vadCtx: AudioContext = new AudioCtx();
        void vadCtx.resume?.();
        const source = vadCtx.createMediaStreamSource(stream);
        const analyser = vadCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        vadCtxRef.current = vadCtx;

        let speechDetected = false;
        let silenceStart = 0;
        const startedAt = Date.now();

        const triggerAutoStop = () => {
          if (vadTimerRef.current !== null) {
            clearInterval(vadTimerRef.current);
            vadTimerRef.current = null;
          }
          const rec = recorderRef.current;
          if (rec && rec.state === 'recording') {
            try {
              rec.stop();
            } catch {
              // noop
            }
          }
        };

        vadTimerRef.current = window.setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
          }
          const rms = Math.sqrt(sum / samples.length);
          const now = Date.now();

          if (rms >= SPEECH_THRESHOLD) {
            // Konuşma var: sessizlik sayacını sıfırla.
            speechDetected = true;
            silenceStart = 0;
            return;
          }

          if (!speechDetected) {
            // Henüz hiç konuşulmadı: kullanıcıya başlama süresi tanı,
            // ama çok uzun süre sessiz kalınırsa güvenli kapanış yap.
            if (now - startedAt > NO_SPEECH_TIMEOUT_MS) {
              triggerAutoStop();
            }
            return;
          }

          // Konuşma başlamıştı ve şu an sessiz: sessizlik süresini ölç.
          if (silenceStart === 0) {
            silenceStart = now;
          } else if (now - silenceStart >= SILENCE_DURATION_MS) {
            triggerAutoStop();
          }
        }, VAD_INTERVAL_MS);
      } catch {
        // VAD kurulamazsa sorun değil; kullanıcı mikrofonu manuel kapatabilir.
      }
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
