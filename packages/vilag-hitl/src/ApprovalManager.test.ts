import { describe, expect, it, vi } from 'vitest';
import { ApprovalManager } from './ApprovalManager';

describe('ApprovalManager', () => {
  it('resolves promise with true on approve', async () => {
    const onApprovalRequest = vi.fn();
    const manager = new ApprovalManager(onApprovalRequest);

    const approvalPromise = manager.request(1, 'Delete record', 'high');

    expect(manager.hasPending).toBe(true);
    expect(onApprovalRequest).toHaveBeenCalledWith({
      subtaskId: 1,
      description: 'Delete record',
      riskLevel: 'high',
    });

    manager.approve();

    await expect(approvalPromise).resolves.toBe(true);
    expect(manager.hasPending).toBe(false);
  });

  it('resolves promise with false on reject', async () => {
    const manager = new ApprovalManager(vi.fn());
    const approvalPromise = manager.request(2, 'Share credentials', 'high');

    manager.reject();

    await expect(approvalPromise).resolves.toBe(false);
    expect(manager.hasPending).toBe(false);
  });
});
