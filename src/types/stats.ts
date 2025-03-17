/**
 * Game statistics data structure
 */
export interface GameStatistics {
  // Today's game
  todayStats: {
    movesUsed: number;
    bestScore: number | null;
    timesPlayed: number; // number of times game was played/reset today
  };
  
  // All-time stats
  allTimeStats: {
    gamesPlayed: number;
    streak: number; // consecutive days played and won
    daysPlayed: number; // count of unique days played
    goalAchieved: number; // count of days beating or tying bot score
    totalMoves: number; // total moves made across all games
    dailyScores: { [date: string]: number }; // Used for win percentage, avg score, and streak calculations
  };
}

/**
 * Default statistics
 */
export const defaultStats: GameStatistics = {
  todayStats: {
    movesUsed: 0,
    bestScore: null,
    timesPlayed: 0,
  },
  allTimeStats: {
    gamesPlayed: 0,
    streak: 0,
    daysPlayed: 0,
    goalAchieved: 0,
    totalMoves: 0,
    dailyScores: {},
  }
}; 