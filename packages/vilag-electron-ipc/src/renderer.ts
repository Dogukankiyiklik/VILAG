/**
 * VILAG - IPC Renderer Helpers
 */

/**
 * Create a type-safe IPC client for the renderer process.
 */
export function createIpcClient() {
  return {
    invoke: async (channel: string, ...args: any[]) => {
      // @ts-ignore - window.electron is set by preload
      return await window.electron?.ipcRenderer?.invoke(channel, ...args);
    },
    on: (channel: string, callback: (...args: any[]) => void) => {
      // @ts-ignore
      window.electron?.ipcRenderer?.on(channel, (_event: any, ...args: any[]) => callback(...args));
    },
    send: (channel: string, ...args: any[]) => {
      // @ts-ignore
      window.electron?.ipcRenderer?.send(channel, ...args);
    },
  };
}
