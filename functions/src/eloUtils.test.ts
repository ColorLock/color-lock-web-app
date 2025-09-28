import { describe, it, expect, vi } from 'vitest';

// Mock external firebase modules used by eloUtils so tests run from repo root
vi.mock('firebase-functions/v2', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('firebase-admin', () => ({}));

import { calculateEloScore } from './eloUtils';
import { DifficultyLevel } from '../../src/types/settings';
import { defaultStats, GameStatistics } from '../../src/types/stats';

// Helper to build a minimal GameStatistics object for a given date and attempt values
function buildStats({
  date,
  winAttempt,
  achieveAttempt,
  beatAttempt,
  difficulty,
}: {
  date: string;
  winAttempt?: number | null;
  achieveAttempt?: number | null;
  beatAttempt?: number | null;
  difficulty: DifficultyLevel;
}): GameStatistics {
  const stats: GameStatistics = {
    ...defaultStats,
    attemptsToWinByDay: { ...defaultStats.attemptsToWinByDay },
    attemptsToAchieveBotScore: { ...defaultStats.attemptsToAchieveBotScore },
    attemptsToBeatBotScore: { ...defaultStats.attemptsToBeatBotScore },
    attemptWhenHintUsed: { ...defaultStats.attemptWhenHintUsed },
    bestScoresByDayDifficulty: { ...defaultStats.bestScoresByDayDifficulty },
  };

  if (winAttempt != null) stats.attemptsToWinByDay[date] = winAttempt;
  if (achieveAttempt != null) stats.attemptsToAchieveBotScore[date] = achieveAttempt;
  if (beatAttempt != null) stats.attemptsToBeatBotScore[date] = beatAttempt;
  stats.bestScoresByDayDifficulty[date] = difficulty;

  return stats;
}

describe('calculateEloScore', () => {
  const date = '2025-01-15';

  it('scenario 1: Hard, bot 9, user 9, attempt 10 -> 153', () => {
    const stats = buildStats({
      date,
      winAttempt: 10,
      achieveAttempt: 10, // tie
      beatAttempt: null,
      difficulty: DifficultyLevel.Hard,
    });

    const score = calculateEloScore(
      stats,
      { algoScore: 9 },
      date,
      9,
      false,
      DifficultyLevel.Hard,
    );

    expect(score).toBe(153);
  });

  it('scenario 2: Medium, bot 9, user 8, attempt 1 -> 60', () => {
    const stats = buildStats({
      date,
      winAttempt: 1,
      achieveAttempt: 1,
      beatAttempt: 1,
      difficulty: DifficultyLevel.Medium,
    });

    const score = calculateEloScore(
      stats,
      { algoScore: 9 },
      date,
      8,
      false,
      DifficultyLevel.Medium,
    );

    expect(score).toBe(60);
  });

  it('scenario 3: Easy, bot 9, user 6, attempt 5 -> 17', () => {
    const stats = buildStats({
      date,
      winAttempt: 5,
      achieveAttempt: 5,
      beatAttempt: 5,
      difficulty: DifficultyLevel.Easy,
    });

    const score = calculateEloScore(
      stats,
      { algoScore: 9 },
      date,
      6,
      false,
      DifficultyLevel.Easy,
    );

    expect(score).toBe(17);
  });

  it('scenario 4a: Hard, bot 9, user 8, attempt 7, first-to-beat-bot -> 364', () => {
    const stats = buildStats({
      date,
      winAttempt: 7,
      achieveAttempt: 7,
      beatAttempt: 7,
      difficulty: DifficultyLevel.Hard,
    });

    const score = calculateEloScore(
      stats,
      { algoScore: 9 },
      date,
      8,
      true,
      DifficultyLevel.Hard,
    );

    expect(score).toBe(364);
  });

  it('scenario 4b: Hard, bot 9, user 7, attempt 7, first-to-beat-bot -> 464', () => {
    const stats = buildStats({
      date,
      winAttempt: 7,
      achieveAttempt: 7,
      beatAttempt: 7,
      difficulty: DifficultyLevel.Hard,
    });

    const score = calculateEloScore(
      stats,
      { algoScore: 9 },
      date,
      7,
      true,
      DifficultyLevel.Hard,
    );

    expect(score).toBe(464);
  });

  it('scenario 4c: Medium, bot 9, user 7, attempt 12 -> 106', () => {
    const stats = buildStats({
      date,
      winAttempt: 12,
      achieveAttempt: 12,
      beatAttempt: 12,
      difficulty: DifficultyLevel.Medium,
    });

    const score = calculateEloScore(
      stats,
      { algoScore: 9 },
      date,
      7,
      false,
      DifficultyLevel.Medium,
    );

    expect(score).toBe(106);
  });

  it('scenario 5: Easy, bot 9, user 5, attempt 12 -> 35', () => {
    const stats = buildStats({
      date,
      winAttempt: 12,
      achieveAttempt: 12,
      beatAttempt: 12,
      difficulty: DifficultyLevel.Easy,
    });

    const score = calculateEloScore(
      stats,
      { algoScore: 9 },
      date,
      5,
      false,
      DifficultyLevel.Easy,
    );

    expect(score).toBe(35);
  });

  it('scenario 6: Hard, bot 9, user 10, attempt 2 -> 90', () => {
    const stats = buildStats({
      date,
      winAttempt: 2,
      achieveAttempt: null, // not achieved
      beatAttempt: null, // not beaten
      difficulty: DifficultyLevel.Hard,
    });

    const score = calculateEloScore(
      stats,
      { algoScore: 9 },
      date,
      10,
      false,
      DifficultyLevel.Hard,
    );

    expect(score).toBe(90);
  });

  it('scenario 7: Medium, bot 9, user 9, attempt 2 -> 27', () => {
    const stats = buildStats({
      date,
      winAttempt: 2,
      achieveAttempt: 2, // tie
      beatAttempt: null,
      difficulty: DifficultyLevel.Medium,
    });

    const score = calculateEloScore(
      stats,
      { algoScore: 9 },
      date,
      9,
      false,
      DifficultyLevel.Medium,
    );

    expect(score).toBe(27);
  });

  it('scenario 8: Medium, bot 9, user 7, attempt 2 -> 9', () => {
    const stats = buildStats({
      date,
      winAttempt: 2,
      achieveAttempt: 2,
      beatAttempt: 2,
      difficulty: DifficultyLevel.Medium,
    });

    const score = calculateEloScore(
      stats,
      { algoScore: 9 },
      date,
      7,
      false,
      DifficultyLevel.Medium,
    );

    expect(score).toBe(9);
  });
});


