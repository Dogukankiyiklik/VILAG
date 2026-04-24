import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`) tabanlı
 * Speech-to-Text hook'u.
 *
 * - Tamamen ücretsizdir; tarayıcının/Chromium'un yerleşik API'sini kullanır.
 * - Model indirmesi YOKTUR; ilk tıklamada anında çalışır.
 * - Dil parametresi BCP-47 formatındadır (örn: 'tr-TR', 'en-US').
 *
 * Not: Electron'un paketlenmiş Chromium yapılandırmasına bağlı olarak
 * `webkitSpeechRecognition` internet bağlantısı gerektirebilir. Bu hook bir
 * `network` veya `service-not-allowed` hatası alırsa `error` state'ine
 * anlaşılır bir mesaj koyar; çağıran taraf bu durumda yerel bir çözüme
 * (örn. Whisper) fallback yapabilir.
 */

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export interface UseWebSpeechSTTOptions {
  /** BCP-47 dil kodu. Varsayılan: 'tr-TR'. */
  lang?: string;
  /**
   * Kullanıcı duraklasa bile tanımayı aktif tut; tarayıcı `end` olayı
   * atarsa otomatik yeniden başlat. Varsayılan: true.
   */
  continuous?: boolean;
  /** Ara (henüz kesinleşmemiş) sonuçları üret. Varsayılan: true. */
  interimResults?: boolean;
  /** Her ara sonuç için çağrılır (henüz final değil). */
  onInterimResult?: (transcript: string) => void;
  /** Her kesinleşmiş sonuç parçası için çağrılır. */
  onFinalResult?: (transcript: string) => void;
}

export interface UseWebSpeechSTTReturn {
  isSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  reset: () => void;
}

function getSpeechRecognitionCtor(): any | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function humanizeError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Mikrofon izni reddedildi veya konuşma servisi kullanılamıyor.';
    case 'network':
      return 'Ağ hatası: Web Speech API internet bağlantısı gerektirir.';
    case 'audio-capture':
      return 'Mikrofon yakalanamadı. Cihazı kontrol edin.';
    case 'language-not-supported':
      return 'Seçili dil bu API tarafından desteklenmiyor.';
    case 'aborted':
    case 'no-speech':
      return '';
    default:
      return `Tanıma hatası: ${code}`;
  }
}

export function useWebSpeechSTT(
  options: UseWebSpeechSTTOptions = {},
): UseWebSpeechSTTReturn {
  const {
    lang = 'tr-TR',
    continuous = true,
    interimResults = true,
    onInterimResult,
    onFinalResult,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any | null>(null);
  const shouldRestartRef = useRef(false);
  const onFinalResultRef = useRef(onFinalResult);
  const onInterimResultRef = useRef(onInterimResult);
  const langRef = useRef(lang);

  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  }, [onFinalResult]);

  useEffect(() => {
    onInterimResultRef.current = onInterimResult;
  }, [onInterimResult]);

  useEffect(() => {
    langRef.current = lang;
    // Dinleme sürerken dil değiştirilirse çalışan tanıyıcıyı da güncelle;
    // bazı tarayıcılar bunu anında uygular, bazıları sonraki segmentte.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.lang = lang;
      } catch {
        // noop
      }
    }
  }, [lang]);

  const isSupported = !!getSpeechRecognitionCtor();

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    const rec = recognitionRef.current;
    if (!rec) {
      setIsListening(false);
      return;
    }
    try {
      rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        // noop
      }
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError('Web Speech API bu ortamda desteklenmiyor.');
      return;
    }
    if (isListening) return;

    setError(null);
    setInterimTranscript('');

    try {
      const recognition = new Ctor();
      recognition.lang = langRef.current;
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let finalText = '';
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0]?.transcript ?? '';
          if (res.isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        if (interimText) {
          setInterimTranscript(interimText);
          onInterimResultRef.current?.(interimText);
        }
        if (finalText.trim()) {
          setInterimTranscript('');
          onFinalResultRef.current?.(finalText.trim());
        }
      };

      recognition.onerror = (event: any) => {
        const code: string = event?.error || 'unknown';
        const msg = humanizeError(code);
        // `no-speech` ve `aborted` sessiz durumlardır; kullanıcıya gösterme.
        if (msg) {
          setError(msg);
        }
        // Kalıcı hatalarda otomatik yeniden başlatmayı iptal et.
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'network') {
          shouldRestartRef.current = false;
        }
      };

      recognition.onend = () => {
        setInterimTranscript('');
        if (shouldRestartRef.current) {
          // Tarayıcı continuous modda bile bir süre sonra kapatabilir;
          // küçük bir gecikme ile yeniden başlat.
          window.setTimeout(() => {
            if (!shouldRestartRef.current) return;
            try {
              recognition.start();
            } catch {
              shouldRestartRef.current = false;
              setIsListening(false);
            }
          }, 150);
        } else {
          setIsListening(false);
          recognitionRef.current = null;
        }
      };

      recognition.onstart = () => {
        setIsListening(true);
      };

      shouldRestartRef.current = continuous;
      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      setError(e?.message || 'Tanıma başlatılamadı.');
      setIsListening(false);
      shouldRestartRef.current = false;
      recognitionRef.current = null;
    }
  }, [continuous, interimResults, isListening]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  const reset = useCallback(() => {
    setError(null);
    setInterimTranscript('');
  }, []);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        // noop
      }
      recognitionRef.current = null;
    };
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    error,
    start,
    stop,
    toggle,
    reset,
  };
}
