import { describe, expect, it, vi } from 'vitest';
import { BrowserOperator } from './index';

describe('BrowserOperator.screenshot', () => {
  it('converts screenshot buffer to base64 correctly', async () => {
    const buffer = Buffer.from('vilag-image-binary', 'utf8');
    const screenshot = vi.fn().mockResolvedValue(buffer);

    const operator = new BrowserOperator();
    (operator as any).getActivePage = vi.fn().mockResolvedValue({
      screenshot,
      viewportSize: () => ({ width: 1280, height: 720 }),
    });
    (operator as any).getDeviceScaleFactor = vi.fn().mockResolvedValue(1.25);

    const output = await operator.screenshot();

    expect(screenshot).toHaveBeenCalledWith({ type: 'jpeg', quality: 75 });
    expect(output.base64).toBe(buffer.toString('base64'));
    expect(output.scaleFactor).toBe(1.25);
  });
});
