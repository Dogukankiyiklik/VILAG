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

      // Handle pause
      while (this.isPaused && !this.isStopped) {
        this.emitData(StatusEnum.PAUSE, conversations);
        await sleep(500);
      }
      if (this.isStopped) break;

      loopCount++;
      this.logger.info(`[GUIAgent] Loop ${loopCount}/${maxLoopCount}`);

      try {
        // === Step 1: Screenshot ===
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

        const { base64, scaleFactor } = screenshotOutput;
        const screenWidth = Math.round(1920 * scaleFactor); // Will be refined
        const screenHeight = Math.round(1080 * scaleFactor);

        // === Step 2: Call Model ===
        this.emitData(StatusEnum.RUNNING, conversations);

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

        if (!invokeOutput) break;

        const { prediction, parsedPredictions, costTime, costTokens } = invokeOutput;
        this.logger.info('[GUIAgent] Model prediction:', prediction.substring(0, 200));

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

        for (const parsed of parsedPredictions) {
          // Check for terminal actions
          if (parsed.action_type === 'finished') {
            this.logger.info('[GUIAgent] Task finished');
            this.emitData(StatusEnum.END, conversations);
            return;
          }

          if (parsed.action_type === 'call_user') {
            this.logger.info('[GUIAgent] Calling user for help');
            this.emitData(StatusEnum.CALL_USER, conversations);
            return;
          }

          if (parsed.action_type === 'wait') {
            this.logger.info('[GUIAgent] Waiting...');
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
          } catch (e) {
            this.logger.error('[GUIAgent] Execute error:', e);
            // Non-fatal, continue to next loop
          }
        }

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
    this.isPaused = true;
    this.logger.info('[GUIAgent] Paused');
  }

  resume(): void {
    this.isPaused = false;
    this.logger.info('[GUIAgent] Resumed');
  }

  stop(): void {
    this.isStopped = true;
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

  private generateSessionId(): string {
    return `vilag-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
