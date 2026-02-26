/**
 * VILAG - Shared Types
 */

// ===== Status =====
export enum StatusEnum {
  INIT = 'init',
  RUNNING = 'running',
  PAUSE = 'pause',
  END = 'end',
  CALL_USER = 'call_user',
  ERROR = 'error',
  MAX_LOOP = 'max_loop',
}

export enum ErrorStatusEnum {
  MODEL_SERVICE_ERROR = 'model_service_error',
  SCREENSHOT_ERROR = 'screenshot_error',
  EXECUTE_ERROR = 'execute_error',
  UNKNOWN_ERROR = 'unknown_error',
}

// ===== Conversation / Messages =====
export interface ScreenshotResult {
  base64: string;
  scaleFactor: number;
}

export interface PredictionParsed {
  action_type: string;
  action_inputs: Record<string, any>;
  thought?: string;
  reflection?: string | null;
}

export interface ScreenshotContext {
  size: { width: number; height: number };
}

export interface Conversation {
  prediction: string;
  predictionParsed: PredictionParsed[];
  screenshotBase64: string;
  screenshotContext: ScreenshotContext;
  timing: {
    screenshotTime?: number;
    modelTime?: number;
    actionTime?: number;
  };
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

// ===== GUIAgent Data =====
export interface GUIAgentData {
  status: StatusEnum;
  conversations: Conversation[];
  sessionId?: string;
  costTime?: number;
  costTokens?: number;
}

export interface GUIAgentError {
  status?: ErrorStatusEnum;
  message?: string;
  stack?: string;
}

// ===== Share =====
export interface ShareVersion {
  sdkVersion?: string;
  appVersion?: string;
}
