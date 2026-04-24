import { useCallback, useEffect, useRef, useState } from 'react';

import { useWebSpeechSTT } from './useWebSpeechSTT';
import { useWhisperSTT } from './useWhisperSTT';

/**
 * Birleşik dikte hook'u.
 *
 * Sıralama:
 * 1) Önce Web Speech API (`webkitSpeechRecognition`) — ücretsiz, anlık, model yok.
 * 2) Web Speech erişemezse (Electron'un Chromium'unda Google STT servisi
 *    `net::ERR_FAILED` döner) otomatik olarak yerel Whisper'a (Transformers.js)
 *    düşer. Whisper tamamen cihaz üzerinde çalışır, ilk kullanımda küçük
 *    model indirir (~40 MB) ve sonrasında internet olmadan da çalışır.
 *
 * Kullanıcıya tek bir basit API sunar: toggle/start/stop + isListening.
 */

export type DictationEngine = 'web-speech' | 'whisper';

export interface UseDictationOptions {
  /** BCP-47 dil kodu: 'tr-TR' veya 'en-US'. */
  lang?: string;
  /** Tercih edilen motor. 'auto' (varsayılan) → web-speech → whisper fallback. */
  preferredEngine?: 'auto' | DictationEngine;
  /** Ara (henüz kesinleşmemiş) metin. Yalnızca web-speech motorunda üretilir. */
  onInterimResult?: (transcript: string) => void;
  /** Her kesinleşmiş metin parçası için çağrılır. */
  onFinalResult?: (transcript: string) => void;
}

export interface UseDictationReturn {
  /** O an aktif motor. */
  engine: DictationEngine;
  /** Aktif motor bu ortamda destekleniyor mu? */
  isSupported: boolean;
  /** Mikrofon şu an dinliyor mu? */
  isListening: boolean;
  /** Whisper'a özgü: ses yakalandı, metin üretiliyor. */
  isTranscribing: boolean;
  /** Whisper'a özgü: model indiriliyor. */
  isModelLoading: boolean;
  /** Whisper model indirme ilerlemesi (0-100). */
  modelProgress: number;
  /** Web Speech'e özgü: anlık (final değil) önizleme. */
  interimTranscript: string;
  /** Kullanıcıya gösterilecek hata (yoksa null). */
  error: string | null;
  /** Motor değiştiğinde tek seferlik bilgi mesajı. */
  engineNotice: string | null;
  toggle: () => void;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

function isWebSpeechFatalError(err: string | null): boolean {
  if (!err) return false;
  // Türkçeleştirilmiş mesajların kalıpları (bkz. useWebSpeechSTT.humanizeError).
  return (
    /ağ hatası/i.test(err) ||
    /network/i.test(err) ||
    /servis/i.test(err) ||
    /desteklenmiyor/i.test(err) ||
    /reddedildi/i.test(err)
  );
}

export function useDictation(options: UseDictationOptions = {}): UseDictationReturn {
  const {
    lang = 'tr-TR',
    preferredEngine = 'auto',
    onInterimResult,
    onFinalResult,
  } = options;

  const [engine, setEngine] = useState<DictationEngine>(
    preferredEngine === 'whisper' ? 'whisper' : 'web-speech',
  );
  const [engineNotice, setEngineNotice] = useState<string | null>(null);
  const pendingStartRef = useRef(false);

  const webSpeech = useWebSpeechSTT({
    lang,
    continuous: true,
    interimResults: true,
    onInterimResult,
    onFinalResult,
  });

  const whisper = useWhisperSTT({
    lang,
    onFinalResult,
  });

  // Web Speech API fatal hata verirse otomatik Whisper'a düş.
  useEffect(() => {
    if (preferredEngine !== 'auto') return;
    if (engine !== 'web-speech') return;
    if (!isWebSpeechFatalError(webSpeech.error)) return;

    setEngineNotice('Web Speech API kullanılamadı; yerel Whisper motoruna geçildi.');
    setEngine('whisper');
    webSpeech.reset();

    // Kullanıcı mikrofona basmıştı; onun yerine Whisper'ı şeffafça başlat.
    if (pendingStartRef.current) {
      pendingStartRef.current = false;
      // Whisper async başladığı için bir tick bekleyip güvenle start çağır.
      queueMicrotask(() => whisper.start());
    }
  }, [preferredEngine, engine, webSpeech, whisper]);

  // Web Speech API baştan desteklenmiyorsa (örn. Electron'da bazı build'ler)
  // ve tercih auto ise ilk kullanımda direkt Whisper'a düş.
  useEffect(() => {
    if (preferredEngine !== 'auto') return;
    if (engine !== 'web-speech') return;
    if (webSpeech.isSupported) return;
    setEngine('whisper');
  }, [preferredEngine, engine, webSpeech.isSupported]);

  const start = useCallback(() => {
    pendingStartRef.current = true;
    if (engine === 'web-speech') {
      webSpeech.start();
    } else {
      whisper.start();
    }
  }, [engine, webSpeech, whisper]);

  const stop = useCallback(() => {
    pendingStartRef.current = false;
    if (engine === 'web-speech') {
      webSpeech.stop();
    } else {
      whisper.stop();
    }
  }, [engine, webSpeech, whisper]);

  const toggle = useCallback(() => {
    pendingStartRef.current = !webSpeech.isListening && !whisper.isListening;
    if (engine === 'web-speech') {
      webSpeech.toggle();
    } else {
      whisper.toggle();
    }
  }, [engine, webSpeech, whisper]);

  const reset = useCallback(() => {
    setEngineNotice(null);
    webSpeech.reset();
    whisper.reset();
  }, [webSpeech, whisper]);

  if (engine === 'web-speech') {
    return {
      engine,
      isSupported: webSpeech.isSupported,
      isListening: webSpeech.isListening,
      isTranscribing: false,
      isModelLoading: false,
      modelProgress: 0,
      interimTranscript: webSpeech.interimTranscript,
      // Fatal hata fallback useEffect'i tarafından ele alınacağı için
      // burada kullanıcıya tekrar göstermiyoruz (bildirim engineNotice'a düşecek).
      error: isWebSpeechFatalError(webSpeech.error) ? null : webSpeech.error,
      engineNotice,
      toggle,
      start,
      stop,
      reset,
    };
  }

  return {
    engine,
    isSupported: whisper.isSupported,
    isListening: whisper.isListening,
    isTranscribing: whisper.isTranscribing,
    isModelLoading: whisper.isModelLoading,
    modelProgress: whisper.modelProgress,
    interimTranscript: '',
    error: whisper.error,
    engineNotice,
    toggle,
    start,
    stop,
    reset,
  };
}
