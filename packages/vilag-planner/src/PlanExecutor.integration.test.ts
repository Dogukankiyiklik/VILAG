import { describe, expect, it, vi } from 'vitest';
import { Planner } from './Planner';
import { PlanExecutor } from './PlanExecutor';

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
}));

describe('Planner + PlanExecutor integration', () => {
  it('creates subtasks and executes them sequentially via GUIAgent', async () => {
    const planner = new Planner({
      baseURL: 'https://api.openai.com/v1/',
      apiKey: 'test-key',
      model: 'gpt-test',
    });
    const executor = new PlanExecutor();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  subtasks: [
                    { instruction: 'Open Teams', riskLevel: 'low' },
                    { instruction: 'Send update in chat', riskLevel: 'medium' },
                  ],
                }),
              },
            },
          ],
        }),
    } as Response);

    const plan = await planner.createPlan('Open Teams and send update');
    const guiAgent = {
      run: vi.fn().mockResolvedValue(undefined),
    };
    const executionOrder: string[] = [];

    await executor.executePlan(plan, {
      onExecute: async (subtask) => {
        executionOrder.push(subtask.instruction);
        await guiAgent.run(subtask.instruction);
      },
    });

    expect(executionOrder).toEqual(['Open Teams', 'Send update in chat']);
    expect(guiAgent.run).toHaveBeenNthCalledWith(1, 'Open Teams');
    expect(guiAgent.run).toHaveBeenNthCalledWith(2, 'Send update in chat');
  });
});
