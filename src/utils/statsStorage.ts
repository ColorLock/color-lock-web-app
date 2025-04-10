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
    if (yesterday && stats.allTimeStats.dailyScores) {
      stats.allTimeStats.dailyScores[yesterday] = stats.todayStats.bestScore;
    }
  }
  
  // Reset today's stats
  stats.todayStats = {
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
  const currentDate = getCurrentDate();
  
  // Update today's best score if it's null or the new score is better (lower)
  if (stats.todayStats.bestScore === null || score < stats.todayStats.bestScore) {
    stats.todayStats.bestScore = score;
  }
  
  // Update all-time best score for today if it's not set or the new score is better (lower)
  if (!stats.allTimeStats.bestScoresByDay[currentDate] || score < stats.allTimeStats.bestScoresByDay[currentDate]) {
    stats.allTimeStats.bestScoresByDay[currentDate] = score;
  }
  
  saveStats(stats);
};

/**
 * Increment the times played counter
 */
export const incrementTimesPlayed = (): void => {
  const stats = getStats();
  stats.todayStats.timesPlayed += 1;
  stats.allTimeStats.totalGamesPlayed += 1;
  saveStats(stats);
};

/**
 * Update moves used in the current game
 */
export const updateMovesUsed = (moves: number): void => {
  const stats = getStats();
  stats.allTimeStats.totalMovesUsed += moves;
  saveStats(stats);
};

/**
 * Update game statistics after a win
 */
export function updateStatsAfterWin(stats: GameStatistics, score: number, moves: number): void {
  // Update best score
  if (stats.todayStats.bestScore === null || score < stats.todayStats.bestScore) {
    stats.todayStats.bestScore = score;
  }
  
  // Update all-time best score
  const currentDate = getCurrentDate();
  if (!stats.allTimeStats.bestScoresByDay[currentDate] || score < stats.allTimeStats.bestScoresByDay[currentDate]) {
    stats.allTimeStats.bestScoresByDay[currentDate] = score;
  }
  
  // Update total wins and moves
  stats.allTimeStats.totalWins += 1;
  stats.allTimeStats.totalMovesUsed += moves;
  
  // Update streak (using currentStreak as it's the non-deprecated field)
  stats.allTimeStats.currentStreak += 1;
  
  // Update total games played
  stats.allTimeStats.totalGamesPlayed += 1;
  stats.todayStats.timesPlayed += 1;
  
  // Update attempts for today
  if (!stats.allTimeStats.attemptsPerDay[currentDate]) {
    stats.allTimeStats.attemptsPerDay[currentDate] = 0;
  }
  stats.allTimeStats.attemptsPerDay[currentDate] += 1;
  
  // Add to played days if not already present
  if (!stats.allTimeStats.playedDays.includes(currentDate)) {
    stats.allTimeStats.playedDays.push(currentDate);
  }
  
  // Update last streak date
  stats.allTimeStats.lastStreakDate = currentDate;
  
  // Update longest streak if current streak is longer
  if (stats.allTimeStats.currentStreak > stats.allTimeStats.longestStreak) {
    stats.allTimeStats.longestStreak = stats.allTimeStats.currentStreak;
  }
  
  // Add to goal achieved days if not already present
  if (!stats.allTimeStats.goalAchievedDays.includes(currentDate)) {
    stats.allTimeStats.goalAchievedDays.push(currentDate);
  }
  
  saveStats(stats);
} 