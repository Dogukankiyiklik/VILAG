# VILAG — Visual Language Agent

VILAG, web tabanlı uygulamaları doğrudan tarayıcı arayüzü üzerinden otonom olarak yönetebilen, yapay zeka destekli bir GUI otomasyon platformudur. Kullanıcı tarafından sağlanan metin komutlarını analiz ederek ekran görüntüsü üzerinden düşünür ve Playwright veya NutJS yardımıyla tıklama, yazı yazma, gezinme gibi aksiyonları gerçekleştirir. Uygulamanın arayüzü Electron ve React ile geliştirilmiştir.

> **Kısaca:** *"Ekranı gör → Düşün → Aksiyonu yürüt → Tekrarla"*

---

## Kurulum ve Çalıştırma

Proje, **pnpm** kullanarak monorepo yapısı ile organize edilmiştir. Sisteminizde **Node.js (v20+)** ve **pnpm** kurulu olmalıdır.

```bash
# 1. Bağımlılıkları yükle
pnpm install

# 2. Geliştirme modunda çalıştır (Electron penceresi açılır)
pnpm run dev

# 3. LM Studio'dan modeli yükle ve ayarlardan model ismini gir
#    Önerilen: ui-tars-2b-sft
```

---

## Proje Yapısı (Monorepo)

```
vilag/
├── apps/
│   └── vilag-desktop/              # Ana Electron masaüstü uygulaması
│       ├── src/
│       │   ├── main/               # Electron Main Process
│       │   │   ├── main.ts         # Ana süreç, IPC handler'lar, ajan başlatma
│       │   │   ├── agent/
│       │   │   │   └── operator.ts # NutJSElectronOperator (desktopCapturer ile screenshot)
│       │   │   ├── window/
│       │   │   │   └── ScreenMarker.ts  # Widget penceresi + mavi çerçeve animasyonu
│       │   │   └── utils/
│       │   ├── preload/
│       │   │   └── index.ts        # contextBridge ile güvenli API expose
│       │   └── renderer/           # React UI (Vite + Tailwind)
│       │       └── src/
│       │           ├── App.tsx     # Router yapısı
│       │           ├── pages/
│       │           │   ├── home/   # Operatör seçim ekranı (Desktop vs Browser)
│       │           │   ├── local/  # Ana ajan kontrol arayüzü
│       │           │   ├── settings/ # Model URL, API key, max loop ayarları
│       │           │   └── widget/ # Floating widget (ajan çalışırken)
│       │           ├── components/ # shadcn/ui bileşenleri
│       │           └── layouts/
│       └── electron.vite.config.ts # Electron-Vite build yapılandırması
│
├── packages/
│   ├── vilag-sdk/                  # Çekirdek SDK — GUIAgent döngüsü + Model istemcisi
│   │   └── src/
│   │       ├── GUIAgent.ts         # Ana ajan döngüsü (projenin kalbi)
│   │       ├── Model.ts            # OpenAI-uyumlu VLM istemcisi
│   │       ├── types.ts            # Operator, GUIAgentConfig, InvokeParams tipleri
│   │       ├── core.ts             # Re-exports (Operator, ExecuteParams vb.)
│   │       └── index.ts            # Public API exports
│   │
│   ├── vilag-action-parser/        # Model çıktısını parse eden modül
│   │   └── src/
│   │       └── index.ts            # parseAction(), koordinat formatları
│   │
│   ├── vilag-browser-operator/     # Playwright tabanlı tarayıcı operatörü
│   │   └── src/
│   │       └── index.ts            # BrowserOperator sınıfı
│   │
│   ├── vilag-desktop-operator/     # NutJS tabanlı masaüstü operatörü
│   │   └── src/
│   │       └── index.ts            # NutJSOperator sınıfı
│   │
│   ├── vilag-electron-ipc/         # Electron IPC köprüsü
│   │   └── src/
│   │       ├── main.ts             # registerIpcHandlers()
│   │       ├── renderer.ts         # createIpcClient()
│   │       └── types.ts            # IPC tip tanımları
│   │
│   ├── vilag-logger/               # Renkli konsol loglama
│   │   └── src/
│   │       └── index.ts            # createLogger() — timestamp + seviye + renk
│   │
│   └── vilag-shared/               # Modüller arası paylaşılan ortak kod
│       └── src/
│           ├── types/index.ts      # StatusEnum, PredictionParsed, Conversation, Message vb.
│           ├── constants/index.ts  # UITarsModelVersion, MAX_PIXELS, varsayılanlar
│           └── utils/index.ts      # sleep(), replaceBase64Prefix(), formatTimestamp()
│
├── package.json                    # Root workspace
├── pnpm-workspace.yaml             # pnpm monorepo tanımı
├── turbo.json                      # Turborepo build pipeline
└── tsconfig.json                   # Root TypeScript yapılandırması
```

