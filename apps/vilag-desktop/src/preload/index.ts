/**
 * VILAG Desktop - Preload (Önyükleme) Scripti
 * contextBridge aracılığıyla güvenli Electron API'lerini renderer (ön yüz) sürecine sunar.
 */
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Durum (State) Yönetimi
  getState: () => ipcRenderer.invoke('getState'),
  onStateUpdate: (callback: (state: any) => void) => {
    ipcRenderer.on('stateUpdate', (_event, state) => callback(state));
  },

  // Ajan (Agent) Kontrolü
  runAgent: () => ipcRenderer.invoke('runAgent'),
  stopAgent: () => ipcRenderer.invoke('stopAgent'),
  pauseAgent: () => ipcRenderer.invoke('pauseAgent'),
  resumeAgent: () => ipcRenderer.invoke('resumeAgent'),

  // Talimatlar ve Geçmiş
  setInstructions: (instructions: string) => ipcRenderer.invoke('setInstructions', instructions),
  clearHistory: () => ipcRenderer.invoke('clearHistory'),
  createSession: () => ipcRenderer.invoke('createSession'),
  selectSession: (sessionId: string) => ipcRenderer.invoke('selectSession', sessionId),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('deleteSession', sessionId),
  clearAllSessions: () => ipcRenderer.invoke('clearAllSessions'),

  // Ayarlar
  getSettings: () => ipcRenderer.invoke('getSettings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('updateSettings', settings),

  // HITL (Human in the Loop) - Onay Mekanizması
  onApprovalRequest: (callback: (request: any) => void) => {
    ipcRenderer.on('approval-request', (_event, request) => callback(request));
  },
  respondApproval: (approved: boolean) => ipcRenderer.invoke('approvalResponse', approved),

  // Pencere Kontrolleri
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
};

contextBridge.exposeInMainWorld('vilagAPI', api);

export type VilagAPI = typeof api;
