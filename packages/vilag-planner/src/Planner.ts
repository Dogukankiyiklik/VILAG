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

function sanitizeApiKey(raw: string): string {
  let k = (raw || '').trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
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

    // Build auth headers per endpoint shape.
    // IMPORTANT: do NOT send both Authorization and x-goog-api-key; Google rejects
    // that combination with "Multiple authentication credentials received".
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.isOpenAICompat) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    } else {
      headers['x-goog-api-key'] = this.apiKey;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
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
