/**
 * VILAG SDK - UITarsModel
 * OpenAI-compatible model client that works with LM Studio and other providers.
 */
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { parseAction } from '@vilag/action-parser';
import { UITarsModelVersion, MAX_PIXELS_V1_0, MAX_PIXELS_V1_5, MAX_PIXELS_DOUBAO } from '@vilag/shared/constants';
import type { UITarsModelConfig, InvokeParams, InvokeOutput } from './types';
import { Jimp } from 'jimp';

/**
 * Clean base64 string prefix
 */
function replaceBase64Prefix(base64Str: string): string {
  if (base64Str.startsWith('data:image/')) {
    return base64Str.replace(/^data:image\/\w+;base64,/, '');
  }
  return base64Str;
}

/**
 * Resize image if it exceeds max pixels
 */
async function preprocessResizeImage(
  base64Str: string,
  maxPixels: number
): Promise<string> {
  const cleanBase64 = replaceBase64Prefix(base64Str);

  if (!maxPixels || maxPixels <= 0) {
    return cleanBase64;
  }

  try {
    const buffer = Buffer.from(cleanBase64, 'base64');
    const image = await Jimp.fromBuffer(buffer);
    const width = image.bitmap.width;
    const height = image.bitmap.height;

    if (width * height > maxPixels) {
      const ratio = Math.sqrt(maxPixels / (width * height));
      const newWidth = Math.floor(width * ratio);
      const newHeight = Math.floor(height * ratio);

      image.resize({ w: newWidth, h: newHeight });
      const resizedBuffer = await image.getBuffer('image/jpeg');
      return resizedBuffer.toString('base64');
    }

    return cleanBase64;
  } catch (error) {
    console.warn('[UITarsModel] Image resize failed, using original', error);
    return cleanBase64;
  }
}

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

    // Prepare images with resizing
    const maxPixels =
      uiTarsVersion === UITarsModelVersion.V1_5
        ? MAX_PIXELS_V1_5
        : uiTarsVersion === UITarsModelVersion.DOUBAO_1_5_15B ||
          uiTarsVersion === UITarsModelVersion.DOUBAO_1_5_20B
          ? MAX_PIXELS_DOUBAO
          : MAX_PIXELS_V1_0;

    const compressedImages = await Promise.all(
      images.map(img => preprocessResizeImage(img, maxPixels))
    );

    // Add the latest screenshot as an image in the last user message
    if (compressedImages.length > 0) {
      const lastImage = compressedImages[compressedImages.length - 1];
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
