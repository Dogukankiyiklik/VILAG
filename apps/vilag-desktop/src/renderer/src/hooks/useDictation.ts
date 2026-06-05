import { useWhisperSTT } from './useWhisperSTT';

/**
 * Dikte hook'u — tamamen cihaz üzerinde çalışan yerel Whisper (Transformers.js)
 * motorunu kullanır.
 *
 * Not: Eskiden önce tarayıcının Web Speech API'si (`webkitSpeechRecognition`)
 * denenir, başarısız olursa Whisper'a düşülürdü. Uygulama Electron'da
 * çalıştığı ve paketlenmiş Chromium'da Web Speech (Google STT) servisi
 * kullanılamadığı (her seferinde ağ hatası verip Whisper'a düştüğü) için bu
 * katman kaldırıldı; artık doğrudan Whisper kullanılır.
 */

export interface UseDictationOptions {
  /** BCP-47 dil kodu: 'tr-TR' veya 'en-US'. */
  lang?: string;
  /** Whisper modelinin HuggingFace adı. Kalite/hız dengesini kontrol eder. */
  whisperModel?: string;
  /** Her kesinleşmiş metin parçası için çağrılır. */
  onFinalResult?: (transcript: string) => void;
}

export interface UseDictationReturn {
  /** Mikrofon API'si bu ortamda destekleniyor mu? */
  isSupported: boolean;
  /** Mikrofon şu an dinliyor mu? */
  isListening: boolean;
  /** Ses yakalandı, metin üretiliyor. */
  isTranscribing: boolean;
  /** Whisper modeli indiriliyor. */
  isModelLoading: boolean;
  /** Model indirme ilerlemesi (0-100). */
  modelProgress: number;
  /** Kullanıcıya gösterilecek hata (yoksa null). */
  error: string | null;
  toggle: () => void;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useDictation(options: UseDictationOptions = {}): UseDictationReturn {
  const { lang = 'tr-TR', whisperModel, onFinalResult } = options;

  const whisper = useWhisperSTT({
    lang,
    model: whisperModel,
    onFinalResult,
  });

  return {
    isSupported: whisper.isSupported,
    isListening: whisper.isListening,
    isTranscribing: whisper.isTranscribing,
    isModelLoading: whisper.isModelLoading,
    modelProgress: whisper.modelProgress,
    error: whisper.error,
    toggle: whisper.toggle,
    start: whisper.start,
    stop: whisper.stop,
    reset: whisper.reset,
  };
}
