import { describe, expect, it } from 'vitest';
import { injectScenario } from './PromptInjector';
import type { Scenario } from './types';

describe('injectScenario', () => {
  it('injects matching scenario steps into system prompt', () => {
    const basePrompt = 'You are a GUI agent.';
    const scenario: Scenario = {
      id: 'teams-send-message',
      title: 'Send Teams Message',
      description: 'Send a message in Teams chat',
      keywords: ['teams', 'message'],
      steps: [
        { order: 1, action: 'Open Teams app' },
        { order: 2, action: 'Go to chat and type message' },
      ],
      preconditions: [],
      expectedResult: 'Message sent',
    };

    const injected = injectScenario(basePrompt, scenario);

    expect(injected).toContain('## Reference Scenario: Send Teams Message');
    expect(injected).toContain('1. Open Teams app');
    expect(injected).toContain('2. Go to chat and type message');
    expect(injected.startsWith(basePrompt)).toBe(true);
  });

  it('returns base prompt unchanged when no scenario is found', () => {
    const basePrompt = 'You are a GUI agent.';

    const result = injectScenario(basePrompt, null);

    expect(result).toBe(basePrompt);
  });
});
