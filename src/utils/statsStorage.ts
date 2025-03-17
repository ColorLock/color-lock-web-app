import { GameStatistics, defaultStats } from '../types/stats';

const STATS_STORAGE_KEY = 'color-lock-stats';
const LAST_PLAYED_DATE_KEY = 'color-lock-last-played';

/**
 * Get the current date in YYYY-MM-DD format
 */
const getCurrentDate = (): string => {
  const date = new Date();
  return date.toISOString().split('T')[0];
};

/**
 * Check if it's a new day compared to the last played date
 */
const isNewDay = (): boolean => {
  const lastPlayedDate = localStorage.getItem(LAST_PLAYED_DATE_KEY);
  const currentDate = getCurrentDate();
  return !lastPlayedDate || lastPlayedDate !== currentDate;
};

/**
 * Reset today's stats for a new day
 */
const resetDailyStats = (stats: GameStatistics): GameStatistics => {
  const currentDate = getCurrentDate();
  
  // Store yesterday's best score in dailyScores if it exists
  if (stats.todayStats.bestScore !== null) {
    const yesterday = localStorage.getItem(LAST_PLAYED_DATE_KEY);
    if (yesterday) {
      stats.allTimeStats.dailyScores[yesterday] = stats.todayStats.bestScore;
    }
  }
  
  // Reset today's stats
  stats.todayStats = {
    movesUsed: 0,
    bestScore: null,
    timesPlayed: 0
  };
  
  // Update last played date
  localStorage.setItem(LAST_PLAYED_DATE_KEY, currentDate);
  
  return stats;
};

/**
 * Get stats from local storage
 */
export const getStats = (): GameStatistics => {
  const statsJson = localStorage.getItem(STATS_STORAGE_KEY);
  let stats: GameStatistics;
  
  if (statsJson) {
    stats = JSON.parse(statsJson);
  } else {
    stats = { ...defaultStats };
  }
  
  // Check if it's a new day and reset daily stats if needed
  if (isNewDay()) {
    stats = resetDailyStats(stats);
    saveStats(stats);
  }
  
  return stats;
};

/**
 * Save stats to local storage
 */
export const saveStats = (stats: GameStatistics): void => {
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  localStorage.setItem(LAST_PLAYED_DATE_KEY, getCurrentDate());
};

/**
 * Update best score if the new score is better
 */
export const updateBestScore = (score: number): void => {
  const stats = getStats();
  
  // Update today's best score if it's null or the new score is better (lower)
  if (stats.todayStats.bestScore === null || score < stats.todayStats.bestScore) {
    stats.todayStats.bestScore = score;
  }
  
  // Update all-time best score if it's null or the new score is better (lower)
  if (stats.allTimeStats.bestScoreEver === null || score < stats.allTimeStats.bestScoreEver) {
    stats.allTimeStats.bestScoreEver = score;
  }
  
  saveStats(stats);
};

/**
 * Increment the times played counter
 */
export const incrementTimesPlayed = (): void => {
  const stats = getStats();
  stats.todayStats.timesPlayed += 1;
  stats.allTimeStats.gamesPlayed += 1;
  saveStats(stats);
};

/**
 * Update moves used in the current game
 */
export const updateMovesUsed = (moves: number): void => {
  const stats = getStats();
  stats.todayStats.movesUsed = moves;
  saveStats(stats);
};

/**
 * Update game statistics after a win
 */
export const updateStatsAfterWin = (score: number, moves: number): void => {
  const stats = getStats();
  
  // Update best score
  if (stats.todayStats.bestScore === null || score < stats.todayStats.bestScore) {
    stats.todayStats.bestScore = score;
  }
  
  // Update all-time best score
  if (stats.allTimeStats.bestScoreEver === null || score < stats.allTimeStats.bestScoreEver) {
    stats.allTimeStats.bestScoreEver = score;
  }
  
  // Update win percentage
  const totalGames = stats.allTimeStats.gamesPlayed;
  const newWins = (stats.allTimeStats.winPercentage * totalGames / 100) + 1;
  stats.allTimeStats.winPercentage = (newWins / (totalGames + 1)) * 100;
  
  // Update average moves per solve
  const currentTotalMoves = stats.allTimeStats.averageMovesPerSolve * (totalGames * (stats.allTimeStats.winPercentage / 100));
  const newTotalMoves = currentTotalMoves + moves;
  const newWinCount = totalGames * (stats.allTimeStats.winPercentage / 100) + 1;
  stats.allTimeStats.averageMovesPerSolve = newTotalMoves / newWinCount;
  
  // Update streak
  stats.allTimeStats.streak += 1;
  
  // Store today's score in dailyScores
  const currentDate = getCurrentDate();
  stats.allTimeStats.dailyScores[currentDate] = score;
  
  // Increment games played
  stats.allTimeStats.gamesPlayed += 1;
  stats.todayStats.timesPlayed += 1;
  
  saveStats(stats);
}; 