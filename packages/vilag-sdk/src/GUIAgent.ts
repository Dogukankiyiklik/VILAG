/**
 * VILAG SDK - GUIAgent
 * 
 * Core agent loop: screenshot → model → parse → execute → repeat
 * This is the main orchestrator that ties the operator and model together.
 */
import {
  StatusEnum,
  ErrorStatusEnum,
  type GUIAgentData,
  type GUIAgentError,
  type Conversation,
  type Message,
  type PredictionParsed,
  type StepLogData,
} from '@vilag/shared/types';
import { sleep, replaceBase64Prefix } from '@vilag/shared/utils';
import { DEFAULT_MAX_LOOP_COUNT, DEFAULT_LOOP_INTERVAL_MS } from '@vilag/shared/constants';
import type { GUIAgentConfig, Operator, Logger } from './types';
import { UITarsModel } from './Model';

const MAX_SCREENSHOT_ERROR_COUNT = 3;

export class GUIAgent<T extends Operator> {
  private readonly operator: T;
  private readonly model: UITarsModel;
  private readonly logger: Logger;
  private isPaused = false;
  private isStopped = false;
  private resumePromise: Promise<void> | null = null;
  private resolveResume: (() => void) | null = null;
  private sessionId: string;

  private readonly config: GUIAgentConfig<T>;

  constructor(config: GUIAgentConfig<T>) {
    this.config = config;
    this.operator = config.operator;
    this.model = new UITarsModel(config.model);
    this.logger = config.logger || console;
    this.sessionId = this.generateSessionId();
  }

