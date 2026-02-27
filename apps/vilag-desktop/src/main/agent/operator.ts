/**
 * VILAG - Electron NutJS Operator
 *
 * Wraps the workspace NutJSOperator and adapts screenshot to use Electron's
 * desktopCapturer for reliable multi-display support.
 */
import type { ScreenshotOutput } from '@vilag/sdk/core';
import { NutJSOperator } from '@vilag/desktop-operator';
import { desktopCapturer } from 'electron';
import { createLogger } from '@vilag/logger';

import { getScreenSize } from '@main/utils/screen';

const logger = createLogger('NutJSElectronOperator');

export class NutJSElectronOperator extends NutJSOperator {
  static MANUAL = NutJSOperator.MANUAL;

  /**
   * Take a screenshot using Electron's desktopCapturer so that the
   * coordinates line up exactly with the primary display used by Electron.
   */
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

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(logicalSize.width),
        height: Math.round(logicalSize.height),
      },
    });

    const primarySource =
      sources.find(
        (source) => source.display_id === primaryDisplayId.toString(),
      ) || sources[0];

    if (!primarySource) {
      logger.error('[screenshot] Primary display source not found', {
        primaryDisplayId,
        availableSources: sources.map((s) => s.display_id),
      });
      // Fallback to default NutJS screenshot implementation
      return await super.screenshot();
    }

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
