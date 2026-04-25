/**
 * VILAG Planner - PlanExecutor
 * Executes a plan by running each subtask sequentially through GUIAgent.
 */
import type { Plan, Subtask } from './types';

export interface PlanExecutorCallbacks {
  /** Called before each subtask starts. Return false to skip. */
  onSubtaskStart?: (subtask: Subtask) => Promise<void>;
  /** Called for medium-risk subtasks as non-blocking notification. */
  onRiskNotification?: (subtask: Subtask) => Promise<void>;
  /** Called when a subtask needs approval. Return true to approve. */
  onApprovalNeeded?: (subtask: Subtask) => Promise<boolean>;
  /** Called to execute a subtask (typically guiAgent.run). */
  onExecute: (subtask: Subtask) => Promise<void>;
  /** Called when a subtask completes. */
  onSubtaskComplete?: (subtask: Subtask) => Promise<void>;
  /** Called when a subtask fails. Return true to continue, false to stop. */
  onSubtaskError?: (subtask: Subtask, error: Error) => Promise<boolean>;
}

export class PlanExecutor {
  /**
   * Execute all subtasks in a plan sequentially.
   */
  async executePlan(
    plan: Plan,
    callbacks: PlanExecutorCallbacks,
  ): Promise<void> {
    for (const subtask of plan.subtasks) {
      // Notify subtask start
      await callbacks.onSubtaskStart?.(subtask);

      // Medium risk: notify the user, then continue.
      if (subtask.riskLevel === 'medium' && callbacks.onRiskNotification) {
        await callbacks.onRiskNotification(subtask);
      }

      // High risk: explicit approval gate.
      if (subtask.riskLevel === 'high' && callbacks.onApprovalNeeded) {
        const approved = await callbacks.onApprovalNeeded(subtask);
        if (!approved) {
          continue; // Skip this subtask
        }
      }

      // Execute the subtask
      try {
        await callbacks.onExecute(subtask);
        await callbacks.onSubtaskComplete?.(subtask);
      } catch (error) {
        const shouldContinue = await callbacks.onSubtaskError?.(
          subtask,
          error as Error,
        );
        if (!shouldContinue) break;
      }
    }
  }
}
