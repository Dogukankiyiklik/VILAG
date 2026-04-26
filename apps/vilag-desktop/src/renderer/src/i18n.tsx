import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type UILanguage = 'en' | 'tr';

type Dict = Record<string, string>;

const dict: Record<UILanguage, Dict> = {
  en: {
    'common.loadingSettings': 'Loading settings...',
    'layout.brandSubtitle': 'Desktop & Browser Agent',
    'layout.collapseSidebar': 'Collapse sidebar',
    'layout.expandSidebar': 'Expand sidebar',
    'layout.chatHistory': 'Chat history',
    'layout.clearAllSessions': 'Clear all sessions',
    'layout.clearAll': 'Clear all',
    'layout.noSessions': 'No sessions yet.',
    'layout.deleteSession': 'Delete session',
    'layout.minimize': 'Minimize',
    'layout.maximize': 'Maximize',
    'layout.close': 'Close',
    'layout.home': 'Home',
    'layout.history': 'History',
    'layout.settings': 'Settings',
    'layout.theme': 'Theme',
    'layout.newChat': 'New Chat',
    'home.welcomeTitle': 'Welcome to VILAG Desktop',
    'home.welcomeDesc': 'Choose an operator mode to get started. You can switch anytime from settings.',
    'home.modeInfo': 'Desktop mode controls your entire screen. Browser mode stays inside a single window for safer automation.',
    'home.desktopTitle': 'Desktop Operator',
    'home.desktopDesc': 'Full desktop control - click, type, drag and scroll anywhere on your screen.',
    'home.useDesktop': 'Use Local Computer',
    'home.browserTitle': 'Browser Operator',
    'home.browserDesc': 'Confined to a single browser window for safer, tab-based workflows.',
    'home.useBrowser': 'Use Local Browser',
    'settings.title': 'Agent Preferences',
    'settings.subtitle': 'Configure your model endpoints, API keys, and behavioral parameters.',
    'settings.modelConfig': 'Model Configuration (LM Studio)',
    'settings.apiBaseUrl': 'API Base URL',
    'settings.apiKey': 'API Key',
    'settings.modelName': 'Model Name',
    'settings.modelNamePlaceholder': 'Enter model name (e.g., ui-tars-2b-q4)',
    'settings.browserControls': 'Browser Controls',
    'settings.maxExecutionSteps': 'Max Execution Steps',
    'settings.defaultSearchEngine': 'Default Search Engine',
    'settings.instructionLanguage': 'Agent Instruction Language',
    'settings.englishDefault': 'English (Default)',
    'settings.turkish': 'Turkce',
    'settings.browserStartUrl': 'Browser Start URL',
    'settings.ragTitle': 'Retrieval (RAG)',
    'settings.ragOn': 'On - scenario hints injected into the prompt',
    'settings.ragOff': 'Off - agent runs without scenario retrieval',
    'settings.plannerTitle': 'Planner Configuration',
    'settings.plannerOn': 'On - commands will be broken into subtasks',
    'settings.plannerOff': 'Off - commands run directly',
    'settings.plannerApiBaseUrl': 'Planner API Base URL',
    'settings.plannerApiKey': 'Planner API Key',
    'settings.plannerModelName': 'Planner Model Name',
    'settings.plannerModelPlaceholder': 'e.g., gemini-2.5-flash',
    'local.headerTitle': 'Local Operator',
    'local.status.running': 'Running',
    'local.status.pause': 'Paused',
    'local.status.error': 'Error',
    'local.status.maxLoop': 'Max Loops',
    'local.status.callUser': 'Needs Intervention',
    'local.status.idle': 'Idle',
    'local.resume': 'Resume',
    'local.pause': 'Pause',
    'local.stop': 'Stop',
    'local.run': 'Run',
    'local.noMessages': 'No messages yet. Describe a task in the input below and press Run.',
    'local.user': 'User',
    'local.agent': 'Agent',
    'local.systemAction': '[System action]',
    'local.thinking': 'Thinking...',
    'local.placeholder.default': 'What can I do for you today?',
    'local.placeholder.listening': 'Listening... speak now',
    'local.screenshots': 'Screenshots',
    'local.noScreenshots': 'No screenshots available yet.',
    'local.runToSeeProgress': 'Run the agent to see progress.',
    'local.dictationNotSupported': 'Voice dictation is not supported in this environment.',
    'local.stopListening': 'Stop listening',
    'local.modelLoading': 'Model loading',
    'local.transcribing': 'Transcribing...',
    'local.startDictation': 'Start voice dictation',
    'local.quality.fast': 'Fast',
    'local.quality.balanced': 'Balanced',
    'local.quality.accurate': 'Accurate',
    'local.quality.fastTooltip': 'Fast (tiny, ~40MB) - lower accuracy',
    'local.quality.balancedTooltip': 'Balanced (base, ~140MB) - recommended',
    'local.quality.accurateTooltip': 'Accurate (small, ~470MB) - best accuracy',
    'local.whisperDownloading': 'Downloading Whisper model...',
    'local.whisperLocal': 'Whisper (local)',
    'local.ready': 'ready',
    'local.listening': 'Listening',
    'widget.awaitingApproval': 'Awaiting Approval',
    'widget.running': 'Running',
    'widget.paused': 'Paused',
    'widget.thinking': 'Thinking',
    'widget.idle': 'Idle',
    'widget.approvalRequired': 'Approval Required',
    'widget.risk': 'Risk',
    'widget.approve': 'Approve',
    'widget.reject': 'Reject',
    'widget.mediumRiskNotice': 'Medium Risk Notice',
    'widget.lastAction': 'Last Action',
    'widget.latestUpdate': 'Latest Update',
    'widget.state': 'State',
    'widget.state.running': 'Agent is executing actions.',
    'widget.state.paused': 'Agent is paused.',
    'widget.state.thinking': 'Agent is thinking.',
    'widget.state.idle': 'Waiting for the next command.',
    'widget.latestHint': "The agent's latest action and summary will appear here.",
    'widget.noUpdateYet': 'No update yet.',
  },
  tr: {
    'common.loadingSettings': 'Ayarlar yükleniyor...',
    'layout.brandSubtitle': 'Masaüstü ve Tarayıcı Ajan',
    'layout.collapseSidebar': 'Kenar çubuğunu daralt',
    'layout.expandSidebar': 'Kenar çubuğunu genişlet',
    'layout.chatHistory': 'Sohbet geçmişi',
    'layout.clearAllSessions': 'Tüm oturumları temizle',
    'layout.clearAll': 'Tümünü temizle',
    'layout.noSessions': 'Henüz oturum yok.',
    'layout.deleteSession': 'Oturumu sil',
    'layout.minimize': 'Küçült',
    'layout.maximize': 'Büyüt',
    'layout.close': 'Kapat',
    'layout.home': 'Ana Sayfa',
    'layout.history': 'Geçmiş',
    'layout.settings': 'Ayarlar',
    'layout.theme': 'Tema',
    'layout.newChat': 'Yeni Sohbet',
    'home.welcomeTitle': "VILAG Desktop'a Hoş Geldiniz",
    'home.welcomeDesc': 'Başlamak için bir operatör modu seçin. İstediğiniz zaman ayarlardan değiştirebilirsiniz.',
    'home.modeInfo': 'Masaüstü modu tüm ekranınızı kontrol eder. Tarayıcı modu daha güvenli otomasyon için tek pencere içinde kalır.',
    'home.desktopTitle': 'Masaüstü Operatörü',
    'home.desktopDesc': 'Tam masaüstü kontrolü - ekranınızın her yerinde tıklama, yazma, sürükleme ve kaydırma.',
    'home.useDesktop': 'Yerel Bilgisayarı Kullan',
    'home.browserTitle': 'Tarayıcı Operatörü',
    'home.browserDesc': 'Daha güvenli, sekme tabanlı akışlar için tek bir tarayıcı penceresiyle sınırlıdır.',
    'home.useBrowser': 'Yerel Tarayıcıyı Kullan',
    'settings.title': 'Ajan Tercihleri',
    'settings.subtitle': 'Model endpointlerini, API anahtarlarını ve davranış parametrelerini yapılandırın.',
    'settings.modelConfig': 'Model Yapılandırması (LM Studio)',
    'settings.apiBaseUrl': 'API Temel URL',
    'settings.apiKey': 'API Anahtarı',
    'settings.modelName': 'Model Adı',
    'settings.modelNamePlaceholder': 'Model adını girin (ör. ui-tars-2b-q4)',
    'settings.browserControls': 'Tarayıcı Kontrolleri',
    'settings.maxExecutionSteps': 'Maksimum Yürütme Adımı',
    'settings.defaultSearchEngine': 'Varsayılan Arama Motoru',
    'settings.instructionLanguage': 'Ajan Komut Dili',
    'settings.englishDefault': 'İngilizce (Varsayılan)',
    'settings.turkish': 'Türkçe',
    'settings.browserStartUrl': 'Tarayıcı Başlangıç URL',
    'settings.ragTitle': 'Getirim (RAG)',
    'settings.ragOn': 'Açık - senaryo ipuçları prompta eklenir',
    'settings.ragOff': 'Kapalı - ajan senaryo getirimi olmadan çalışır',
    'settings.plannerTitle': 'Planlayıcı Yapılandırması',
    'settings.plannerOn': 'Açık - komutlar alt görevlere bölünür',
    'settings.plannerOff': 'Kapalı - komutlar doğrudan çalıştırılır',
    'settings.plannerApiBaseUrl': 'Planlayici API Temel URL',
    'settings.plannerApiKey': 'Planlayıcı API Anahtarı',
    'settings.plannerModelName': 'Planlayıcı Model Adı',
    'settings.plannerModelPlaceholder': 'ör. gemini-2.5-flash',
    'local.headerTitle': 'Yerel Operatör',
    'local.status.running': 'Çalışıyor',
    'local.status.pause': 'Duraklatıldı',
    'local.status.error': 'Hata',
    'local.status.maxLoop': 'Maksimum Döngü',
    'local.status.callUser': 'Müdahale Gerekli',
    'local.status.idle': 'Boşta',
    'local.resume': 'Devam Et',
    'local.pause': 'Duraklat',
    'local.stop': 'Durdur',
    'local.run': 'Çalıştır',
    'local.noMessages': 'Henüz mesaj yok. Aşağıdaki alana görevi yazın ve Çalıştır\'a basın.',
    'local.user': 'Kullanıcı',
    'local.agent': 'Ajan',
    'local.systemAction': '[Sistem işlemi]',
    'local.thinking': 'Düşünüyor...',
    'local.placeholder.default': 'Bugün senin için ne yapabilirim?',
    'local.placeholder.listening': 'Dinleniyor... konuşun',
    'local.screenshots': 'Ekran Görüntüleri',
    'local.noScreenshots': 'Henüz ekran görüntüsü yok.',
    'local.runToSeeProgress': 'İlerlemeyi görmek için ajanı çalıştırın.',
    'local.dictationNotSupported': 'Sesli dikte bu ortamda desteklenmiyor.',
    'local.stopListening': 'Dinlemeyi durdur',
    'local.modelLoading': 'Model yükleniyor',
    'local.transcribing': 'Metne dönüştürülüyor...',
    'local.startDictation': 'Sesli dikte başlat',
    'local.quality.fast': 'Hızlı',
    'local.quality.balanced': 'Dengeli',
    'local.quality.accurate': 'Doğru',
    'local.quality.fastTooltip': 'Hızlı (tiny, ~40MB) - daha düşük doğruluk',
    'local.quality.balancedTooltip': 'Dengeli (base, ~140MB) - önerilen',
    'local.quality.accurateTooltip': 'Doğru (small, ~470MB) - en iyi doğruluk',
    'local.whisperDownloading': 'Whisper modeli indiriliyor...',
    'local.whisperLocal': 'Whisper (yerel)',
    'local.ready': 'hazır',
    'local.listening': 'Dinleniyor',
    'widget.awaitingApproval': 'Onay Bekleniyor',
    'widget.running': 'Çalışıyor',
    'widget.paused': 'Duraklatıldı',
    'widget.thinking': 'Düşünüyor',
    'widget.idle': 'Boşta',
    'widget.approvalRequired': 'Onay Gerekiyor',
    'widget.risk': 'Risk',
    'widget.approve': 'Onayla',
    'widget.reject': 'Reddet',
    'widget.mediumRiskNotice': 'Orta Risk Bildirimi',
    'widget.lastAction': 'Son Aksiyon',
    'widget.latestUpdate': 'Son Güncelleme',
    'widget.state': 'Durum',
    'widget.state.running': 'Ajan aksiyonları yürütüyor.',
    'widget.state.paused': 'Ajan duraklatıldı.',
    'widget.state.thinking': 'Ajan düşünüyor.',
    'widget.state.idle': 'Sonraki komut bekleniyor.',
    'widget.latestHint': 'Ajanın son aksiyonu ve özeti burada görünecek.',
    'widget.noUpdateYet': 'Henüz güncelleme yok.',
  },
};

