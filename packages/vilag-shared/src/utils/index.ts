/**
 * VILAG - Shared Utilities
 */

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const replaceBase64Prefix = (base64: string): string => {
  return base64.replace(/^data:image\/\w+;base64,/, '');
};

export const formatTimestamp = (ts: number): string => {
  return new Date(ts).toISOString();
};
