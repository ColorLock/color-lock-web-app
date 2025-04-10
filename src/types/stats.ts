/**
 * Game statistics data structure
 */
export interface GameStatistics {
  // Today's game (Client-side display cache - might be slightly behind Firestore)
  todayStats: {
    bestScore: number | null;
    timesPlayed: number; // Tracks attempts *for the current session/day* on the client
  };

  // All-time stats (Fetched from Firestore)
  allTimeStats: {
    // Core stats based on descriptions
    attemptsPerDay: { [date: string]: number };
    bestScoresByDay: { [date: string]: number };
    currentStreak: number;
    goalAchievedDays: string[];
    hintUsageByDay: { [date: string]: number };
    lastStreakDate: string | null;
    longestStreak: number;
    playedDays: string[];
    totalGamesPlayed: number; // Total logical game starts/resets
    totalHintsUsed: number;
    totalMovesUsed: number; // Total moves across all attempts
    totalWins: number; // Total times goal was achieved
    winsPerDay: { [date: string]: number }; // Wins where score <= algoScore

    // First Try Stats
    firstTryStreak: number;
    longestFirstTryStreak: number;
    lastFirstTryStreakDate: string | null; // Added for accurate streak calc
    // Note: 'firstTryWins' seems redundant given other fields, can be derived if needed.
    // Keep if backend uses it, otherwise can be removed later.
    firstTryWins?: number;

    // New stat from description
    attemptsToAchieveBotScore: { [date: string]: number };

    // Deprecated/Redundant? (Review if needed, can be derived)
    gamesPlayed?: number; // totalGamesPlayed seems more accurate based on descriptions
    dailyScores?: { [date: string]: number }; // bestScoresByDay serves a similar purpose
    streak?: number; // currentStreak is the active one
  };
}

/**
 * Default statistics - Initialize all fields, especially maps/arrays
 */
export const defaultStats: GameStatistics = {
  todayStats: {
    bestScore: null,
    timesPlayed: 0, // Client-side attempt counter for the day
  },
  allTimeStats: {
    attemptsPerDay: {},
    bestScoresByDay: {},
    currentStreak: 0,
    goalAchievedDays: [],
    hintUsageByDay: {},
    lastStreakDate: null,
    longestStreak: 0,
    playedDays: [],
    totalGamesPlayed: 0,
    totalHintsUsed: 0,
    totalMovesUsed: 0,
    totalWins: 0,
    winsPerDay: {},
    firstTryStreak: 0,
    longestFirstTryStreak: 0,
    lastFirstTryStreakDate: null, // Initialize added field
    firstTryWins: 0, // Initialize if keeping
    attemptsToAchieveBotScore: {},
  }
}; 