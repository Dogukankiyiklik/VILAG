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

3. Uretim (production) derlemesi almak icin:
   ```bash
   pnpm --filter vilag-desktop run build
   ```

## Proje Yapisi

- apps/vilag-desktop: Ana Electron masaustu uygulamasi.
- packages/vilag-sdk: VILAG agent dongusunu ve LLM entegrasyonlarini icerir.
- packages/vilag-browser-operator: Tarayici kontrolu icin Playwright tabanli yapi.
- packages/vilag-action-parser: Modelden gelen metin ciktilarini aksiyonlara donusturur.
- packages/vilag-electron-ipc: Electron surecleri arasindaki iletisimi saglar.
- packages/vilag-logger: Sistem loglama araci.
- packages/vilag-shared: Moduller arasi paylasilan tipler ve sabitler.
