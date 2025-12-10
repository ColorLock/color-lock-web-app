import { DifficultyLevel } from '../types/settings';

export const LOSS_THRESHOLD_BY_DIFFICULTY: Record<DifficultyLevel, number> = {
  [DifficultyLevel.Easy]: 8,
  [DifficultyLevel.Medium]: 13,
  [DifficultyLevel.Hard]: 18,
};

export const DEFAULT_LOSS_THRESHOLD = LOSS_THRESHOLD_BY_DIFFICULTY[DifficultyLevel.Medium];

export function getLossThresholdForDifficulty(difficulty: DifficultyLevel): number {
  return LOSS_THRESHOLD_BY_DIFFICULTY[difficulty] ?? DEFAULT_LOSS_THRESHOLD;
}
