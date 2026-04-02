# VILAG

VILAG, web tabanli uygulamalari dogrudan tarayici arayuzu uzerinden otonom olarak yonetebilen, yapay zeka destekli bir GUI platformudur. Kullanici tarafindan saglanan metin ve gorsel verileri analiz ederek Playwright yardimiyla tarayici uzerinde tiklama, yazi yazma ve gezinme gibi aksiyonlari gerceklestirir. Uygulamanin arayuzu Electron ve React ile gelistirilmistir.

## Kurulum ve Calistirma

Proje, pnpm kullanarak monorepo yapisi ile organize edilmistir. Projeyi calistirmak icin sisteminizde Node.js (tercihen v20+) ve pnpm'in kurulu olmasi gereklidir.

1. Bagimliliklari yukleyin:
   ```bash
   pnpm install
   ```

2. Projeyi gelistirme modunda calistirin:
   ```bash
   pnpm run dev
   ```
   Bu komut, hem uygulamayi derler hem de Electron masaustu penceresini baslatir.

3. LM Studio'dan gerekli modeli yükleyin ve ayarlardan modelin tam ismini gerekli kutucuğa yazın
   ```bash
   ui-tars-2b-sft
   ```

Planner API Base URL: http://localhost:11434/v1
Planner API Key: ollama
Planner Model Name: qwen2.5:3b

## Proje Yapisi

- apps/vilag-desktop: Ana Electron masaustu uygulamasi.
- packages/vilag-sdk: VILAG agent dongusunu ve LLM entegrasyonlarini icerir.
- packages/vilag-browser-operator: Tarayici kontrolu icin Playwright tabanli yapi.
- packages/vilag-action-parser: Modelden gelen metin ciktilarini aksiyonlara donusturur.
- packages/vilag-electron-ipc: Electron surecleri arasindaki iletisimi saglar.
- packages/vilag-logger: Sistem loglama araci.
- packages/vilag-shared: Moduller arasi paylasilan tipler ve sabitler.


## Düzeltilecekler
- Arayüz kötü bir durumda. Eklenebilecekler:
   - Kapatma, aşağı alma ve tam ekran yapma tuşları
   - Ajan aksiyona geçerken sağ tarafta ufak bir pencre geliyor, ui-tars mantığı, ama bu pencerede modelin çıktıları, düşünceleri gösterilmiyor.
   - Alınan ekran görüntüleri chat kısmında sağ tarafta gösterilmeli. 
- Desktop yapısı var ama tam çalışmıyor. Ui-tars'ınki incelenip ona göre tekrar düzenlenmeli.

## Eklenmesi Planlananlar
- RAG yapısına bazı senaryoları koyup modelin eğitimsiz başarısı artırılmaya çalışılmalı.
- Planner yapısı bizim asıl katkımız olmalı. Bir planlayıcı eklemeliyiz, nasıl yapılacağı ui-tars'ın README'sinde yazıyor:
   ```bash
   Planning: You can combine planning/reasoning models (such as OpenAI-o1, DeepSeek-R1) to implement complex GUIAgent logic for planning, reasoning, and execution:

   const guiAgent = new GUIAgent({
   // ... other config
   });

   const planningList = await reasoningModel.invoke({
   conversations: [
      {
         role: 'user',
         content: 'buy a ticket from beijing to shanghai',
      }
   ]
   })
   /**
   * [
   *  'open chrome',
   *  'open trip.com',
   *  'click "search" button',
   *  'select "beijing" in "from" input',
   *  'select "shanghai" in "to" input',
   *  'click "search" button',
   * ]
   */

   for (const planning of planningList) {
   await guiAgent.run(planning);
   }
   ```

- HITL yapısı eklenmeli, kritik yerlerde kullanıcıya sormalı.
- Teasm özelinde veri toplanıyor, ekstra fine-tune edilip RAG yapısı işe yaramazsa kullanılabilir.
- 7B, 2B'ye göre orijinal Ui-tars'da daha iyi çalışıyordu. ancak VILAG'da desktop bozuk olduğu için deneyemedim. Onun yerine tarayıcıda oturum açılabilir veya tarayıcı ilk açıldığında teams sayfasını açtırabiliriz. Çünkü onu açmaya çalışırken de biraz zorlanıyor. Yani amacımız Teasm sayfasını direkt ajana vermek olmalı.

- Planlama için Kılavuza bakılabilir.


## YAPILANLAR
- HITL eklendi. Ancak doğru çalışıp çalışmadığını tam kontrol edemedim.
- Planlama eklendi. Planlama opsiyonel, isteyen ayarlardan açıp, kapatabilir. Eğer kullanmak isterseniz ollama üzerinden qwen2.5:3b modelini indirip Kurulum ve Çalıştırma başlığındaki ayarları yapmanız yeterli.
- Basit bir RAG eklendi. Eşleşme olursa çekip prompt'a ekliyor. 
- Arayüzde ufak düzeltmeler yapıldı.
- Bundan sonrası var olan yapıyı daha da iyileştirmek olabilir. Şu anki halini çok az düzenlenmeye ihtyiacı var. Ayrcıa bunları Teasm özelinde denemek gerekli, ben denemedim. Tüm her şey düzeltildikten sonra var olan yapıları daha da iyileştirmek kalıyor.

---

## Klasör Hiyerarşisi

```
apps/vilag-desktop/src/
├── main/                       # Electron Main Process (backend)
│   ├── main.ts                 # Ana giriş noktası — pencere, IPC, agent döngüsü, planner/RAG/HITL
│   ├── env.ts                  # Platform tespiti (isMacOS, isWindows, isDev vb.)
│   ├── agent/
│   │   └── operator.ts         # Desktop modu için Electron desktopCapturer ile screenshot alma
│   ├── utils/
│   │   └── screen.ts           # Ekran boyutu ve scale factor hesaplama
│   └── window/
│       └── ScreenMarker.ts     # Agent çalışırken ekran kenarı animasyonu + floating widget penceresi
│
├── preload/                    # Main ↔ Renderer arası güvenli köprü
│   └── ...                     # (ileride detaylandırılacak)
│
└── renderer/                   # React UI (frontend)
    └── ...                     # (ileride detaylandırılacak)
```