/**
 * VILAG - Screen utilities
 *
 * Helper to get primary display sizes in both logical and physical pixels.
 */
import { screen } from 'electron';

import * as env from '@main/env';

export const getScreenSize = () => {
  const primaryDisplay = screen.getPrimaryDisplay();

  const logicalSize = primaryDisplay.size; // Logical = Physical / scaleX
  // On macOS retina displays, use 1 to keep coordinates simple.
  const scaleFactor = env.isMacOS ? 1 : primaryDisplay.scaleFactor;

  const physicalSize = {
    width: Math.round(logicalSize.width * scaleFactor),
    height: Math.round(logicalSize.height * scaleFactor),
  };

  return {
    id: primaryDisplay.id,
    physicalSize,
    logicalSize,
    scaleFactor,
  };
};