---

## Mimari Genel Bakış

```
┌────────────────────────────────────────────────────────────────────┐
│                     Electron Desktop App                           │
│                    (apps/vilag-desktop)                             │
│                                                                    │
│  ┌──────────────────┐   IPC (preload)   ┌───────────────────────┐ │
│  │   Renderer        │◄────────────────►│   Main Process         │ │
│  │   (React + Vite)  │  vilagAPI.*      │   (main.ts)            │ │
│  │                    │                  │                        │ │
│  │  • HomePage        │                  │  ┌──────────────────┐ │ │
│  │  • LocalPage       │                  │  │    GUIAgent       │ │ │
│  │  • SettingsPage    │                  │  │   (vilag-sdk)     │ │ │
│  │  • WidgetPage      │                  │  └────────┬─────────┘ │ │
│  └──────────────────┘                  │           │            │ │
│                                          │     ┌─────┴─────┐     │ │
│                                          │     │           │     │ │
│                                          │  ┌──▼───┐  ┌───▼──┐  │ │
│                                          │  │Model │  │Opera-│  │ │
│                                          │  │(.ts) │  │tor   │  │ │
│                                          │  └──┬───┘  └───┬──┘  │ │
│                                          │     │          │      │ │
│                                          └─────┼──────────┼──────┘ │
│                                                │          │        │
│                                                ▼          ▼        │
│                                          LM Studio   Playwright    │
│                                          / vLLM      veya NutJS    │
└────────────────────────────────────────────────────────────────────┘
```

### Katmanlar

| Katman | Paket | Sorumluluk |
|--------|-------|-----------|
| **Orkestratör** | `vilag-sdk` → `GUIAgent` | Ana döngü: screenshot → model → parse → execute → tekrarla |
| **Model İstemcisi** | `vilag-sdk` → `UITarsModel` | OpenAI-uyumlu API ile VLM çağrısı |
| **Aksiyon Parser** | `vilag-action-parser` | Model çıktısını yapısal aksiyon objelerine dönüştürme |
| **Browser Operatör** | `vilag-browser-operator` | Playwright ile tarayıcı kontrolü |
| **Desktop Operatör** | `vilag-desktop-operator` | NutJS ile masaüstü fare/klavye kontrolü |
| **Electron IPC** | `vilag-electron-ipc` | Main ↔ Renderer süreç iletişimi |
| **Logger** | `vilag-logger` | Renkli, timestamp'li konsol logları |
| **Shared** | `vilag-shared` | Ortak tipler, enum'lar, sabitler, utility fonksiyonlar |

---

## Paket Detayları

### vilag-sdk (Çekirdek)

Projenin kalbi. İki ana sınıf içerir:

**GUIAgent** — Ana ajan döngüsünü çalıştırır:

```
while (görev bitmedi && maxLoop aşılmadı && durdurulmadı) {
    1. operator.screenshot()       → Ekran görüntüsü al
    2. model.invoke()              → Screenshot + geçmiş → VLM'e gönder
    3. parseAction(prediction)     → Cevabı yapısal aksiyona dönüştür
    4. operator.execute(action)    → Aksiyonu gerçekleştir
    5. sleep(interval)             → Bekleme, sonra tekrarla
}
```

Önemli yetenekler:
- **Pause / Resume / Stop** — çalışırken duraklatılıp devam ettirilebilir
- **AbortSignal** desteği — harici iptal mekanizması
- **Retry** — model hatalarında yapılandırılabilir yeniden deneme
- **Screenshot hata toleransı** — ardışık 3 hataya kadar tolere eder
- **Event callback** — `onData` ve `onError` ile dışarıya durum bildirir

**UITarsModel** — OpenAI SDK'sı üzerinden herhangi bir uyumlu sunucuyu kullanır:
- LM Studio, vLLM, HuggingFace Inference, uzak API'ler
- Konuşma geçmişi + screenshot (base64) gönderir
- Gelen ham metni `parseAction()` ile parse eder

### vilag-action-parser

Model çıktısı şu formattadır:
```
Thought: Arama kutusuna tıklamam gerekiyor
Action: click(start_box='<|box_start|>(500,300)<|box_end|>')
```

Parser bunu şu yapıya dönüştürür:
```typescript
{
  action_type: 'click',
  action_inputs: { start_box: { x: 500, y: 300 } },
  thought: 'Arama kutusuna tıklamam gerekiyor'
}
```

Desteklenen koordinat formatları:
- **v1.5:** `<|box_start|>(x,y)<|box_end|>` — tek nokta
- **v1.0:** `[x1, y1, x2, y2]` — bounding box (merkez hesaplanır)
- **Doubao:** `<point>x y</point>` — boşlukla ayrılmış nokta

