import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GUIAgent } from './GUIAgent';
import { StatusEnum } from '@vilag/shared/types';
import { ApprovalManager } from '@vilag/hitl';
import { injectScenario, type Scenario } from '@vilag/rag';

const invokeMock = vi.fn();
const factorsMock = vi.fn();

vi.mock('./Model', () => ({
  UITarsModel: class {
    invoke = invokeMock;
    factors = factorsMock;
  },
}));

describe('GUIAgent integration', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    factorsMock.mockReset();
    factorsMock.mockReturnValue([1000, 1000]);
  });

  it('sends screenshot to model and forwards parsed action to operator', async () => {
    const operator = {
      screenshot: vi.fn().mockResolvedValue({
        base64: 'data:image/png;base64,ZmFrZQ==',
        scaleFactor: 1,
        width: 1920,
        height: 1080,
      }),
      execute: vi.fn().mockResolvedValue({ status: StatusEnum.RUNNING }),
    };

    invokeMock.mockResolvedValue({
      prediction: 'Thought: click\nAction: click(start_box="<|box_start|>(500,500)<|box_end|>")',
      parsedPredictions: [{ action_type: 'click', action_inputs: { start_box: { x: 500, y: 500 } } }],
      costTime: 10,
      costTokens: 20,
    });

    const agent = new GUIAgent({
      operator: operator as any,
      model: { baseURL: 'http://mock', apiKey: 'k', model: 'm' },
      loopIntervalInMs: 0,
      maxLoopCount: 1,
    });

    await agent.run('Click center');

    expect(operator.screenshot).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        images: ['ZmFrZQ=='],
      }),
    );
    expect(operator.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        parsedPrediction: expect.objectContaining({ action_type: 'click' }),
      }),
    );
  });

  it('pauses for HITL approval and continues after approval', async () => {
    const operator = {
      screenshot: vi
        .fn()
        .mockResolvedValueOnce({
          base64: 'data:image/png;base64,ZmFrZQ==',
          scaleFactor: 1,
          width: 1920,
          height: 1080,
        })
        .mockResolvedValueOnce({
          base64: 'data:image/png;base64,ZmFrZQ==',
          scaleFactor: 1,
          width: 1920,
          height: 1080,
        }),
      execute: vi.fn().mockResolvedValue({ status: StatusEnum.RUNNING }),
    };

    invokeMock
      .mockResolvedValueOnce({
        prediction: 'Action: click(start_box="<|box_start|>(500,500)<|box_end|>")',
        parsedPredictions: [{ action_type: 'click', action_inputs: { start_box: { x: 500, y: 500 } } }],
      })
      .mockResolvedValueOnce({
        prediction: 'Action: finished()',
        parsedPredictions: [{ action_type: 'finished', action_inputs: {} }],
      });

    const dataEvents: string[] = [];
    const onApprovalRequest = vi.fn();
    const approvalManager = new ApprovalManager(onApprovalRequest);

    const agent = new GUIAgent({
      operator: operator as any,
      model: { baseURL: 'http://mock', apiKey: 'k', model: 'm' },
      loopIntervalInMs: 0,
      maxLoopCount: 3,
      onData: ({ data }) => dataEvents.push(data.status),
      onBeforeExecuteAction: async ({ loopNumber }) => {
        if (loopNumber !== 1) return true;
        agent.pause();
        const approvalPromise = approvalManager.request(1, 'High risk action', 'high');
        setTimeout(() => {
          approvalManager.approve();
          agent.resume();
        }, 5);
        return approvalPromise;
      },
    });

    await agent.run('Do risky action');

    expect(operator.execute).toHaveBeenCalledTimes(1);
    expect(onApprovalRequest).toHaveBeenCalledWith({
      subtaskId: 1,
      description: 'High risk action',
      riskLevel: 'high',
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(dataEvents).toContain(StatusEnum.END);
  });

  it('injects RAG scenario into system prompt and passes context to model', async () => {
    const basePrompt = 'You are a GUI agent.';
    const scenario: Scenario = {
      id: 'share-link',
      title: 'Share Meeting Link',
      description: 'Share Teams meeting link in chat',
      keywords: ['teams', 'meeting', 'link'],
      steps: [{ order: 1, action: 'Open meeting details and copy link' }],
      preconditions: [],
      expectedResult: 'Link shared',
    };
    const systemPrompt = injectScenario(basePrompt, scenario);

    const operator = {
      screenshot: vi.fn().mockResolvedValue({
        base64: 'data:image/png;base64,ZmFrZQ==',
        scaleFactor: 1,
        width: 1920,
        height: 1080,
      }),
      execute: vi.fn().mockResolvedValue({ status: StatusEnum.RUNNING }),
    };

    invokeMock.mockResolvedValue({
      prediction: 'Action: finished()',
      parsedPredictions: [{ action_type: 'finished', action_inputs: {} }],
    });

    const agent = new GUIAgent({
      operator: operator as any,
      model: { baseURL: 'http://mock', apiKey: 'k', model: 'm' },
      systemPrompt,
      loopIntervalInMs: 0,
      maxLoopCount: 1,
    });

    await agent.run('Share the link');

    const invokeArgs = invokeMock.mock.calls[0][0];
    expect(invokeArgs.conversations[0].role).toBe('system');
    expect(invokeArgs.conversations[0].content).toContain('Reference Scenario: Share Meeting Link');
    expect(invokeArgs.conversations[0].content).toContain('1. Open meeting details and copy link');
  });
});
