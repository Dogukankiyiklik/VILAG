import { describe, expect, it } from 'vitest';
import { Retriever } from './Retriever';
import { ScenarioStore } from './ScenarioStore';
import type { Scenario } from './types';

const scenarios: Scenario[] = [
  {
    id: 'calendar',
    title: 'View Calendar',
    description: 'Open Teams calendar view',
    keywords: ['takvim', 'calendar', 'schedule'],
    steps: [{ order: 1, action: 'Click Calendar icon' }],
    preconditions: [],
    expectedResult: 'Calendar opens',
  },
  {
    id: 'message',
    title: 'Send Message',
    description: 'Send a quick chat message',
    keywords: ['mesaj', 'message', 'chat', 'yaz'],
    steps: [{ order: 1, action: 'Open chat and type message' }],
    preconditions: [],
    expectedResult: 'Message is sent',
  },
];

describe('Retriever', () => {
  it('matches the correct scenario for different user commands', () => {
    const store = new ScenarioStore();
    store.loadFromArray(scenarios);
    const retriever = new Retriever(store);

    const calendarMatch = retriever.retrieve('Teams takvim ac');
    const messageMatch = retriever.retrieve('Chat ekranindan bir mesaj yaz');

    expect(calendarMatch?.id).toBe('calendar');
    expect(messageMatch?.id).toBe('message');
  });

  it('returns null when no scenario is matched', () => {
    const store = new ScenarioStore();
    store.loadFromArray(scenarios);
    const retriever = new Retriever(store, { scoreThreshold: 3 });

    const match = retriever.retrieve('Bilgisayari kapat ve yeniden baslat');

    expect(match).toBeNull();
  });
});
