import { describe, expect, it, vi } from 'vitest';
import { StatusEnum } from '@vilag/shared/types';
import { BrowserOperator } from './index';

describe('BrowserOperator integration', () => {
  it('executes click action via Playwright page mouse API', async () => {
    const click = vi.fn();
    const page = {
      mouse: {
        click,
      },
      viewportSize: () => ({ width: 1280, height: 720 }),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
    };

    const operator = new BrowserOperator();
    (operator as any).getActivePage = vi.fn().mockResolvedValue(page);

    const result = await operator.execute({
      prediction: 'Action: click(...)',
      parsedPrediction: {
        action_type: 'click',
        action_inputs: { start_box: { x: 500, y: 500 } },
      },
      screenWidth: 1920,
      screenHeight: 1080,
      scaleFactor: 1,
      factors: [1000, 1000],
    });

    expect(click).toHaveBeenCalledWith(640, 360);
    expect(result).toEqual({ status: StatusEnum.RUNNING });
  });
});
