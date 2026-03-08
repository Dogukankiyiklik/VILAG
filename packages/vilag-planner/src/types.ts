/**
 * VILAG Planner - Type Definitions
 */

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Subtask {
  id: number;
  instruction: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

export interface Plan {
  originalInstruction: string;
  subtasks: Subtask[];
}

export interface PlannerConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}
