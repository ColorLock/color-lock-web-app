import { DailyPuzzle } from '../types';
import { GameStatistics } from '../types/stats';
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
      return JSON.parse(savedStats);
    } catch (e) {
      console.error('Failed to parse saved stats', e);
      return { ...defaultStats };
    }
  }
  return { ...defaultStats };
}

/**
 * Save game statistics to localStorage
 */
export function saveGameStats(stats: GameStatistics): void {
  localStorage.setItem('colorLockStats', JSON.stringify(stats));
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