/**
 * VILAG Planner - Planner
 * Calls an LLM to break a complex user command into subtasks.
 */
import OpenAI from 'openai';
import type { PlannerConfig, Plan, Subtask } from './types';
import { PLANNER_SYSTEM_PROMPT } from './prompts';

export class Planner {
  private client: OpenAI;
  private model: string;

  constructor(config: PlannerConfig) {
    this.client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey || 'planner',
      dangerouslyAllowBrowser: false,
    });
    this.model = config.model;
  }

  /**
   * Create a plan from a user instruction.
   * Optionally provide scenario context from RAG to help the planner.
   */
  async createPlan(
    instruction: string,
    scenarioContext?: string,
  ): Promise<Plan> {
    const userMessage = scenarioContext
      ? `${instruction}\n\nReference steps:\n${scenarioContext}`
      : instruction;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
      max_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content || '';
    const subtasks = this.parseResponse(content);

    return {
      originalInstruction: instruction,
      subtasks,
    };
  }

  /**
   * Parse LLM response into subtasks. Handles edge cases gracefully.
   */
  private parseResponse(content: string): Subtask[] {
    try {
      // Strip markdown code fences if present
      const cleaned = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      // Handle both { subtasks: [...] } and direct array [...]
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
      // If JSON parsing fails, return fallback
      return this.fallbackPlan();
    }
  }

  /**
   * Fallback: if planner fails, return the original instruction as a single subtask.
   */
  private fallbackPlan(): Subtask[] {
    return [{
      id: 1,
      instruction: 'Execute the task as given',
      riskLevel: 'medium',
      requiresApproval: false,
    }];
  }
}
