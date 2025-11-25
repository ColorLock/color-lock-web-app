import { DifficultyLevel } from '../../../src/types/settings';
import { normalizeDifficulty, isDayAfter } from '../index';
import { calculateEloAttemptPenalty } from '../eloUtils';

describe('Helper Functions', () => {
  describe('normalizeDifficulty', () => {
    it('should convert "easy" string to Easy enum', () => {
      expect(normalizeDifficulty("easy")).toBe(DifficultyLevel.Easy);
    });

    it('should convert "medium" string to Medium enum', () => {
      expect(normalizeDifficulty("medium")).toBe(DifficultyLevel.Medium);
    });

    it('should convert "hard" string to Hard enum', () => {
      expect(normalizeDifficulty("hard")).toBe(DifficultyLevel.Hard);
    });

    it('should handle Easy enum value', () => {
      expect(normalizeDifficulty(DifficultyLevel.Easy)).toBe(DifficultyLevel.Easy);
    });

    it('should handle Medium enum value', () => {
      expect(normalizeDifficulty(DifficultyLevel.Medium)).toBe(DifficultyLevel.Medium);
    });

    it('should handle Hard enum value', () => {
      expect(normalizeDifficulty(DifficultyLevel.Hard)).toBe(DifficultyLevel.Hard);
    });

    it('should default to Hard for invalid values', () => {
      expect(normalizeDifficulty("invalid" as any)).toBe(DifficultyLevel.Hard);
    });

    it('should handle case-insensitive strings', () => {
      expect(normalizeDifficulty("EASY" as any)).toBe(DifficultyLevel.Easy);
      expect(normalizeDifficulty("Medium" as any)).toBe(DifficultyLevel.Medium);
      expect(normalizeDifficulty("HaRd" as any)).toBe(DifficultyLevel.Hard);
    });
  });

  describe('isDayAfter', () => {
    it('should return true for consecutive days', () => {
      expect(isDayAfter('2025-01-15', '2025-01-16')).toBe(true);
    });

    it('should return false for same day', () => {
      expect(isDayAfter('2025-01-15', '2025-01-15')).toBe(false);
    });

    it('should return false for non-consecutive days', () => {
      expect(isDayAfter('2025-01-15', '2025-01-17')).toBe(false);
    });

    it('should return false for previous day', () => {
      expect(isDayAfter('2025-01-16', '2025-01-15')).toBe(false);
    });

    it('should handle month boundaries correctly', () => {
      expect(isDayAfter('2025-01-31', '2025-02-01')).toBe(true);
    });

    it('should handle year boundaries correctly', () => {
      expect(isDayAfter('2024-12-31', '2025-01-01')).toBe(true);
    });

    it('should return false for null previous date', () => {
      expect(isDayAfter(null, '2025-01-15')).toBe(false);
    });

    it('should return false for undefined previous date', () => {
      expect(isDayAfter(undefined, '2025-01-15')).toBe(false);
    });

    it('should return false for invalid date strings', () => {
      expect(isDayAfter('invalid', '2025-01-15')).toBe(false);
      expect(isDayAfter('2025-01-15', 'invalid')).toBe(false);
    });

    it('should handle leap year correctly', () => {
      expect(isDayAfter('2024-02-28', '2024-02-29')).toBe(true);
      expect(isDayAfter('2024-02-29', '2024-03-01')).toBe(true);
    });
  });

  describe('calculateEloAttemptPenalty (from eloUtils)', () => {

    it('should return 0 for first attempt', () => {
      expect(calculateEloAttemptPenalty(1)).toBe(0);
    });

    it('should return 0 for null attempt', () => {
      expect(calculateEloAttemptPenalty(null)).toBe(0);
    });

    it('should return 0 for undefined attempt', () => {
      expect(calculateEloAttemptPenalty(undefined)).toBe(0);
    });

    it('should calculate penalty for second attempt', () => {
      const penalty = calculateEloAttemptPenalty(2);
      expect(penalty).toBeCloseTo(-20, 1);
    });

    it('should calculate cumulative penalty for third attempt', () => {
      const penalty = calculateEloAttemptPenalty(3);
      // -20/sqrt(1) + -20/sqrt(2) ≈ -20 + -14.14 ≈ -34.14
      expect(penalty).toBeCloseTo(-34.14, 1);
    });

    it('should calculate cumulative penalty for fifth attempt', () => {
      const penalty = calculateEloAttemptPenalty(5);
      // Sum of penalties for attempts 2-5
      // -20/sqrt(1) + -20/sqrt(2) + -20/sqrt(3) + -20/sqrt(4)
      // ≈ -20 + -14.14 + -11.55 + -10 ≈ -55.69
      expect(penalty).toBeCloseTo(-55.69, 1);
    });

    it('should cap penalties at attempt 30', () => {
      const penalty30 = calculateEloAttemptPenalty(30);
      const penalty31 = calculateEloAttemptPenalty(31);
      // Both should be the same since we cap at 30
      expect(penalty30).toBe(penalty31);
    });

    it('should produce increasing negative penalties for more attempts', () => {
      const penalty2 = calculateEloAttemptPenalty(2);
      const penalty3 = calculateEloAttemptPenalty(3);
      const penalty4 = calculateEloAttemptPenalty(4);
      
      expect(penalty3).toBeLessThan(penalty2);
      expect(penalty4).toBeLessThan(penalty3);
    });
  });
});