Desteklenen aksiyonlar: `click`, `left_double`, `right_single`, `drag`, `type`, `hotkey`, `scroll`, `navigate`, `navigate_back`, `wait`, `finished`, `call_user`

### vilag-browser-operator

**Playwright** tabanlı tarayıcı operatörü. `Operator` arayüzünü implemente eder.

- `screenshot()` → sayfanın tam ekran görüntüsünü base64 olarak döndürür
- `execute()` → model aksiyonunu Playwright API çağrılarına çevirir
- Chromium başlatır, viewport 1280×720 ayarlanır
- Arama motoru seçimi destekler (Google, Bing, Baidu)
- Aksiyonlar: click, double-click, right-click, type, hotkey, scroll, navigate, drag
- Singleton pattern ile uygulama genelinde tek instance

### vilag-desktop-operator

**NutJS** tabanlı masaüstü operatörü. Tüm ekranı kontrol edebilir.

- `screenshot()` → Jimp ile tam masaüstü screenshot (DPI-aware, scale factor hesabı)
- `execute()` → NutJS mouse/keyboard API'si ile fiziksel aksiyon
- `@computer-use/nut-js` üzerinden fare hızı, tuş eşlemeleri (platform-bağımlı)
- macOS'ta `Cmd`, Windows/Linux'ta `Ctrl` otomatik haritalama
- Electron uygulamasında `NutJSElectronOperator` alt sınıfı ile `desktopCapturer` kullanılır (multi-display desteği)

### vilag-electron-ipc

Electron Main ↔ Renderer süreç iletişim altyapısı:
- `registerIpcHandlers(routes)` → route map'ten IPC handler kaydı (hata yönetimi dahil)
- `removeIpcHandlers(channels)` → handler kaldırma
- `createIpcClient()` → renderer'dan tip-güvenli `invoke`, `on`, `send`

### vilag-logger

Minimal, renkli konsol logger:
- `createLogger('prefix')` ile instance oluşturulur
- Her log satırı: `[timestamp] [prefix] [LEVEL]` formatında
- Seviyeler: `debug` (cyan), `info` (green), `warn` (yellow), `error` (red)

### vilag-shared

Tüm paketler arasında paylaşılan ortak kod:

**Types:**
- `StatusEnum`: `INIT`, `RUNNING`, `PAUSE`, `END`, `CALL_USER`, `ERROR`, `MAX_LOOP`
- `ErrorStatusEnum`: `MODEL_SERVICE_ERROR`, `SCREENSHOT_ERROR`, `EXECUTE_ERROR`, `UNKNOWN_ERROR`
- `PredictionParsed`: parse edilmiş aksiyon yapısı (`action_type`, `action_inputs`, `thought`)
- `Conversation`: bir döngü adımının tam kaydı (screenshot, prediction, timing)
- `Message`: model mesaj formatı (role + content)
- `GUIAgentData`, `GUIAgentError`: event payload'ları

**Constants:**
- `UITarsModelVersion`: `V1_0`, `V1_5`, `DOUBAO_1_5_15B`, `DOUBAO_1_5_20B`
- `DEFAULT_MAX_LOOP_COUNT`: 25
- `DEFAULT_LOOP_INTERVAL_MS`: 0
- `MAX_PIXELS_*`: model-bazlı piksel limitleri

**Utils:**
- `sleep(ms)` — Promise tabanlı bekleme
- `replaceBase64Prefix(str)` — data URI prefix'ini temizleme
- `formatTimestamp(ts)` — ISO format timestamp

---

## Desktop Uygulama Akışı

### Başlangıç

1. Electron uygulaması açılır → `createMainWindow()` çağrılır
2. **HomePage** gösterilir → kullanıcı operatör modu seçer:
   - **Desktop Operator** → NutJS ile tüm ekranı kontrol eder
   - **Browser Operator** → Playwright ile tarayıcı içinde kalır

### Ajan Çalışması

1. Kullanıcı **LocalPage**'de komutu yazar ve "Run" basar
2. `ipcRenderer.invoke('runAgent')` → Main process'e IPC çağrısı
3. Main process seçilen operatöre göre instance oluşturur:
   - Browser modu → `DefaultBrowserOperator.getInstance()`
   - Desktop modu → `new NutJSElectronOperator()`
4. `GUIAgent` oluşturulur ve `agent.run(instruction)` çağrılır
5. Ajan çalışırken:
   - Desktop modunda: ana pencere gizlenir, widget penceresi + mavi çerçeve animasyonu gösterilir
   - Browser modunda: ana pencere gizlenir, sadece widget gösterilir
6. Ajan bitince/durdurulunca: widget kapanır, ana pencere geri gelir

### Preload API

Renderer process, Main process'e `window.vilagAPI` üzerinden erişir:

