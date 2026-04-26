import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GUIAgent } from './GUIAgent';
import { ErrorStatusEnum, StatusEnum } from '@vilag/shared/types';

const invokeMock = vi.fn();
const factorsMock = vi.fn();

vi.mock('./Model', () => ({
  UITarsModel: class {
    invoke = invokeMock;
    factors = factorsMock;
  },
}));

describe('GUIAgent system tests', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    factorsMock.mockReset();
    factorsMock.mockReturnValue([1000, 1000]);
  });

  it('measures completion rate for predefined Teams tasks', async () => {
    const teamsTasks = [
      { name: 'Send message', prediction: 'Action: finished()', expected: StatusEnum.END },
      { name: 'Create meeting', prediction: 'Action: finished()', expected: StatusEnum.END },
      { name: 'Share link', prediction: 'Action: call_user()', expected: StatusEnum.CALL_USER },
    ] as const;

    const outcomes: Array<{ name: string; status: StatusEnum }> = [];

    for (const task of teamsTasks) {
      const operator = {
        screenshot: vi.fn().mockResolvedValue({
          base64: 'data:image/png;base64,ZmFrZQ==',
          scaleFactor: 1,
          width: 1920,
          height: 1080,
        }),
        execute: vi.fn().mockResolvedValue({ status: StatusEnum.RUNNING }),
      };

      invokeMock.mockResolvedValueOnce({
        prediction: task.prediction,
        parsedPredictions: [
          {
            action_type: task.prediction.includes('call_user') ? 'call_user' : 'finished',
            action_inputs: {},
          },
        ],
      });

      let finalStatus: StatusEnum | null = null;
      const agent = new GUIAgent({
        operator: operator as any,
        model: { baseURL: 'http://mock', apiKey: 'k', model: 'm' },
        loopIntervalInMs: 0,
        maxLoopCount: 2,
        onData: ({ data }) => {
          if (
            data.status === StatusEnum.END ||
            data.status === StatusEnum.CALL_USER ||
            data.status === StatusEnum.MAX_LOOP
          ) {
            finalStatus = data.status;
          }
        },
      });

      await agent.run(task.name);
      outcomes.push({ name: task.name, status: finalStatus ?? StatusEnum.ERROR });
    }

    const completedCount = outcomes.filter((o) => o.status === StatusEnum.END).length;
    const completionRate = completedCount / outcomes.length;

    expect(outcomes).toEqual([
      { name: 'Send message', status: StatusEnum.END },
      { name: 'Create meeting', status: StatusEnum.END },
      { name: 'Share link', status: StatusEnum.CALL_USER },
    ]);
    expect(completionRate).toBeCloseTo(2 / 3, 5);
  });

  it('terminates with max_loop status when maximum loop count is reached', async () => {
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
      prediction: 'Action: click(start_box="<|box_start|>(500,500)<|box_end|>")',
      parsedPredictions: [{ action_type: 'click', action_inputs: { start_box: { x: 500, y: 500 } } }],
    });

    const statuses: StatusEnum[] = [];
    const agent = new GUIAgent({
      operator: operator as any,
      model: { baseURL: 'http://mock', apiKey: 'k', model: 'm' },
      loopIntervalInMs: 0,
      maxLoopCount: 2,
      onData: ({ data }) => statuses.push(data.status),
    });

    await agent.run('Long running task');

    expect(statuses).toContain(StatusEnum.MAX_LOOP);
  });

  it('stops after three consecutive screenshot errors', async () => {
    const operator = {
      screenshot: vi.fn().mockRejectedValue(new Error('Screenshot failed')),
      execute: vi.fn(),
    };

    const onError = vi.fn();
    const agent = new GUIAgent({
      operator: operator as any,
      model: { baseURL: 'http://mock', apiKey: 'k', model: 'm' },
      loopIntervalInMs: 0,
      maxLoopCount: 10,
      onError,
    });

    await agent.run('Any task');

    expect(operator.screenshot).toHaveBeenCalledTimes(3);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          status: ErrorStatusEnum.SCREENSHOT_ERROR,
        }),
      }),
    );
  });
});
