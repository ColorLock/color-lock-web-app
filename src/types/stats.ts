import { DifficultyLevel } from './settings'; // Import DifficultyLevel

/**
 * Represents the overall game statistics for a user.
 * All statistics are now stored at the root level of the document.
 */
export interface GameStatistics {
  lastPlayedIsoDate: string;
  currentPuzzleCompletedStreak: number; // Represents consecutive days a puzzle was WON
  longestPuzzleCompletedStreak: number; // Longest consecutive WON days streak
  puzzleCompletedStreakDate: string | null; // Date of the last puzzle completion in the current streak
  currentTieBotStreak: number; // Represents consecutive days the bot score was TIED or BEATEN
  longestTieBotStreak: number; // Longest consecutive TIED/BEATEN days streak
  tieBotStreakDate: string | null; // Date of the last tie/beat in the current streak
  playedDays: string[];
  goalAchievedDays: string[]; // Days where bot score was met or beaten
  goalBeatenDays: string[]; // Days where bot score was strictly beaten
  totalWins: number;
  totalGamesPlayed: number;
  totalMovesUsed: number;
  totalHintsUsed: number;
  winsPerDay: { [date: string]: number }; // Count of wins per day (can be > 1 if tryAgain is used after winning)
  attemptsPerDay: { [date: string]: number }; // Total attempts per day
  hintUsageByDay: { [date: string]: number }; // Hints used per day
  bestScoresByDay: { [date: string]: number }; // Best score achieved per day
  bestScoresByDayDifficulty: { [date: string]: DifficultyLevel }; // Difficulty level when best score was achieved
  eloScoreByDay: { [date: string]: number }; // Calculated Elo score per day
  attemptsToAchieveBotScore: { [date: string]: number }; // Attempt number when bot score was first met/beaten
  attemptsToBeatBotScore: { [date: string]: number }; // Attempt number when bot score was first beaten
  attemptsToWinByDay: { [date: string]: number }; // Attempt number when puzzle was first won for the day
  currentFirstTryStreak: number; // Consecutive days won on the FIRST attempt
  longestFirstTryStreak: number; // Longest first-try win streak
  firstTryStreakDate: string | null; // Date of the last first-try win in the current streak
  attemptWhenHintUsed: { [date: string]: number | null }; // Attempt number when first hint was used
  // Elo aggregate fields
  eloScoreAvg: number | null;
  eloScoreTotal: number | null;
  eloScoreAvgLast30: number | null;
  eloScoreTotalLast30: number | null;
}

/**
 * Default statistics with initial values (Flattened structure)
 */
export const defaultStats: GameStatistics = {
  lastPlayedIsoDate: '',
  currentPuzzleCompletedStreak: 0,
  longestPuzzleCompletedStreak: 0,
  puzzleCompletedStreakDate: null,
  currentTieBotStreak: 0,
  longestTieBotStreak: 0,
  tieBotStreakDate: null,
  playedDays: [],
  goalAchievedDays: [],
  goalBeatenDays: [],
  totalWins: 0,
  totalGamesPlayed: 0,
  totalMovesUsed: 0,
  totalHintsUsed: 0,
  winsPerDay: {},
  attemptsPerDay: {},
  hintUsageByDay: {},
  bestScoresByDay: {},
  bestScoresByDayDifficulty: {},
  eloScoreByDay: {},
  attemptsToAchieveBotScore: {},
  attemptsToBeatBotScore: {},
  attemptsToWinByDay: {},
  currentFirstTryStreak: 0,
  longestFirstTryStreak: 0,
  firstTryStreakDate: null,
  attemptWhenHintUsed: {},
  // Initialize Elo aggregate fields
  eloScoreAvg: null,
  eloScoreTotal: null,
  eloScoreAvgLast30: null,
  eloScoreTotalLast30: null,
};

/**
 * Structure for an entry in the global leaderboard
 */
export interface LeaderboardEntry {
  userId: string;
  username: string | null; // Allow null if username isn't stored yet
  totalWins: number;
  totalMovesUsed: number;
  longestPuzzleCompletedStreak: number; // Use separated field
  currentPuzzleCompletedStreak: number; // Use separated field
  puzzleCompletedStreakDate: string | null; // Add this
  longestTieBotStreak: number;
  currentTieBotStreak: number;
  tieBotStreakDate: string | null;
  currentFirstTryStreak: number;
  longestFirstTryStreak: number;
  eloScoreAvg: number | null;
  eloScoreTotal: number | null;
  eloScoreAvgLast30: number | null;
  eloScoreTotalLast30: number | null;
} 