  /**
   * Main agent loop - runs until task is finished, max loops reached, or stopped.
   */
  async run(
    instruction: string,
    historyMessages: Message[] = [],
  ): Promise<void> {
    const maxLoopCount = this.config.maxLoopCount ?? DEFAULT_MAX_LOOP_COUNT;
    const loopInterval = this.config.loopIntervalInMs ?? DEFAULT_LOOP_INTERVAL_MS;
    const signal = this.config.signal;

    let loopCount = 0;
    let screenshotErrorCount = 0;
    let lastPrediction = '';
    let repeatCount = 0;
    const MAX_REPEAT = 3;
    const conversations: Conversation[] = [];
    const messages: Message[] = [
      ...(this.config.systemPrompt
        ? [{ role: 'system' as const, content: this.config.systemPrompt }]
        : []),
      ...historyMessages,
      { role: 'user' as const, content: instruction },
    ];

    this.logger.info('[GUIAgent] Starting agent loop', { instruction, maxLoopCount });

    while (loopCount < maxLoopCount) {
      // Check abort signal
      if (signal?.aborted || this.isStopped) {
        this.logger.info('[GUIAgent] Agent stopped');
        this.emitData(StatusEnum.END, conversations);
        break;
      }

      // Handle pause (Promise-based for HITL support)
      if (this.isPaused && this.resumePromise) {
        this.emitData(StatusEnum.PAUSE, conversations);
        this.logger.info('[GUIAgent] Waiting for resume...');
        await this.resumePromise;
      }
      if (this.isStopped) break;

      loopCount++;
      this.logger.info(`[GUIAgent] Loop ${loopCount}/${maxLoopCount}`);

      try {
        const stepStartTime = Date.now();

        // === Step 1: Screenshot ===
        const screenshotStartTime = Date.now();
        let screenshotOutput;
        try {
          screenshotOutput = await this.operator.screenshot();
          screenshotErrorCount = 0;
        } catch (e) {
          screenshotErrorCount++;
          this.logger.error('[GUIAgent] Screenshot error:', e);
          if (screenshotErrorCount >= MAX_SCREENSHOT_ERROR_COUNT) {
            this.emitError(ErrorStatusEnum.SCREENSHOT_ERROR, e as Error, conversations);
            break;
          }
          await sleep(1000);
          continue;
        }
        const screenshotMs = Date.now() - screenshotStartTime;

        const { base64, scaleFactor } = screenshotOutput;
        const screenWidth = Math.round(1920 * scaleFactor); // Will be refined
        const screenHeight = Math.round(1080 * scaleFactor);

        // === Step 2: Call Model ===
        this.emitData(StatusEnum.RUNNING, conversations);

        const modelStartTime = Date.now();
        let invokeOutput;
        try {
          invokeOutput = await this.model.invoke({
            conversations: messages,
            images: [replaceBase64Prefix(base64)],
            screenContext: {
              width: Math.round(screenWidth / scaleFactor),
              height: Math.round(screenHeight / scaleFactor),
            },
            scaleFactor,
            uiTarsVersion: this.config.uiTarsVersion,
          });
        } catch (e) {
          this.logger.error('[GUIAgent] Model invoke error:', e);
          // Retry logic
          const maxRetries = this.config.retry?.model?.maxRetries ?? 3;
          let retried = false;
          for (let i = 0; i < maxRetries; i++) {
            try {
              this.logger.info(`[GUIAgent] Model retry ${i + 1}/${maxRetries}`);
              await sleep(1000 * (i + 1));
              invokeOutput = await this.model.invoke({
                conversations: messages,
                images: [replaceBase64Prefix(base64)],
                screenContext: {
                  width: Math.round(screenWidth / scaleFactor),
                  height: Math.round(screenHeight / scaleFactor),
                },
                scaleFactor,
                uiTarsVersion: this.config.uiTarsVersion,
              });
              retried = true;
              break;
            } catch {
              continue;
            }
          }
          if (!retried) {
            this.emitError(ErrorStatusEnum.MODEL_SERVICE_ERROR, e as Error, conversations);
            break;
          }
        }
        const modelMs = Date.now() - modelStartTime;

        if (!invokeOutput) break;

        const { prediction, parsedPredictions, costTime, costTokens } = invokeOutput;
        this.logger.info('[GUIAgent] Model prediction:', prediction.substring(0, 200));

        // === Repeat Detection ===
        if (prediction === lastPrediction) {
          repeatCount++;
          this.logger.warn(`[GUIAgent] Same prediction repeated (${repeatCount}/${MAX_REPEAT})`);
          if (repeatCount >= MAX_REPEAT) {
            this.logger.warn('[GUIAgent] Stopping: model stuck in loop (same prediction repeated)');
            this.emitData(StatusEnum.END, conversations);
            return;
          }
        } else {
          repeatCount = 0;
        }
        lastPrediction = prediction;

        // Build conversation entry
        const conversation: Conversation = {
          prediction,
          predictionParsed: parsedPredictions,
          screenshotBase64: base64,
          screenshotContext: {
            size: {
              width: Math.round(screenWidth / scaleFactor),
              height: Math.round(screenHeight / scaleFactor),
            },
          },
          timing: {
            modelTime: costTime,
          },
        };
        conversations.push(conversation);

        // Add assistant message to history
        messages.push({
          role: 'assistant' as const,
          content: prediction,
        });

        // === Step 3: Execute Actions ===
        const factors = this.model.factors(this.config.uiTarsVersion);
        const executeStartTime = Date.now();
        const executeResults: StepLogData['executeResults'] = [];

        for (const parsed of parsedPredictions) {
          // Check for terminal actions
          if (parsed.action_type === 'finished') {
            this.logger.info('[GUIAgent] Task finished');
            executeResults.push({ actionType: parsed.action_type, actionInputs: parsed.action_inputs, status: 'terminal' });
            // Emit step log before returning
            this.emitStepLog(loopCount, base64, scaleFactor, screenWidth, screenHeight, messages, prediction, parsedPredictions, executeResults, screenshotMs, modelMs, Date.now() - executeStartTime, Date.now() - stepStartTime);
            this.emitData(StatusEnum.END, conversations);
            return;
          }

          if (parsed.action_type === 'call_user') {
            this.logger.info('[GUIAgent] Calling user for help');
            executeResults.push({ actionType: parsed.action_type, actionInputs: parsed.action_inputs, status: 'terminal' });
            this.emitStepLog(loopCount, base64, scaleFactor, screenWidth, screenHeight, messages, prediction, parsedPredictions, executeResults, screenshotMs, modelMs, Date.now() - executeStartTime, Date.now() - stepStartTime);
            this.emitData(StatusEnum.CALL_USER, conversations);
            return;
          }

          if (parsed.action_type === 'wait') {
            this.logger.info('[GUIAgent] Waiting...');
            executeResults.push({ actionType: 'wait', actionInputs: {}, status: 'ok' });
            await sleep(5000);
            continue;
          }

          // Execute the action
          try {
            await this.operator.execute({
              prediction,
              parsedPrediction: parsed,
              screenWidth,
              screenHeight,
              scaleFactor,
              factors,
            });
            executeResults.push({ actionType: parsed.action_type, actionInputs: parsed.action_inputs, status: 'ok' });
          } catch (e) {
            this.logger.error('[GUIAgent] Execute error:', e);
            executeResults.push({ actionType: parsed.action_type, actionInputs: parsed.action_inputs, status: 'error', error: (e as Error).message });
          }
        }
        const executeMs = Date.now() - executeStartTime;
        const totalMs = Date.now() - stepStartTime;

        // === Step 4: Emit step log ===
        this.emitStepLog(loopCount, base64, scaleFactor, screenWidth, screenHeight, messages, prediction, parsedPredictions, executeResults, screenshotMs, modelMs, executeMs, totalMs);

        this.emitData(StatusEnum.RUNNING, conversations);

        // Wait interval between loops
        if (loopInterval > 0) {
          await sleep(loopInterval);
        }

        // Small delay for page to settle
        await sleep(500);

      } catch (e) {
        this.logger.error('[GUIAgent] Unexpected error in loop:', e);
        this.emitError(ErrorStatusEnum.UNKNOWN_ERROR, e as Error, conversations);
        break;
      }
    }

    if (loopCount >= maxLoopCount) {
      this.logger.info('[GUIAgent] Max loop count reached');
      this.emitData(StatusEnum.MAX_LOOP, conversations);
    }
  }

