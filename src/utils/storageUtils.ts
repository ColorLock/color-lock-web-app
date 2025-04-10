import { DailyPuzzle } from '../types';
import { GameStatistics, defaultStats } from '../types/stats';
import { AppSettings } from '../types/settings';

const STATS_STORAGE_KEY = 'colorLockStats'; // Use a consistent key
const LAST_PLAYED_DATE_KEY = 'lastPlayedDate'; // Keep for client-side new day check

// Constants for tracking abandoned moves
export const PENDING_MOVES_PUZZLE_ID_KEY = 'pendingMovesPuzzleId';
export const PENDING_MOVES_COUNT_KEY = 'pendingMovesCount';
export const PENDING_MOVES_TIMESTAMP_KEY = 'pendingMovesTimestamp';

/**
 * Load a daily puzzle from localStorage if it exists
 * (Keep this as is for saving game progress within a day)
 */
export function loadDailyPuzzleIfExists(key: string): DailyPuzzle | null {
  const savedPuzzleStr = localStorage.getItem(`puzzle_${key}`);
  if (!savedPuzzleStr) return null;

  try {
    const puzzleData = JSON.parse(savedPuzzleStr);
    if (puzzleData && puzzleData.lockedCells && Array.isArray(puzzleData.lockedCells)) {
      puzzleData.lockedCells = new Set(puzzleData.lockedCells);
    }
    // Add basic validation if needed
    if (puzzleData && puzzleData.grid && puzzleData.targetColor) {
        return puzzleData as DailyPuzzle;
    }
    return null;
  } catch (e) {
    console.error('Failed to parse saved puzzle', e);
    localStorage.removeItem(`puzzle_${key}`); // Clear invalid data
    return null;
  }
}

/**
 * Save a daily puzzle to localStorage
 * (Keep this as is for saving game progress within a day)
 */
export function saveDailyPuzzle(puzzle: DailyPuzzle) {
  try {
      // Convert Set to array for serialization
      const serializedPuzzle = {
        ...puzzle,
        lockedCells: Array.from(puzzle.lockedCells) // Convert Set to Array
      };
      localStorage.setItem(`puzzle_${puzzle.dateString}`, JSON.stringify(serializedPuzzle));
  } catch (e) {
      console.error('Failed to save puzzle to localStorage', e);
      // Consider clearing space if quota exceeded
  }
}

/**
 * Load game statistics from localStorage (used for initial state / cache)
 */
export function loadGameStats(fallbackStats: GameStatistics): GameStatistics {
  const savedStats = localStorage.getItem(STATS_STORAGE_KEY);
  if (savedStats) {
    try {
      const parsedStats = JSON.parse(savedStats);
      // Merge with defaults to ensure all fields exist, prioritizing saved data
      return mergeWithDefaults(parsedStats, fallbackStats);
    } catch (e) {
      console.error('Failed to parse saved stats, using defaults.', e);
      return { ...fallbackStats }; // Return a fresh copy of defaults
    }
  }
  return { ...fallbackStats }; // Return a fresh copy of defaults
}

/**
 * Save game statistics to localStorage (used as a cache)
 */
export function saveGameStats(stats: GameStatistics): void {
  try {
      // Ensure stats object is valid before saving
      const statsToSave = mergeWithDefaults(stats, defaultStats);
      localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(statsToSave));
      // Update last played date marker when saving stats
      localStorage.setItem(LAST_PLAYED_DATE_KEY, new Date().toISOString().split('T')[0]);
  } catch (e) {
      console.error('Failed to save stats to localStorage', e);
  }
}

/**
 * Load settings from localStorage
 */
export function loadSettings(defaultSettings: AppSettings): AppSettings {
  const savedSettings = localStorage.getItem('colorLockSettings');
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings);
       // Merge with defaults to ensure all keys are present
      return { ...defaultSettings, ...parsed };
    } catch (e) {
      console.error('Failed to parse saved settings, using defaults.', e);
      return { ...defaultSettings };
    }
  }
  return { ...defaultSettings };
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: AppSettings): void {
   try {
       localStorage.setItem('colorLockSettings', JSON.stringify(settings));
   } catch (e) {
       console.error('Failed to save settings to localStorage', e);
   }
}

// Helper function to merge loaded stats with defaults, ensuring all keys exist
function mergeWithDefaults(loaded: any, defaults: GameStatistics): GameStatistics {
    const merged: GameStatistics = JSON.parse(JSON.stringify(defaults)); // Deep clone defaults

    // Merge todayStats
    if (loaded.todayStats) {
        merged.todayStats.bestScore = loaded.todayStats.bestScore ?? defaults.todayStats.bestScore;
        merged.todayStats.timesPlayed = loaded.todayStats.timesPlayed ?? defaults.todayStats.timesPlayed;
    }

    // Merge allTimeStats
    if (loaded.allTimeStats) {
        for (const key in defaults.allTimeStats) {
            if (Object.prototype.hasOwnProperty.call(defaults.allTimeStats, key)) {
                const k = key as keyof GameStatistics['allTimeStats'];
                (merged.allTimeStats as any)[k] = loaded.allTimeStats[k] ?? (defaults.allTimeStats as any)[k];
            }
        }
    }

    return merged;
} 