| Metod | Açıklama |
|-------|----------|
| `getState()` | Mevcut ajan durumunu al |
| `onStateUpdate(cb)` | Durum değişikliklerini dinle |
| `runAgent()` | Ajanı başlat |
| `stopAgent()` | Ajanı durdur |
| `pauseAgent()` | Duraklet |
| `resumeAgent()` | Devam ettir |
| `setInstructions(text)` | Komut gönder |
| `clearHistory()` | Geçmişi temizle |
| `getSettings()` | Ayarları al |
| `updateSettings(obj)` | Ayarları güncelle |

### Ayarlar (SettingsPage)

| Ayar | Varsayılan | Açıklama |
|------|-----------|----------|
| VLM Base URL | `http://localhost:1234/v1` | Model sunucu adresi |
| VLM API Key | `lm-studio` | API anahtarı |
| VLM Model Name | *(boş)* | Kullanılacak model adı |
| Max Loop Count | `25` | Maksimum döngü sayısı |
| Language | `en` | Arayüz dili (en / tr) |
| Search Engine | `google` | Varsayılan arama motoru |
| Operator | `browser` | Operatör modu |

---

## Ajan Döngüsü Akış Diyagramı

```
Kullanıcı komutu: "Chrome'da google.com'u aç"
          │
          ▼
    ┌─────────────┐
    │ Screenshot   │◄─────────────────────────┐
    │ al           │                           │
    └──────┬──────┘                           │
           │                                   │
           ▼                                   │
    ┌─────────────┐                           │
    │ Model çağır  │  screenshot (base64)      │
    │ (UITars VLM) │  + konuşma geçmişi       │
    └──────┬──────┘                           │
           │                                   │
           ▼                                   │
    ┌─────────────┐                           │
    │ Cevabı       │  "Thought: Adres çubuğuna│
    │ parse et     │   tıklamalıyım"          │
    │ (Action      │  "Action: click(...)"    │
    │  Parser)     │                           │
    └──────┬──────┘                           │
           │                                   │
           ▼                                   │
    ┌─────────────┐                           │
    │ Aksiyonu     │  click(x=500, y=50)      │
    │ yürüt        │                           │
    │ (Operator)   │                           │
    └──────┬──────┘                           │
           │                                   │
           ▼                                   │
      action_type                              │
      == 'finished'?                           │
       │         │                             │
      Evet      Hayır ─────────────────────────┘
       │
       ▼
    ┌─────────────┐
    │  Görev       │
    │  tamamlandı  │
    └─────────────┘
```

---

## Operator Arayüzü (Abstract)

Tüm operatörler bu arayüzü implemente eder:

```typescript
abstract class Operator {
  static MANUAL: { ACTION_SPACES: string[] };
  abstract screenshot(): Promise<ScreenshotOutput>;
  abstract execute(params: ExecuteParams): Promise<ExecuteOutput>;
}
```

| Operatör | Teknoloji | Kullanım Alanı |
|----------|-----------|----------------|
| `BrowserOperator` | Playwright + Chromium | Tarayıcı içi otomasyon |
| `NutJSOperator` | @computer-use/nut-js + Jimp | Masaüstü kontrolü |
| `NutJSElectronOperator` | NutJS + Electron desktopCapturer | Desktop modunda (multi-display) |

---

## Bağımlılıklar

| Paket | Kullanım |
|-------|----------|
| `openai` | OpenAI-uyumlu API iletişimi (UITarsModel) |
| `electron` (v34) | Masaüstü uygulama çatısı |
| `electron-vite` | Electron için Vite build sistemi |
| `playwright` | Tarayıcı otomasyonu (BrowserOperator) |
| `@computer-use/nut-js` | Masaüstü fare/klavye kontrolü (NutJSOperator) |
| `jimp` | Görüntü işleme (screenshot resize) |
| `react` + `react-router-dom` | UI framework + routing |
| `tailwindcss` | CSS framework (renderer) |
| `@radix-ui/*` + `shadcn/ui` | UI bileşenleri |
| `pnpm` | Monorepo paket yöneticisi |
| `turbo` (Turborepo) | Monorepo build orchestration |

---

## Notlar

- Proje **pnpm workspace** yapısındadır — `@vilag/*` namespace'i altında tüm paketler `workspace:*` olarak birbirine bağlıdır.
- **Turborepo** ile build pipeline yönetilir.
- Model tarafı **provider-agnostic** — LM Studio, vLLM veya OpenAI-uyumlu herhangi bir endpoint kullanılabilir.
- İki operatör modu birbirinden bağımsızdır; `Operator` abstract sınıfını implemente eden yeni operatörler eklenebilir.
- Electron uygulamasında `contextIsolation: true` ile güvenli IPC kullanılır (preload üzerinden `vilagAPI` expose edilir).
- Desktop modunda ajan çalışırken ekranda mavi çerçeve animasyonu (`ScreenMarker`) gösterilir ve küçük widget penceresi ile kontrol sağlanır.
