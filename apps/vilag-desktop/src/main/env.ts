/**
 * Ortam (Environment) yardımcı fonksiyonları.
 *
 * İşletim sistemi platformunu (Windows, Mac vb.) ve çalışma modunu
 * (geliştirme/production) her seferinde uzun uzun kontrol etmek yerine
 * kolayca kullanabilmemiz için tanımlanan sabitler.
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
 * Sürüm (build) numarasına bakarak bilgisayarda Windows 11 kurulu olup olmadığını tespit eder.
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