/**
 * VILAG Desktop - Preload Script
 * Exposes safe electron APIs to the renderer via contextBridge.
 */
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // State
  getState: () => ipcRenderer.invoke('getState'),
  onStateUpdate: (callback: (state: any) => void) => {
    ipcRenderer.on('stateUpdate', (_event, state) => callback(state));
  },

  // Agent control
  runAgent: () => ipcRenderer.invoke('runAgent'),
  stopAgent: () => ipcRenderer.invoke('stopAgent'),
  pauseAgent: () => ipcRenderer.invoke('pauseAgent'),
  resumeAgent: () => ipcRenderer.invoke('resumeAgent'),

  // Instructions
  setInstructions: (instructions: string) => ipcRenderer.invoke('setInstructions', instructions),
  clearHistory: () => ipcRenderer.invoke('clearHistory'),

  // Settings
  getSettings: () => ipcRenderer.invoke('getSettings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('updateSettings', settings),
};

contextBridge.exposeInMainWorld('vilagAPI', api);

export type VilagAPI = typeof api;
