/**
 * VILAG - Environment helpers
 *
 * Lightweight version of the UI-TARS env module. We currently only need
 * platform flags, but this can be extended later for config values.
 */
import os from 'node:os';

export const mode = process.env.NODE_ENV;
export const isProd = mode === 'production';
export const isDev = mode === 'development';

const { platform } = process;
export const isMacOS = platform === 'darwin';
export const isWindows = platform === 'win32';
export const isLinux = platform === 'linux';

/**
 * Detect Windows 11 based on build number.
 * @see https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information
 */
const detectingWindows11 = () => {
  if (!isWindows) return false;

  const release = os.release();
  const [major, , build] = release.split('.');
  const majorVersion = Number.parseInt(major);
  const buildNumber = Number.parseInt(build);

  return majorVersion === 10 && buildNumber >= 22000;
};

export const isWindows11 = detectingWindows11();

