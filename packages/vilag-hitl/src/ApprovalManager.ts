/**
 * VILAG HITL - ApprovalManager
 * Manages approval requests using Promises.
 * When approval is needed, it sends a request via callback and waits for the response.
 */
import type { ApprovalRequest } from './types';

export class ApprovalManager {
  private pendingResolve: ((approved: boolean) => void) | null = null;
  private onApprovalRequest: (request: ApprovalRequest) => void;

  constructor(onApprovalRequest: (request: ApprovalRequest) => void) {
    this.onApprovalRequest = onApprovalRequest;
  }

  /**
   * Request approval for a subtask. Returns a Promise that resolves
   * to true (approved) or false (rejected) when the user responds.
   */
  async request(subtaskId: number, description: string, riskLevel: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.onApprovalRequest({
        subtaskId,
        description,
        riskLevel,
      });
    });
  }

  /**
   * Called when user approves the action.
   */
  approve(): void {
    if (this.pendingResolve) {
      this.pendingResolve(true);
      this.pendingResolve = null;
    }
  }

  /**
   * Called when user rejects the action.
   */
  reject(): void {
    if (this.pendingResolve) {
      this.pendingResolve(false);
      this.pendingResolve = null;
    }
  }

  /**
   * Check if there's a pending approval request.
   */
  get hasPending(): boolean {
    return this.pendingResolve !== null;
  }
}
