/**
 * VILAG Planner - Planner
 * Calls an LLM to break a complex user command into subtasks.
 *
 * Uses raw fetch instead of the OpenAI SDK so we can see real error bodies
 * from providers like Gemini (which the SDK swallows due to gzip handling).
 *
 * Authentication rules (Gemini has TWO different endpoints with different auth):
 * - OpenAI-compatible endpoint  (/v1beta/openai/...)    -> Authorization: Bearer <key>
 * - Native Gemini endpoint      (/v1beta/models/...)    -> x-goog-api-key: <key>
 * - Any other OpenAI-compatible provider                -> Authorization: Bearer <key>
 *
 * Note: earlier versions of this file used x-goog-api-key for all Gemini
 * traffic, which works for the native endpoint but is rejected by the
 * OpenAI-compatible endpoint with "Missing or invalid Authorization header".
 */
import type { PlannerConfig, Plan, Subtask } from './types';
import { PLANNER_SYSTEM_PROMPT } from './prompts';
import { GoogleGenAI } from '@google/genai';

function sanitizeApiKey(raw: string): string {
  let k = (raw || '').trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  if (/^x-goog-api-key\s*:/i.test(k)) {
    k = k.replace(/^x-goog-api-key\s*:/i, '').trim();
  }
  if (/^authorization\s*:/i.test(k)) {
    k = k.replace(/^authorization\s*:/i, '').trim();
  }
  if (/^bearer\s+/i.test(k)) {
    k = k.replace(/^bearer\s+/i, '').trim();
  }
  if (/^key=/i.test(k)) {
    k = k.replace(/^key=/i, '').trim();
  }
  const urlKeyMatch = k.match(/[?&]key=([^&\s]+)/);
  if (urlKeyMatch) {
    k = urlKeyMatch[1];
  }
  return k;
}

function maskKey(k: string): string {
  if (!k) return '(empty)';
  if (k.length < 10) return `(len=${k.length}, too short to mask safely)`;
  return `len=${k.length} ${k.slice(0, 4)}...${k.slice(-2)}`;
}

export class Planner {
  private baseURL: string;
  private apiKey: string;
  private model: string;
  private isGemini: boolean;
  private isOpenAICompat: boolean;

  constructor(config: PlannerConfig) {
    if (!config.baseURL) throw new Error('Planner: baseURL is required');
    if (config.baseURL.includes('?')) {
      throw new Error(
        'Planner: baseURL must not contain a query string (like "?key=..."). ' +
        'Put the API key in the apiKey field instead.',
      );
    }
    this.baseURL = config.baseURL.endsWith('/') ? config.baseURL : config.baseURL + '/';
    this.apiKey = sanitizeApiKey(config.apiKey || '');
    this.model = config.model;
    this.isGemini = this.baseURL.includes('generativelanguage.googleapis.com');
    // Gemini exposes an OpenAI-shaped endpoint at /v1beta/openai/ which REQUIRES
    // Authorization: Bearer. The native endpoint at /v1beta/models/ uses x-goog-api-key.
    this.isOpenAICompat = this.baseURL.includes('/openai/') || !this.isGemini;

    console.log('[Planner] configured:', {
      baseURL: this.baseURL,
      model: this.model,
      apiKey: maskKey(this.apiKey),
      provider: this.isGemini ? 'gemini' : 'openai-compat',
      authMode: this.isOpenAICompat ? 'Authorization: Bearer' : 'x-goog-api-key',
    });
  }

  async createPlan(
    instruction: string,
    scenarioContext?: string,
  ): Promise<Plan> {
    const userMessage = scenarioContext
      ? `${instruction}\n\nReference steps:\n${scenarioContext}`
      : instruction;

    if (this.isGemini) {
      // Keep Gemini path simple and aligned with official SDK docs.
      const ai = new GoogleGenAI({ apiKey: this.apiKey });

      const maxAttempts = 3;
      let contentFromNative = '';
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await ai.models.generateContent({
            model: this.model,
            config: {
              systemInstruction: PLANNER_SYSTEM_PROMPT,
              temperature: 0,
              maxOutputTokens: 1024,
            },
            contents: userMessage,
          } as any);

          contentFromNative =
            (response as any)?.text ||
            (response as any)?.candidates?.[0]?.content?.parts
              ?.map((p: any) => p?.text || '')
              .join('\n')
              .trim() ||
            '';
          break;
        } catch (err: any) {
          lastError = err;
          const status = err?.status ?? err?.code;
          const message = String(err?.message || '');
          const retryable = status === 503 || /UNAVAILABLE|high demand/i.test(message);
          if (!retryable || attempt === maxAttempts) {
            break;
          }
          const waitMs = 1200 * attempt;
          console.warn(`[Planner] Gemini busy (attempt ${attempt}/${maxAttempts}). Retrying in ${waitMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }

      if (!contentFromNative) {
        console.error('[Planner] Gemini SDK request failed');
        console.error('[Planner] model:', this.model);
        console.error('[Planner] apiKey:', maskKey(this.apiKey));
        console.error('[Planner] last error:', lastError?.message || lastError);
        throw new Error(`Planner Gemini error: ${lastError?.message || 'Unknown error'}`);
      }

      const subtasks = this.parseResponse(contentFromNative);
      return {
        originalInstruction: instruction,
        subtasks,
      };
    }

    // Non-Gemini providers: OpenAI-compatible /chat/completions path.
    const url = this.baseURL + 'chat/completions';
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
      max_tokens: 1024,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      console.error('[Planner] Network error:', err?.message ?? err);
      throw err;
    }

    const rawBody = await response.text();

    if (!response.ok) {
      console.error('[Planner] Request failed');
      console.error('[Planner] URL:', url);
      console.error('[Planner] model:', this.model);
      console.error('[Planner] apiKey:', maskKey(this.apiKey));
      console.error('[Planner] auth header:', this.isOpenAICompat ? 'Authorization: Bearer' : 'x-goog-api-key');
      console.error('[Planner] status:', response.status);
      console.error('[Planner] response body:', rawBody);
      throw new Error(`Planner HTTP ${response.status}: ${rawBody}`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      console.error('[Planner] Non-JSON success body:', rawBody);
      throw new Error('Planner returned non-JSON response');
    }

    const content: string = parsed.choices?.[0]?.message?.content ?? '';
    const subtasks = this.parseResponse(content);

    return {
      originalInstruction: instruction,
      subtasks,
    };
  }

  private parseResponse(content: string): Subtask[] {
    try {
      const cleaned = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const parsed = JSON.parse(cleaned);
      const rawTasks = Array.isArray(parsed) ? parsed : parsed.subtasks;

      if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
        return this.fallbackPlan();
      }

      return rawTasks.map((t: any, idx: number) => ({
        id: t.id ?? idx + 1,
        instruction: t.instruction || t.task || '',
        riskLevel: t.riskLevel || 'low',
        requiresApproval: t.requiresApproval ?? t.riskLevel === 'high',
      }));
    } catch {
      return this.fallbackPlan();
    }
  }

  private fallbackPlan(): Subtask[] {
    return [{
      id: 1,
      instruction: 'Execute the task as given',
      riskLevel: 'medium',
      requiresApproval: false,
    }];
  }
}
