/**
 * VILAG RAG - Retriever
 * Finds the best matching scenario for a given user query.
 *
 * Pipeline:
 *   query -> tokenize -> normalize (Turkish -> ASCII) -> light stem -> score against scenario keywords
 *
 * Design notes:
 * - Keyword matching is used instead of embeddings because the scenario set is small (<10)
 *   and semantically well-separated. The main failure mode of the old implementation was
 *   Turkish morphology (suffixes) and diacritics, not semantic nearness.
 * - A score threshold is applied so an irrelevant query returns null instead of a random
 *   scenario. A null result is passed to the planner which is expected to handle it.
 */
import type { Scenario } from './types';
import type { ScenarioStore } from './ScenarioStore';

export interface RetrieverOptions {
  /** Minimum score required to return a match. Below this, retrieve() returns null. */
  scoreThreshold?: number;
  /** If true, logs scoring details to console. Useful during development. */
  debug?: boolean;
}

interface ScoreBreakdown {
  scenarioId: string;
  score: number;
  matches: Array<{ queryToken: string; keyword: string; type: 'exact' | 'stem' | 'substring'; points: number }>;
}

const DEFAULT_THRESHOLD = 3;
const MIN_STEM_LENGTH = 3;
const MIN_SUBSTRING_LENGTH = 4;

/**
 * Ordered list of common Turkish suffixes to strip.
 * Longer suffixes come first so they are tried before shorter ones that would
 * otherwise match as a prefix of the longer one (e.g. "-lerim" before "-ler").
 */
const TURKISH_SUFFIXES = [
  // Possessive + plural combinations
  'lerimiz', 'larimiz', 'lerimin', 'larimin',
  'lerini', 'larini', 'lerinde', 'larinda',
  'lerim', 'larim', 'lerin', 'larin',
  // Verb tenses / modality
  'iyorum', 'iyorsun', 'iyoruz', 'iyorlar',
  'ecegim', 'acagim', 'ecegiz', 'acagiz',
  'miştim', 'mistim',
  'mislar', 'misler',
  'yorum', 'yorsun', 'yoruz',
  'ecek', 'acak', 'mek', 'mak',
  'miş', 'mis', 'muş', 'mus',
  // Case suffixes
  'lerde', 'larda', 'lerden', 'lardan',
  'lere', 'lara', 'nin', 'nın', 'nun', 'nün',
  // Plurals
  'ler', 'lar',
  // Possessive / accusative / dative / locative / ablative
  'im', 'in', 'un', 'ün',
  'ya', 'ye', 'da', 'de', 'ta', 'te',
  'dan', 'den', 'tan', 'ten',
  'yi', 'yı', 'yu', 'yü',
  // Verb person endings
  'yor', 'di', 'dı', 'du', 'dü', 'ti', 'tı',
  // Single vowel suffixes (accusative/possessive)
  'a', 'e', 'i', 'ı', 'u', 'ü',
];

/**
 * Normalize text: lowercase + Turkish diacritic removal + punctuation strip.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[.,!?;:'"()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Light Turkish stemmer.
 * Strips the first matching suffix from TURKISH_SUFFIXES (longest first).
 * Preserves words shorter than MIN_STEM_LENGTH and never reduces below it.
 */
function stem(word: string): string {
  if (word.length <= MIN_STEM_LENGTH) return word;

  for (const suffix of TURKISH_SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM_LENGTH) {
      return word.slice(0, word.length - suffix.length);
    }
  }
  return word;
}

/**
 * Tokenize a string into normalized + stemmed tokens.
 * Single-character tokens are dropped.
 */
function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map(stem);
}

export class Retriever {
  private store: ScenarioStore;
  private threshold: number;
  private debug: boolean;

  /** Pre-computed normalized+stemmed keywords per scenario, built lazily. */
  private keywordCache: Map<string, string[]> = new Map();

  constructor(store: ScenarioStore, options: RetrieverOptions = {}) {
    this.store = store;
    this.threshold = options.scoreThreshold ?? DEFAULT_THRESHOLD;
    this.debug = options.debug ?? false;
  }

  /**
   * Find the best matching scenario for a query.
   * Returns null if no scenario meets the score threshold.
   */
  retrieve(query: string): Scenario | null {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return null;

    const scenarios = this.store.getAll();
    const breakdowns: ScoreBreakdown[] = [];

    let bestMatch: Scenario | null = null;
    let bestScore = 0;

    for (const scenario of scenarios) {
      const processedKeywords = this.getProcessedKeywords(scenario);
      const breakdown = this.score(queryTokens, processedKeywords, scenario.id);
      breakdowns.push(breakdown);

      if (breakdown.score > bestScore) {
        bestScore = breakdown.score;
        bestMatch = scenario;
      }
    }

    if (this.debug) {
      console.log('[Retriever] Query tokens:', queryTokens);
      console.log('[Retriever] Scores:', breakdowns.map((b) => ({ id: b.scenarioId, score: b.score })));
      if (bestMatch) {
        const best = breakdowns.find((b) => b.scenarioId === bestMatch!.id);
        console.log('[Retriever] Best match matches:', best?.matches);
      }
    }

    return bestScore >= this.threshold ? bestMatch : null;
  }

  /**
   * Normalize + stem a scenario's keywords once and cache the result.
   * Duplicates (same stem after normalization) are removed so keywords like
   * "takvim, takvimi, takvime, takvimim" don't inflate the score 4x.
   */
  private getProcessedKeywords(scenario: Scenario): string[] {
    const cached = this.keywordCache.get(scenario.id);
    if (cached) return cached;

    const seen = new Set<string>();
    const processed: string[] = [];
    for (const k of scenario.keywords) {
      const p = stem(normalize(k));
      if (p && !seen.has(p)) {
        seen.add(p);
        processed.push(p);
      }
    }
    this.keywordCache.set(scenario.id, processed);
    return processed;
  }

  /**
   * Score a token list against a scenario's processed keywords.
   * - Exact match (after normalize+stem): +3
   * - Stem equality (stem of query token == stem of keyword, but raw differs): covered by exact above
   * - Substring (either direction, for words >= 4 chars): +1
   * Each query token can match multiple keywords and accumulate points.
   */
  private score(queryTokens: string[], keywords: string[], scenarioId: string): ScoreBreakdown {
    let totalScore = 0;
    const matches: ScoreBreakdown['matches'] = [];

    for (const token of queryTokens) {
      for (const keyword of keywords) {
        if (token === keyword) {
          totalScore += 3;
          matches.push({ queryToken: token, keyword, type: 'exact', points: 3 });
        } else if (
          token.length >= MIN_SUBSTRING_LENGTH &&
          keyword.length >= MIN_SUBSTRING_LENGTH &&
          (token.includes(keyword) || keyword.includes(token))
        ) {
          totalScore += 1;
          matches.push({ queryToken: token, keyword, type: 'substring', points: 1 });
        }
      }
    }

    return { scenarioId, score: totalScore, matches };
  }
}

// Export helpers for testing
export const __internal = { normalize, stem, tokenize };
