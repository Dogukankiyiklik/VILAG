/**
 * VILAG - Constants
 */

export enum UITarsModelVersion {
  V1_0 = 'v1.0',
  V1_5 = 'v1.5',
  DOUBAO_1_5_15B = 'doubao_1.5_15b',
  DOUBAO_1_5_20B = 'doubao_1.5_20b',
}

// Qwen2-VL smart resize constants (used by v1.5 coordinate scaling)
export const IMAGE_FACTOR = 28;
export const MAX_RATIO = 200;
export const MIN_PIXELS = 100 * IMAGE_FACTOR * IMAGE_FACTOR;

export const MAX_PIXELS_V1_0 = 2700 * IMAGE_FACTOR * IMAGE_FACTOR;
export const MAX_PIXELS_V1_5 = 1350 * IMAGE_FACTOR * IMAGE_FACTOR;
export const MAX_PIXELS_DOUBAO = 5120 * IMAGE_FACTOR * IMAGE_FACTOR;

export const DEFAULT_MAX_LOOP_COUNT = 25;
export const DEFAULT_LOOP_INTERVAL_MS = 0;
