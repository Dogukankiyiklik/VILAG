import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Planner } from './Planner';

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
}));

describe('Planner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses model output into subtasks correctly', async () => {
    const planner = new Planner({
      baseURL: 'https://api.openai.com/v1/',
      apiKey: 'test-key',
      model: 'gpt-test',
    });

    const modelContent = JSON.stringify({
      subtasks: [
        { id: 10, instruction: 'Open Teams', riskLevel: 'low' },
        { instruction: 'Send message to channel', riskLevel: 'medium' },
      ],
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: modelContent } }],
        }),
    } as Response);

    const plan = await planner.createPlan('Open teams and send an update');

    expect(plan.subtasks).toEqual([
      { id: 1, instruction: 'Open Teams', riskLevel: 'low' },
      { id: 2, instruction: 'Send message to channel', riskLevel: 'medium' },
    ]);
  });

  it('uses fallback plan when model output is invalid JSON', async () => {
    const planner = new Planner({
      baseURL: 'https://api.openai.com/v1/',
      apiKey: 'test-key',
      model: 'gpt-test',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'not-a-json' } }],
        }),
    } as Response);

    const plan = await planner.createPlan('Do a complex action');

    expect(plan.subtasks).toEqual([
      { id: 1, instruction: 'Execute the task as given', riskLevel: 'medium' },
    ]);
  });

  it('uses fallback plan when model returns empty response', async () => {
    const planner = new Planner({
      baseURL: 'https://api.openai.com/v1/',
      apiKey: 'test-key',
      model: 'gpt-test',
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: '' } }],
        }),
    } as Response);

    const plan = await planner.createPlan('Do a complex action');

    expect(plan.subtasks).toEqual([
      { id: 1, instruction: 'Execute the task as given', riskLevel: 'medium' },
    ]);
  });
});
