/**
 * VILAG - Electron IPC Types
 */
export type IpcHandler = {
  input: any;
  output: any;
};

export type IpcRoutes = Record<string, IpcHandler>;
