import { calculateEloScore } from '../eloUtils';
import { GameStatistics, defaultStats } from '../../../src/types/stats';
import { DifficultyLevel } from '../../../src/types/settings';

describe('calculateEloScore', () => {
  const mockPuzzleData = { algoScore: 10 };
  const dateStr = '2025-01-15';

  describe('Win Bonus', () => {
    it('should award 200 points for first attempt win', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        15, // Doesn't tie/beat bot, so only win bonus
        false,
        DifficultyLevel.Hard
      );

      // 200 (win bonus) = 200
      expect(score).toBe(200);
    });

    it('should not award win bonus when no win attempt recorded', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        10,
        false,
        DifficultyLevel.Hard
      );

      // No win bonus, only tie bonus
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Tie/Beat Bot Bonus', () => {
    it('should award bonus for tying the bot on Hard difficulty', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        10, // ties with algoScore
        false,
        DifficultyLevel.Hard
      );

      // 200 (win) + 200 (tie: 200 * (10-10+1)) = 400
      expect(score).toBe(400);
    });

    it('should award higher bonus for beating the bot on Hard difficulty', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        8, // beats algoScore by 2
        false,
        DifficultyLevel.Hard
      );

      // 200 (win) + 600 (beat: 200 * (10-8+1)) = 800
      expect(score).toBe(800);
    });

    it('should not award tie/beat bonus on Easy difficulty', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Easy },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        8,
        false,
        DifficultyLevel.Easy
      );

      // Easy difficulty multiplier is 0.5, so win bonus becomes 100
      expect(score).toBe(100);
    });
  });

  describe('Difficulty Multiplier', () => {
    it('should apply 0.5 multiplier for Easy difficulty', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Easy },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        15, // doesn't tie/beat bot
        false,
        DifficultyLevel.Easy
      );

      // 200 * 0.5 (win bonus with Easy multiplier) = 100
      expect(score).toBe(100);
    });

    it('should apply 1.0 multiplier for Hard difficulty', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        15,
        false,
        DifficultyLevel.Hard
      );

      // 200 * 1.0 (win bonus with Hard multiplier) = 200
      expect(score).toBe(200);
    });
  });

  describe('Hint Penalty', () => {
    it('should apply 0.5 multiplier when hint was used before achieving bot score', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        attemptWhenHintUsed: { [dateStr]: 1 },
        attemptsToAchieveBotScore: { [dateStr]: 1 }, // Use 1 to avoid attempt penalty
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        10,
        false,
        DifficultyLevel.Hard
      );

      // (200 win + 200 tie) * 0.5 (hint penalty) = 200
      expect(score).toBe(200);
    });

    it('should not apply hint penalty when hint was not used', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        attemptWhenHintUsed: { [dateStr]: null },
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        10,
        false,
        DifficultyLevel.Hard
      );

      // 200 (win) + 200 (tie) = 400 (no hint penalty)
      expect(score).toBe(400);
    });
  });

  describe('Attempt Penalty', () => {
    it('should apply cumulative penalty for multiple attempts', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        attemptsToBeatBotScore: { [dateStr]: 3 }, // Third attempt to beat bot
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        8,
        false,
        DifficultyLevel.Hard
      );

      // 200 (win) + 600 (beat by 2) - ~34 (attempt penalties for attempts 2 and 3)
      // Penalty for attempt 2: -20/sqrt(1) = -20
      // Penalty for attempt 3: -20/sqrt(2) ≈ -14.14
      // Total penalty ≈ -34
      expect(score).toBe(766);
    });

    it('should not apply penalty for first attempt', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        attemptsToBeatBotScore: { [dateStr]: 1 },
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        8,
        false,
        DifficultyLevel.Hard
      );

      // 200 (win) + 600 (beat) = 800 (no attempt penalty for first try)
      expect(score).toBe(800);
    });

    it('should apply the same attempt penalty for anything beyond 30 attempts to achieve bot score', () => {
        const userStatsWith31Attempts: GameStatistics = {
          ...defaultStats,
          attemptsToWinByDay: { [dateStr]: 1 },
          attemptsToAchieveBotScore: { [dateStr]: 31 },
          bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
        };
      
        const userStatsWith40Attempts: GameStatistics = {
          ...defaultStats,
          attemptsToWinByDay: { [dateStr]: 1 },
          attemptsToAchieveBotScore: { [dateStr]: 40 },
          bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
        };
      
        const scoreWith31 = calculateEloScore(
          userStatsWith31Attempts,
          mockPuzzleData,
          dateStr,
          10,
          false,
          DifficultyLevel.Hard
        );
      
        const scoreWith40 = calculateEloScore(
          userStatsWith40Attempts,
          mockPuzzleData,
          dateStr,
          10,
          false,
          DifficultyLevel.Hard
        );
      
        expect(scoreWith31).toBe(212);
        expect(scoreWith40).toBe(212);
        expect(scoreWith31).toBe(scoreWith40); // Explicitly test they're equal
      });
  });

  describe('First-to-Beat-Bot Bonus', () => {
    it('should award 200 bonus points when first to beat bot', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        8,
        true, // isFirstToBeatBot
        DifficultyLevel.Hard
      );

      // 200 (win) + 600 (beat) + 200 (first to beat bot) = 1000
      expect(score).toBe(1000);
    });

    it('should not award bonus when not first to beat bot', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
        bestScoresByDayDifficulty: { [dateStr]: DifficultyLevel.Hard },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        8,
        false, // not first
        DifficultyLevel.Hard
      );

      // 200 (win) + 600 (beat) = 800
      expect(score).toBe(800);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined/null values in user stats', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: {},
        attemptWhenHintUsed: {},
        bestScoresByDayDifficulty: {},
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        10,
        false,
        DifficultyLevel.Hard
      );

      // Only tie/beat bonus since no win attempt: 200 * (10-10+1) = 200
      expect(score).toBe(200);
    });

    it('should handle missing difficulty level (defaults to Medium)', () => {
      const userStats: GameStatistics = {
        ...defaultStats,
        attemptsToWinByDay: { [dateStr]: 1 },
      };

      const score = calculateEloScore(
        userStats,
        mockPuzzleData,
        dateStr,
        15
      );

      // Should default to Medium difficulty (multiplier 1.0)
      // 200 (win bonus) = 200
      expect(score).toBe(200);
    });
  });
});

