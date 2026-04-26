import { describe, expect, it, vi } from 'vitest';
import { StatusEnum } from '@vilag/shared/types';

const { mouseMoveMock, mouseClickMock } = vi.hoisted(() => ({
  mouseMoveMock: vi.fn(),
  mouseClickMock: vi.fn(),
}));

vi.mock('@computer-use/nut-js', () => ({
  screen: {},
  Button: { LEFT: 'LEFT', RIGHT: 'RIGHT', MIDDLE: 'MIDDLE' },
  Key: {},
  Point: class {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
  mouse: {
    config: {},
    move: mouseMoveMock,
    click: mouseClickMock,
    doubleClick: vi.fn(),
    drag: vi.fn(),
    scrollUp: vi.fn(),
    scrollDown: vi.fn(),
  },
  keyboard: { config: {}, pressKey: vi.fn(), releaseKey: vi.fn(), type: vi.fn() },
  sleep: vi.fn().mockResolvedValue(undefined),
  straightTo: (point: any) => point,
  clipboard: { getContent: vi.fn(), setContent: vi.fn() },
}));

import { NutJSOperator } from './index';

describe('NutJSOperator integration', () => {
  it('executes click action via NutJS mouse APIs', async () => {
    const operator = new NutJSOperator();

    const result = await operator.execute({
      prediction: 'Action: click(...)',
      parsedPrediction: {
        action_type: 'click',
        action_inputs: { start_box: { x: 500, y: 250 } },
      },
      screenWidth: 2000,
      screenHeight: 1000,
      scaleFactor: 1,
      factors: [1000, 1000],
    });

    expect(mouseMoveMock).toHaveBeenCalled();
    expect(mouseClickMock).toHaveBeenCalledWith('LEFT');
    expect(result).toEqual({ status: StatusEnum.RUNNING });
  });
});