  pause(): void {
    if (this.isPaused) return; // Already paused, don't create new Promise
    this.isPaused = true;
    this.resumePromise = new Promise((resolve) => {
      this.resolveResume = resolve;
    });
    this.logger.info('[GUIAgent] Paused');
  }

  resume(): void {
    this.isPaused = false;
    if (this.resolveResume) {
      this.resolveResume();
      this.resumePromise = null;
      this.resolveResume = null;
    }
    this.logger.info('[GUIAgent] Resumed');
  }

  stop(): void {
    this.isStopped = true;
    // If paused, resume first so the loop can exit
    this.resume();
    this.logger.info('[GUIAgent] Stopped');
  }

  private emitData(status: StatusEnum, conversations: Conversation[]): void {
    const data: GUIAgentData = {
      status,
      conversations: [...conversations],
      sessionId: this.sessionId,
    };
    this.config.onData?.({ data });
  }

  private emitError(type: ErrorStatusEnum, error: Error, conversations: Conversation[]): void {
    const guiError: GUIAgentError = {
      status: type,
      message: error?.message || 'Unknown error',
      stack: error?.stack,
    };
    const data: GUIAgentData = {
      status: StatusEnum.ERROR,
      conversations: [...conversations],
      sessionId: this.sessionId,
    };
    this.config.onError?.({ data, error: guiError });
  }

  /**
   * Emit step log data for debug logging.
   * Sanitizes messages by replacing image base64 with placeholder.
   */
  private emitStepLog(
    loopNumber: number,
    screenshotBase64: string,
    scaleFactor: number,
    screenWidth: number,
    screenHeight: number,
    messages: Message[],
    rawPrediction: string,
    parsedActions: PredictionParsed[],
    executeResults: StepLogData['executeResults'],
    screenshotMs: number,
    modelMs: number,
    executeMs: number,
    totalMs: number,
  ): void {
    if (!this.config.onStepLog) return;

    // Sanitize messages: replace base64 image data with placeholder
    const sanitizedPrompt = messages.map((msg) => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      }
      if (Array.isArray(msg.content)) {
        const sanitizedContent = msg.content.map((part) => {
          if (part.type === 'image_url' && part.image_url?.url) {
            const sizeKB = Math.round((part.image_url.url.length * 3) / 4 / 1024);
            return { type: 'image_url', image_url: { url: `[BASE64_IMAGE ~${sizeKB}KB]` } };
          }
          return part;
        });
        return { role: msg.role, content: sanitizedContent };
      }
      return { role: msg.role, content: msg.content };
    });

    const stepData: StepLogData = {
      loopNumber,
      timestamp: new Date().toISOString(),
      screenshot: {
        width: Math.round(screenWidth / scaleFactor),
        height: Math.round(screenHeight / scaleFactor),
        scaleFactor,
      },
      screenshotBase64,
      prompt: sanitizedPrompt,
      rawPrediction,
      parsedActions,
      executeResults,
      timing: {
        screenshotMs,
        modelMs,
        executeMs,
        totalMs,
      },
    };

    try {
      this.config.onStepLog(stepData);
    } catch (e) {
      this.logger.error('[GUIAgent] onStepLog error:', e);
    }
  }

  private generateSessionId(): string {
    return `vilag-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
