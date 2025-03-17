import { DailyPuzzle } from '../types';
import { GameStatistics, defaultStats } from '../types/stats';
import { AppSettings } from '../types/settings';

/**
 * Load a daily puzzle from localStorage if it exists
 */
export function loadDailyPuzzleIfExists(key: string): DailyPuzzle | null {
  const savedPuzzleStr = localStorage.getItem(`puzzle_${key}`);
  if (!savedPuzzleStr) return null;
  
  try {
    const puzzleData = JSON.parse(savedPuzzleStr);
    // Convert the lockedCells array back to a Set
    if (puzzleData && puzzleData.lockedCells) {
      puzzleData.lockedCells = new Set(puzzleData.lockedCells);
    }
    return puzzleData;
  } catch (e) {
    console.error('Failed to parse saved puzzle', e);
    return null;
  }
}

/**
 * Save a daily puzzle to localStorage
 */
export function saveDailyPuzzle(puzzle: DailyPuzzle) {
  // Convert Set to array for serialization
  const serializedPuzzle = {
    ...puzzle,
    lockedCells: [...puzzle.lockedCells]
  };
  
  try {
    localStorage.setItem(`puzzle_${puzzle.dateString}`, JSON.stringify(serializedPuzzle));
  } catch (e) {
    console.error('Failed to save puzzle to localStorage', e);
  }
}

/**
 * Load game statistics from localStorage
 */
export function loadGameStats(defaultStats: GameStatistics): GameStatistics {
  const savedStats = localStorage.getItem('colorLockStats');
  if (savedStats) {
    try {
      const parsedStats = JSON.parse(savedStats);
      
      // Validate and fix the stats if necessary
      return sanitizeGameStats(parsedStats, defaultStats);
    } catch (e) {
      console.error('Failed to parse saved stats', e);
      return { ...defaultStats };
    }
  }
  return { ...defaultStats };
}

/**
 * Sanitize game statistics to ensure all values are valid
 */
function sanitizeGameStats(stats: GameStatistics, defaultStats: GameStatistics): GameStatistics {
  // Create a copy of the stats
  const sanitizedStats = { ...stats };
  
  // Ensure todayStats has valid values
  if (!sanitizedStats.todayStats) {
    sanitizedStats.todayStats = { ...defaultStats.todayStats };
  }
  
  // Ensure timesPlayed is a valid number
  if (sanitizedStats.todayStats.timesPlayed === undefined || 
      sanitizedStats.todayStats.timesPlayed === null || 
      isNaN(sanitizedStats.todayStats.timesPlayed)) {
    sanitizedStats.todayStats.timesPlayed = 0;
  }
  
  // Ensure allTimeStats has valid values
  if (!sanitizedStats.allTimeStats) {
    sanitizedStats.allTimeStats = { ...defaultStats.allTimeStats };
  }
  
  // Ensure streak is a valid number
  if (sanitizedStats.allTimeStats.streak === undefined || 
      sanitizedStats.allTimeStats.streak === null || 
      isNaN(sanitizedStats.allTimeStats.streak)) {
    sanitizedStats.allTimeStats.streak = 0;
  }
  
  // Ensure daysPlayed is a valid number
  if (sanitizedStats.allTimeStats.daysPlayed === undefined || 
      sanitizedStats.allTimeStats.daysPlayed === null || 
      isNaN(sanitizedStats.allTimeStats.daysPlayed)) {
    sanitizedStats.allTimeStats.daysPlayed = 0;
  }
  
  // Make sure lastPlayedDate is set for proper day tracking
  const currentDate = new Date().toISOString().split('T')[0];
  if (!localStorage.getItem('lastPlayedDate')) {
    localStorage.setItem('lastPlayedDate', currentDate);
  }
  
  // Ensure goalAchieved is a valid number
  if (sanitizedStats.allTimeStats.goalAchieved === undefined || 
      sanitizedStats.allTimeStats.goalAchieved === null || 
      isNaN(sanitizedStats.allTimeStats.goalAchieved)) {
    sanitizedStats.allTimeStats.goalAchieved = 0;
  }
  
  // Ensure totalMoves is a valid number
  if (sanitizedStats.allTimeStats.totalMoves === undefined || 
      sanitizedStats.allTimeStats.totalMoves === null || 
      isNaN(sanitizedStats.allTimeStats.totalMoves)) {
    sanitizedStats.allTimeStats.totalMoves = 0;
  }
  
  // Ensure gamesPlayed is a valid number
  if (sanitizedStats.allTimeStats.gamesPlayed === undefined || 
      sanitizedStats.allTimeStats.gamesPlayed === null || 
      isNaN(sanitizedStats.allTimeStats.gamesPlayed)) {
    sanitizedStats.allTimeStats.gamesPlayed = 0;
  }
  
  // Ensure dailyScores is valid
  if (!sanitizedStats.allTimeStats.dailyScores) {
    sanitizedStats.allTimeStats.dailyScores = {};
  }
  
  return sanitizedStats;
}

/**
 * Save game statistics to localStorage
 */
export function saveGameStats(stats: GameStatistics): void {
  // Sanitize the stats before saving
  const sanitizedStats = sanitizeGameStats(stats, defaultStats);
  localStorage.setItem('colorLockStats', JSON.stringify(sanitizedStats));
}

/**
 * Load settings from localStorage
 */
export function loadSettings(defaultSettings: AppSettings): AppSettings {
  const savedSettings = localStorage.getItem('colorLockSettings');
  if (savedSettings) {
    try {
      return JSON.parse(savedSettings);
    } catch (e) {
      console.error('Failed to parse saved settings', e);
      return { ...defaultSettings };
    }
  }
  return { ...defaultSettings };
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: AppSettings): void {
  localStorage.setItem('colorLockSettings', JSON.stringify(settings));
} 