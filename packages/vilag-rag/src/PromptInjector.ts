/**
 * VILAG RAG - PromptInjector
 * Appends a matched scenario to the system prompt so the model can use it as reference.
 */
import type { Scenario } from './types';

/**
 * Inject a scenario into the base system prompt.
 * If no scenario is found, returns the base prompt unchanged.
 */
export function injectScenario(
  basePrompt: string,
  scenario: Scenario | null,
): string {
  if (!scenario) return basePrompt;

  const stepsText = scenario.steps
    .map((s) => `${s.order}. ${s.action}`)
    .join('\n');

  return (
    basePrompt +
    '\n\n' +
    '## Reference Scenario: ' + scenario.title + '\n' +
    'Follow these steps as a guide:\n' +
    stepsText + '\n'
  );
}
