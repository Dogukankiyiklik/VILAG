/*
 * Desktop modu için Electron'a özel screenshot operatörü.
 *
 * NutJSOperator'ü extend eder, sadece screenshot() metodunu override eder.
 * Neden: NutJS'in kendi screenshot'ı çoklu ekranlarda koordinat uyumsuzluğu
 * yaratıyor, Electron desktopCapturer ile bu sorun çözülüyor.
 * execute() (click, type, scroll vb.) hâlâ NutJS paketinden gelir.
 */
import type { ScreenshotOutput } from '@vilag/sdk/core';
import { NutJSOperator } from '@vilag/desktop-operator';
import { desktopCapturer } from 'electron';
import { createLogger } from '@vilag/logger';

import { getScreenSize } from '@main/utils/screen';

const logger = createLogger('NutJSElectronOperator');

export class NutJSElectronOperator extends NutJSOperator {
  static MANUAL = NutJSOperator.MANUAL;

  /* Electron desktopCapturer ile ekran görüntüsü alır. */
  public async screenshot(): Promise<ScreenshotOutput> {
    const {
      physicalSize,
      logicalSize,
      scaleFactor,
      id: primaryDisplayId,
    } = getScreenSize();

    logger.info(
      '[screenshot] primary display',
      'logicalSize:',
      logicalSize,
      'scaleFactor:',
      scaleFactor,
    );

    // Logical boyutta thumbnail al
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(logicalSize.width),
        height: Math.round(logicalSize.height),
      },
    });

    // Birincil ekranı bul, bulamazsa ilk kaynağı kullan
    const primarySource =
      sources.find(
        (source) => source.display_id === primaryDisplayId.toString(),
      ) || sources[0];

    if (!primarySource) {
      logger.error('[screenshot] Primary display source not found', {
        primaryDisplayId,
        availableSources: sources.map((s) => s.display_id),
      });
      return await super.screenshot();
    }

    // Fiziksel boyuta resize et ve base64 JPEG olarak döndür
    const screenshot = primarySource.thumbnail;
    const resized = screenshot.resize({
      width: physicalSize.width,
      height: physicalSize.height,
    });

    return {
      base64: resized.toJPEG(75).toString('base64'),
      scaleFactor,
    };
  }
}