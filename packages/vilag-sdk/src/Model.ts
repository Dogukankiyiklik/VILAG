/**
 * VILAG SDK - UITarsModel
 * OpenAI-compatible model client that works with LM Studio and other providers.
 */
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { parseAction } from '@vilag/action-parser';
import { UITarsModelVersion, MAX_PIXELS_V1_0, MAX_PIXELS_V1_5 } from '@vilag/shared/constants';
import type { UITarsModelConfig, InvokeParams, InvokeOutput } from './types';

export class UITarsModel {
  private client: OpenAI;

  constructor(private readonly modelConfig: UITarsModelConfig) {
    this.client = new OpenAI({
      baseURL: modelConfig.baseURL,
      apiKey: modelConfig.apiKey || 'vilag',
      dangerouslyAllowBrowser: false,
    });
  }

  get modelName(): string {
    return this.modelConfig.model;
  }

  /**
   * Get the scaling factors based on model version.
   * [widthFactor, heightFactor] - used to scale coordinates from model output to screen.
   */
  factors(version?: UITarsModelVersion): [number, number] {
    switch (version) {
      case UITarsModelVersion.V1_5:
      case UITarsModelVersion.DOUBAO_1_5_15B:
      case UITarsModelVersion.DOUBAO_1_5_20B:
        return [1000, 1000];
      default:
        return [1000, 1000];
    }
  }

  reset(): void {
    // Reset any stateful model context if needed
  }

  /**
   * Call the VLM/LLM provider (LM Studio, vLLM, HuggingFace, etc.)
   */
  async invokeModelProvider(
    messages: ChatCompletionMessageParam[],
    options: { signal?: AbortSignal } = {},
  ): Promise<{ prediction: string; costTime?: number; costTokens?: number }> {
    const startTime = Date.now();

    const response = await this.client.chat.completions.create(
      {
        model: this.modelConfig.model,
        messages,
        max_tokens: 1024,
        temperature: 0,
      },
      { signal: options.signal },
    );

    const prediction = response.choices[0]?.message?.content || '';
    const costTime = Date.now() - startTime;
    const costTokens = response.usage?.total_tokens;

    return { prediction, costTime, costTokens };
  }

  /**
   * Main invoke method - builds messages with images and calls the model.
   */
  async invoke(params: InvokeParams): Promise<InvokeOutput> {
    const { conversations, images, screenContext, uiTarsVersion } = params;

    // Build messages for the model
    const messages: ChatCompletionMessageParam[] = [...conversations] as ChatCompletionMessageParam[];

    // Add the latest screenshot as an image in the last user message
    if (images.length > 0) {
      const lastImage = images[images.length - 1];
      const imageMessage: ChatCompletionMessageParam = {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${lastImage}`,
            },
          },
          {
            type: 'text',
            text: 'What is the next action to perform?',
          },
        ],
      };
      messages.push(imageMessage);
    }

    const { prediction, costTime, costTokens } = await this.invokeModelProvider(
      messages,
      { signal: params.headers ? undefined : undefined },
    );

    // Parse the prediction into structured actions
    const parsedPredictions = parseAction(prediction);

    return {
      prediction,
      parsedPredictions,
      costTime,
      costTokens,
    };
  }
}