declare global {
  interface Window {
    vilagAPI: any;
  }
}

interface I18nContextValue {
  language: UILanguage;
  setLanguage: (language: UILanguage) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => undefined,
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UILanguage>('en');

  useEffect(() => {
    const cached = localStorage.getItem('vilag-language');
    if (cached === 'tr' || cached === 'en') {
      setLanguageState(cached);
    }
    window.vilagAPI?.getSettings?.().then((settings: any) => {
      const lang = settings?.language;
      if (lang === 'tr' || lang === 'en') {
        setLanguageState(lang);
        localStorage.setItem('vilag-language', lang);
      }
    });
  }, []);

  useEffect(() => {
    const onLanguageChanged = (event: Event) => {
      const detail = (event as CustomEvent<UILanguage>).detail;
      if (detail === 'tr' || detail === 'en') {
        setLanguageState(detail);
        localStorage.setItem('vilag-language', detail);
      }
    };
    window.addEventListener('vilag-language-changed', onLanguageChanged as EventListener);
    return () => window.removeEventListener('vilag-language-changed', onLanguageChanged as EventListener);
  }, []);

  const setLanguage = (next: UILanguage) => {
    setLanguageState(next);
    localStorage.setItem('vilag-language', next);
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key: string) => dict[language][key] ?? dict.en[key] ?? key,
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
