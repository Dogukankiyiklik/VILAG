/**
 * VILAG RAG - Type Definitions
 */

export interface ScenarioStep {
  order: number;
  action: string;        // "Sol panelde Calendar ikonuna tıkla"
  element?: string;      // "Calendar icon"
  actionType?: string;   // "click" | "type" | "scroll" | "navigate"
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  keywords: string[];    // TR + EN keywords for matching
  steps: ScenarioStep[];
  preconditions: string[];
  expectedResult: string;
}
