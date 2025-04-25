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
  
  // Update best score for today if it's not set or the new score is better (lower)
  if (!stats.bestScoresByDay[currentDate] || score < stats.bestScoresByDay[currentDate]) {
    stats.bestScoresByDay[currentDate] = score;
  }
  
  saveStats(stats);
};

/**
 * Increment the times played counter
 */
export const incrementTimesPlayed = (): void => {
  const stats = getStats();
  stats.totalGamesPlayed += 1;
  saveStats(stats);
};

/**
 * Update moves used in the current game
 */
export const updateMovesUsed = (moves: number): void => {
  const stats = getStats();
  stats.totalMovesUsed += moves;
  saveStats(stats);
};

/**
 * Update game statistics after a win
 */
export function updateStatsAfterWin(stats: GameStatistics, score: number, moves: number): void {
  const currentDate = getCurrentDate();
  
  // Update best score in bestScoresByDay
  if (!stats.bestScoresByDay[currentDate] || score < stats.bestScoresByDay[currentDate]) {
    stats.bestScoresByDay[currentDate] = score;
  }
  
  // Update total wins and moves
  stats.totalWins += 1;
  stats.totalMovesUsed += moves;
  
  // Update streak properly based on consecutive days
  const today = new Date(currentDate);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  
  if (stats.puzzleCompletedStreakDate === yesterdayStr) {
    // If last streak was yesterday, increment streak
    stats.currentPuzzleCompletedStreak = (stats.currentPuzzleCompletedStreak || 0) + 1;
  } else if (stats.puzzleCompletedStreakDate !== currentDate) {
    // If this is the first win today and not continuing a streak, reset to 1
    stats.currentPuzzleCompletedStreak = 1;
  }
  // If already won today (puzzleCompletedStreakDate === currentDate), keep current streak
  
  // Update total games played
  stats.totalGamesPlayed += 1;
  
  // Update attempts for today
  if (!stats.attemptsPerDay[currentDate]) {
    stats.attemptsPerDay[currentDate] = 0;
  }
  stats.attemptsPerDay[currentDate] += 1;
  
  // Add to played days if not already present
  if (!stats.playedDays.includes(currentDate)) {
    stats.playedDays.push(currentDate);
  }
  
  // Update last streak date
  stats.puzzleCompletedStreakDate = currentDate;
  
  // Update longest streak if current streak is longer
  if (stats.currentPuzzleCompletedStreak > stats.longestPuzzleCompletedStreak) {
    stats.longestPuzzleCompletedStreak = stats.currentPuzzleCompletedStreak;
  }
  
  // Add to goal achieved days if not already present
  if (!stats.goalAchievedDays.includes(currentDate)) {
    stats.goalAchievedDays.push(currentDate);
  }
  
  saveStats(stats);
} 