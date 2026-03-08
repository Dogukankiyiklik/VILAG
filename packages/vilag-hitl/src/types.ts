/**
 * VILAG HITL - Type Definitions
 */

export interface ApprovalRequest {
  subtaskId: number;
  description: string;
  riskLevel: string;
}

export interface ApprovalResponse {
  subtaskId: number;
  approved: boolean;
}
