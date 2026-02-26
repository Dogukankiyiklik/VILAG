/**
 * VILAG SDK - Types
 */
import type {
  Message,
  GUIAgentData,
  PredictionParsed,
  ScreenshotResult,
  GUIAgentError,
  StatusEnum,
} from '@vilag/shared/types';
import { UITarsModelVersion } from '@vilag/shared/constants';

// ===== Operator Interface =====
export interface ExecuteParams {
  prediction: string;
  parsedPrediction: PredictionParsed;
  screenWidth: number;
  screenHeight: number;
  scaleFactor: number;
  factors: [number, number];
}

export type ExecuteOutput = { status: StatusEnum } & (object | void);

export interface ScreenshotOutput extends ScreenshotResult {}

export abstract class Operator {
  static MANUAL: {
    ACTION_SPACES: string[];
  };
  abstract screenshot(): Promise<ScreenshotOutput>;
  abstract execute(params: ExecuteParams): Promise<ExecuteOutput>;
}

// ===== Model Interface =====
export interface InvokeParams {
  conversations: Message[];
  images: string[];
  screenContext: { width: number; height: number };
  scaleFactor?: number;
  uiTarsVersion?: UITarsModelVersion;
  headers?: Record<string, string>;
}

export interface InvokeOutput {
  prediction: string;
  parsedPredictions: PredictionParsed[];
  costTime?: number;
  costTokens?: number;
}

// ===== Model Config =====
export interface UITarsModelConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  useResponsesApi?: boolean;
}

// ===== Logger =====
export type Logger = Pick<Console, 'log' | 'error' | 'warn' | 'info'>;

// ===== GUIAgent Config =====
export interface RetryConfig {
  maxRetries: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export interface GUIAgentConfig<TOperator> {
  operator: TOperator;
  model: UITarsModelConfig;
  systemPrompt?: string;
  signal?: AbortSignal;
  onData?: (params: { data: GUIAgentData }) => void;
  onError?: (params: { data: GUIAgentData; error: GUIAgentError }) => void;
  logger?: Logger;
  retry?: {
    model?: RetryConfig;
    screenshot?: RetryConfig;
    execute?: RetryConfig;
  };
  maxLoopCount?: number;
  loopIntervalInMs?: number;
  uiTarsVersion?: UITarsModelVersion;
}
