/**
 * Game statistics data structure
 */
export interface GameStatistics {
  // Today's game
  todayStats: {
    movesUsed: number;
    bestScore: number | null;
    timeSpent: number; // in seconds
  };
  
  // All-time stats
  allTimeStats: {
    gamesPlayed: number;
    winPercentage: number;
    averageMovesPerSolve: number;
    bestScoreEver: number | null;
    streak: number; // consecutive days played
    dailyScores: { [date: string]: number }; // For visualization
  };
}

/**
 * Default statistics
 */
export const defaultStats: GameStatistics = {
  todayStats: {
    movesUsed: 0,
    bestScore: null,
    timeSpent: 0,
  },
  allTimeStats: {
    gamesPlayed: 0,
    winPercentage: 0,
    averageMovesPerSolve: 0,
    bestScoreEver: null,
    streak: 0,
    dailyScores: {},
  }
}; 