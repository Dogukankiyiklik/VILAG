/**
 * VILAG RAG - Main Exports
 */
export { ScenarioStore } from './ScenarioStore';
export { Retriever } from './Retriever';
export { injectScenario } from './PromptInjector';
export { allScenarios } from './scenarios';
export type { Scenario, ScenarioStep } from './types';

/**
 * Convenience function: creates a ready-to-use Retriever with all built-in scenarios loaded.
 */
import { ScenarioStore } from './ScenarioStore';
import { Retriever } from './Retriever';
import { allScenarios } from './scenarios';

export function createRetriever(): Retriever {
  const store = new ScenarioStore();
  store.loadFromArray(allScenarios);
  return store.count > 0
    ? new Retriever(store)
    : new Retriever(store);
}
