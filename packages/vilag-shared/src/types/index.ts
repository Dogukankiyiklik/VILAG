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

// ===== Step Log Data (Debug Logging) =====
export interface StepLogData {
  /** Loop iteration number */
  loopNumber: number;
  /** ISO timestamp */
  timestamp: string;
  /** Screenshot dimensions */
  screenshot: {
    width: number;
    height: number;
    scaleFactor: number;
  };
  /** Base64 screenshot (for file saving, stripped from JSON log) */
  screenshotBase64?: string;
  /** Messages sent to VLM (images replaced with placeholder) */
  prompt: Array<{ role: string; content: string | object }>;
  /** Raw model prediction text */
  rawPrediction: string;
  /** Parsed actions from model output */
  parsedActions: PredictionParsed[];
  /** Execution results for each action */
  executeResults: Array<{
    actionType: string;
    actionInputs: Record<string, any>;
    status?: string;
    error?: string;
  }>;
  /** Timing info in ms */
  timing: {
    screenshotMs: number;
    modelMs: number;
    executeMs: number;
    totalMs: number;
  };
}

// ===== Share =====
export interface ShareVersion {
  sdkVersion?: string;
  appVersion?: string;
}
