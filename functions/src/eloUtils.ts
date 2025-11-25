import * as admin from "firebase-admin";
import { logger as v2Logger } from "firebase-functions/v2"; // Assuming v2 logger
import { DifficultyLevel } from "../../src/types/settings"; // Import DifficultyLevel enum
import { GameStatistics } from "../../src/types/stats"; // Import GameStatistics type

const logger = v2Logger;

// --- ELO CALCULATION HELPER FUNCTIONS ---

/**
 * Calculates the total cumulative penalty for winning on attempt N.
 * For first attempts (N <= 1), there's no penalty.
 * For subsequent attempts, a penalty is calculated based on attempt number.
 */
export function calculateEloAttemptPenalty(winAttempt: number | null | undefined): number {
  if (winAttempt === null || winAttempt === undefined || winAttempt <= 1) {
    return 0;
  }
  
  let cumulativePenalty = 0;
  for (let k = 2; k <= winAttempt; k++) {
    // Skip penalties for attempts beyond 21
    if (k > 30) continue;
    
    // Using Math.max to prevent division by zero or sqrt of negative
    cumulativePenalty += -20 / Math.sqrt(Math.max(1, k - 1));
  }
  return cumulativePenalty;
}

/**
 * Calculates the final Elo score for a specific user on a specific date, considering difficulty.
 */
export function calculateEloScore(
    userStats: GameStatistics, // Use the specific type
    puzzleData: { algoScore: number },
    dateStr: string,
    userScore: number,
    isFirstToBeatBot: boolean = false, // New parameter with default value
    currentDifficulty?: DifficultyLevel, // Add parameter for current difficulty level
): number {
    const algoScore = puzzleData.algoScore;
    const winAttempt = userStats?.attemptsToWinByDay?.[dateStr] ?? null;
    const hintAttempt = userStats?.attemptWhenHintUsed?.[dateStr] ?? null;
    const achieveBotAttempt = userStats?.attemptsToAchieveBotScore?.[dateStr] ?? Infinity;
    
    // Use current difficulty if provided, otherwise fall back to stored difficulty or default
    const difficulty = currentDifficulty || userStats?.bestScoresByDayDifficulty?.[dateStr] || DifficultyLevel.Medium;

    // --- Difficulty Multiplier ---
    let difficultyMultiplier = 1.0; // Default for Hard

    if (difficulty === DifficultyLevel.Easy) {
        difficultyMultiplier = 0.5;
    }
    logger.debug(`Calculating Elo for ${dateStr}: Difficulty=${difficulty}, Multiplier=${difficultyMultiplier}, UserScore=${userScore}, AlgoScore=${algoScore}`);
    // --- End Difficulty Multiplier ---

    const winBonus = (winAttempt !== null && winAttempt >= 1) ? 200 : 0;
    let tieOrBeatBonus = (difficulty === DifficultyLevel.Hard && userScore <= algoScore)
        ? (200 * (algoScore - userScore + 1))
        : 0;


    // Apply difficulty multiplier to bonuses
    const adjustedWinBonus = winBonus * difficultyMultiplier;
    const adjustedTieOrBeatBonus = tieOrBeatBonus * difficultyMultiplier;

    const totalRawBonus = adjustedWinBonus + adjustedTieOrBeatBonus;

    const applyHintPenalty = (hintAttempt !== null && hintAttempt <= achieveBotAttempt);
    const hintPenaltyMultiplier = applyHintPenalty ? 0.5 : 1.0;
    const adjustedBonusWithHint = totalRawBonus * hintPenaltyMultiplier;

    const cumulativeAttemptPenalty = calculateEloAttemptPenalty(
        userStats?.attemptsToBeatBotScore?.[dateStr] ?? 
        userStats?.attemptsToAchieveBotScore?.[dateStr] ?? 
        winAttempt
    );

    // Add first-to-beat-bot bonus of 100 points if applicable
    const firstToBeatBotBonus = isFirstToBeatBot ? 200 : 0;
    
    const finalScore = adjustedBonusWithHint + cumulativeAttemptPenalty + firstToBeatBotBonus;

    logger.debug(`Elo components for ${dateStr}: winBonus=${winBonus}, tieOrBeatBonus=${tieOrBeatBonus}, diffMultiplier=${difficultyMultiplier}, hintMultiplier=${hintPenaltyMultiplier}, attemptPenalty=${cumulativeAttemptPenalty.toFixed(2)}, firstToBeatBotBonus=${firstToBeatBotBonus}, finalScore=${Math.round(finalScore)}`);

    return Math.round(finalScore);
}