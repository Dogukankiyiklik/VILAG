/**
 * VILAG - IPC Main Process Helpers
 */
import { ipcMain } from 'electron';

/**
 * Register IPC handlers from a route map.
 */
export function registerIpcHandlers(routes: Record<string, (...args: any[]) => any>): void {
  for (const [channel, handler] of Object.entries(routes)) {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await handler(...args);
      } catch (error) {
        console.error(`[IPC] Error in handler ${channel}:`, error);
        throw error;
      }
    });
  }
}

/**
 * Remove IPC handlers.
 */
export function removeIpcHandlers(channels: string[]): void {
  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }
}
