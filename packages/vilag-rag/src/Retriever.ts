/**
 * VILAG RAG - Retriever
 * Finds the best matching scenario for a given user query using keyword matching.
 */
import type { Scenario } from './types';
import type { ScenarioStore } from './ScenarioStore';

export class Retriever {
  private store: ScenarioStore;

  constructor(store: ScenarioStore) {
    this.store = store;
  }

  /**
   * Find the best matching scenario for a query.
   * Uses simple keyword matching: query words are compared against scenario keywords.
   * Returns the scenario with the highest match score, or null if no match.
   */
  retrieve(query: string): Scenario | null {
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1); // Skip single-char words

    const scenarios = this.store.getAll();
    let bestMatch: Scenario | null = null;
    let bestScore = 0;

    for (const scenario of scenarios) {
      const score = this.calculateScore(queryWords, scenario.keywords);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = scenario;
      }
    }

    return bestScore > 0 ? bestMatch : null;
  }

  /**
   * Calculate match score between query words and scenario keywords.
   * Exact matches score higher. Partial (substring) matches only count
   * for keywords longer than 3 characters to avoid false positives.
   */
  private calculateScore(queryWords: string[], keywords: string[]): number {
    const lowerKeywords = keywords.map((k) => k.toLowerCase());
    let score = 0;

    for (const word of queryWords) {
      for (const keyword of lowerKeywords) {
        if (word === keyword) {
          // Exact match — strong signal
          score += 3;
        } else if (keyword.length >= 4 && word.includes(keyword)) {
          // Query word contains keyword (e.g. "messaging" contains "mesaj") — only for longer keywords
          score += 1;
        } else if (word.length >= 4 && keyword.includes(word)) {
          // Keyword contains query word (e.g. "download" contains "load") — only for longer words
          score += 1;
        }
      }
    }

    return score;
  }
}
