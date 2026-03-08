/**
 * VILAG RAG - ScenarioStore
 * Loads JSON scenario files and holds them in memory.
 */
import type { Scenario } from './types';

export class ScenarioStore {
  private scenarios: Scenario[] = [];

  /**
   * Load scenarios from an array (pre-imported JSON files).
   */
  loadFromArray(scenarios: Scenario[]): void {
    this.scenarios = scenarios;
  }

  /**
   * Get all loaded scenarios.
   */
  getAll(): Scenario[] {
    return this.scenarios;
  }

  /**
   * Get a scenario by ID.
   */
  getById(id: string): Scenario | null {
    return this.scenarios.find((s) => s.id === id) ?? null;
  }

  /**
   * Get the total number of loaded scenarios.
   */
  get count(): number {
    return this.scenarios.length;
  }
}
