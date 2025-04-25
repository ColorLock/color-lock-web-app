import { useState, useCallback, useEffect } from 'react';
import { GameStatistics, defaultStats } from '../types/stats';
import { loadGameStats, saveGameStats } from '../utils/storageUtils';
import { dateKeyForToday } from '../utils/dateUtils';

/**
 * Custom hook for managing the *display* state of game statistics.
 * Actual stat updates are handled by the backend Cloud Function.
 * This hook loads an initial state (possibly cached) and provides a way
 * for the GameContext to update the state with fresh data fetched from Firestore.
 */
export default function useGameStats(initialDefaultStats: GameStatistics) {
  // State holds the stats for display. Initialized from cache or defaults.
  const [gameStats, setGameStats] = useState<GameStatistics>(initialDefaultStats);
  // State to indicate if fresh stats are currently being fetched.
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  /**
   * Load initial stats from local storage. This provides a quick display
   * while potentially fresher data is fetched from the backend.
   */
  const loadInitialStats = useCallback(() => {
    setIsLoadingStats(true); // Start loading
    console.log("useGameStats: Loading initial stats from storage...");
    try {
      // Use the updated loadGameStats which merges with defaults
      const storedStats = loadGameStats(initialDefaultStats);
      console.log("useGameStats: Loaded initial stats state:", storedStats);
      setGameStats(storedStats);
    } catch (error) {
      console.error("useGameStats: Error loading initial stats:", error);
      setGameStats(initialDefaultStats); // Fallback to defaults
    } finally {
      // Don't set isLoadingStats to false here, let the fetch control it
    }
  }, [initialDefaultStats]);

  /**
   * Function to update the gameStats state with fresh data fetched from the backend.
   * Now accepts the entire flattened stats object returned by the backend function.
   */
  const setFreshStats = useCallback((freshStats: Record<string, any>) => {
      console.log("useGameStats: Updating state with fresh stats:", freshStats);

      // Validate and extract the correct data
      if (!freshStats || typeof freshStats !== 'object') {
          console.error("useGameStats: Invalid data received in setFreshStats:", freshStats);
          setIsLoadingStats(false);
          return;
      }

      // Directly set the new stats, merging with defaults to ensure all keys
      setGameStats(prevStats => {
          const newState: GameStatistics = { // Ensure type safety
              ...defaultStats, // Start with defaults
              ...freshStats, // Overwrite with fresh data from backend
              // Ensure new fields are present, falling back if necessary
              currentTieBotStreak: freshStats.currentTieBotStreak ?? 0,
              longestTieBotStreak: freshStats.longestTieBotStreak ?? 0,
              tieBotStreakDate: freshStats.tieBotStreakDate ?? null,
              currentPuzzleCompletedStreak: freshStats.currentPuzzleCompletedStreak ?? 0, // Add new
              longestPuzzleCompletedStreak: freshStats.longestPuzzleCompletedStreak ?? 0, // Add new
              puzzleCompletedStreakDate: freshStats.puzzleCompletedStreakDate ?? null, // Add new
          };
          console.log("useGameStats: Constructed new gameStats state:", newState);
          // Optionally save the updated stats back to local storage as a cache
          saveGameStats(newState);
          return newState;
      });
      setIsLoadingStats(false); // Mark loading as complete when fresh stats arrive
  }, [setIsLoadingStats]); // Removed dependency on defaultStats as it's included inside

  /**
   * Generate shareable text based on the current gameStats state.
   */
  const generateShareableStats = useCallback(() => {
    // Read directly from the gameStats object (flattened structure)
    const safeNum = (val: number | null | undefined) => (typeof val === 'number' && !isNaN(val) ? val : 0);
    const safeArrLen = (val: any) => (Array.isArray(val) ? val.length : 0);
    const todayKey = dateKeyForToday();

    let shareText = `🔒 Color Lock Stats 🔒\n\n`;
    shareText += `Today's Game (${todayKey}):\n`;
    const bestToday = gameStats.bestScoresByDay?.[todayKey] ?? 'N/A';
    shareText += `Best Score: ${bestToday}\n`;
    const attemptsToday = gameStats.attemptsPerDay?.[todayKey] ?? 0;
    shareText += `Attempts Today: ${attemptsToday}\n`;
    const winsToday = gameStats.winsPerDay?.[todayKey] ?? 0;
    shareText += `Wins Today: ${winsToday}\n\n`;

    shareText += `All-time Stats:\n`;
    // Use new field names for streaks
    shareText += `Current Win Streak: ${safeNum(gameStats.currentPuzzleCompletedStreak)}\n`; // Separated
    shareText += `Longest Win Streak: ${safeNum(gameStats.longestPuzzleCompletedStreak)}\n`; // Separated
    shareText += `Current Tie/Beat Streak: ${safeNum(gameStats.currentTieBotStreak)}\n`;
    shareText += `Longest Tie/Beat Streak: ${safeNum(gameStats.longestTieBotStreak)}\n`;
    shareText += `Days Played: ${safeArrLen(gameStats.playedDays)}\n`;
    shareText += `Goals Achieved: ${safeArrLen(gameStats.goalAchievedDays)}\n`; // Met or Beat
    shareText += `Goals Beaten: ${safeArrLen(gameStats.goalBeatenDays)}\n`; // Strictly Beat
    shareText += `Total Wins: ${safeNum(gameStats.totalWins)}\n`;
    shareText += `Total Games Played: ${safeNum(gameStats.totalGamesPlayed)}\n`;
    shareText += `Total Moves: ${safeNum(gameStats.totalMovesUsed)}\n`;
    shareText += `Total Hints: ${safeNum(gameStats.totalHintsUsed)}\n\n`;
    shareText += `First Try Streak: ${safeNum(gameStats.currentFirstTryStreak)}\n`;
    shareText += `Longest First Try: ${safeNum(gameStats.longestFirstTryStreak)}\n\n`;

    shareText += `Play at: ${window.location.origin}`;

    return shareText;
  }, [gameStats]);

  // Effect to load initial stats on mount (runs only once)
  useEffect(() => {
    loadInitialStats();
    // Note: A subsequent fetch might be triggered by GameContext after puzzle load
  }, [loadInitialStats]);

  return {
    gameStats,
    isLoadingStats,
    setIsLoadingStats, // Expose setter for GameContext
    loadInitialStats, // Expose loader if needed elsewhere
    setFreshStats,    // Expose setter for GameContext
    generateShareableStats
  };
} 