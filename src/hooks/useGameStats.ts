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
   * It also handles resetting the client-side 'todayStats' if it's a new day.
   */
  const loadInitialStats = useCallback(() => {
    setIsLoadingStats(true); // Start loading
    console.log("useGameStats: Loading initial stats from storage...");
    try {
      const storedStats = loadGameStats(initialDefaultStats); // Use the utility
      const lastPlayedDate = localStorage.getItem('lastPlayedDate'); // Get last *saved* date
      const currentDate = dateKeyForToday();

      // Reset client-side todayStats if it's a new day compared to the last save date
      if (lastPlayedDate !== currentDate) {
          console.log(`useGameStats: New day detected (Current: ${currentDate}, Last Played: ${lastPlayedDate}). Resetting todayStats for display.`);
          // Reset only the todayStats part for the display state
          storedStats.todayStats = {
              bestScore: null,
              timesPlayed: 0, // Reset client-side attempt counter
          };
          // Update the last played date marker in storage
          localStorage.setItem('lastPlayedDate', currentDate);
          // Save the potentially modified stats (with reset todayStats) back to storage
          // This ensures the reset todayStats persists if the app is reloaded before backend sync
          saveGameStats(storedStats);
      }

      console.log("useGameStats: Loaded initial stats state:", storedStats);
      setGameStats(storedStats);

    } catch (error) {
      console.error("useGameStats: Error loading initial stats:", error);
      setGameStats(initialDefaultStats); // Fallback to defaults
    } finally {
      // Don't set isLoadingStats to false here, let the fetch control it
      // setIsLoadingStats(false);
    }
  }, [initialDefaultStats]);

  /**
   * Function to update the gameStats state with fresh data fetched from the backend.
   * Now accepts just the allTimeStats object returned by the backend function.
   */
  const setFreshStats = useCallback((freshAllTimeStats: Record<string, any>) => {
      console.log("useGameStats: Updating state with fresh allTimeStats:", freshAllTimeStats);
      
      // Validate and extract the correct data
      if (!freshAllTimeStats || typeof freshAllTimeStats !== 'object') {
          console.error("useGameStats: Invalid data received in setFreshStats:", freshAllTimeStats);
          setIsLoadingStats(false);
          return;
      }
      
      // Handle the case where we might receive {todayStats, allTimeStats} structure
      // instead of just the allTimeStats object
      const actualAllTimeStats = 
          ('allTimeStats' in freshAllTimeStats && freshAllTimeStats.allTimeStats) 
              ? freshAllTimeStats.allTimeStats 
              : freshAllTimeStats;
              
      setGameStats(prevStats => {
          // Create a new state object, preserving the existing todayStats
          // and updating the allTimeStats
          const newState = {
              ...prevStats, // Keep existing structure (includes todayStats)
              allTimeStats: {
                  ...defaultStats.allTimeStats, // Start with defaults to ensure all keys
                  ...actualAllTimeStats // Overwrite with fresh data from backend
              }
          };
          console.log("useGameStats: Constructed new gameStats state:", newState);
          // Optionally save the updated stats back to local storage as a cache
          // saveGameStats(newState); // Be cautious if todayStats shouldn't be cached this way
          return newState;
      });
      setIsLoadingStats(false); // Mark loading as complete when fresh stats arrive
  }, [setIsLoadingStats]);

  /**
   * Generate shareable text based on the current gameStats state.
   * This remains client-side as it's purely for display/sharing formatting.
   */
  const generateShareableStats = useCallback(() => {
    // Keep the existing logic from useGameStats.ts for formatting share text
    // based on the current `gameStats` state.
    const { todayStats, allTimeStats } = gameStats;
    const safeNum = (val: number | null | undefined) => (typeof val === 'number' && !isNaN(val) ? val : 0);

    let shareText = `🔒 Color Lock Stats 🔒\n\n`;
    shareText += `Today's Game:\n`;
    // Use bestScoresByDay for today's best score if available, otherwise fallback
    const todayKey = dateKeyForToday();
    const bestToday = allTimeStats?.bestScoresByDay?.[todayKey] ?? null;
    shareText += `Best Score: ${bestToday !== null ? bestToday : 'N/A'}\n`;
    // Use attemptsPerDay for today's plays if available
    const attemptsToday = allTimeStats?.attemptsPerDay?.[todayKey] ?? 0;
    shareText += `Times Played Today: ${attemptsToday}\n\n`;

    shareText += `All-time Stats:\n`;
    shareText += `Current Streak: ${safeNum(allTimeStats?.currentStreak)}\n`;
    shareText += `Longest Streak: ${safeNum(allTimeStats?.longestStreak)}\n`;
    shareText += `Days Played: ${safeNum(allTimeStats?.playedDays?.length)}\n`; // Use length of array
    shareText += `Goals Achieved: ${safeNum(allTimeStats?.goalAchievedDays?.length)}\n`; // Use length of array
    shareText += `Total Wins: ${safeNum(allTimeStats?.totalWins)}\n`;
    shareText += `Total Games Played: ${safeNum(allTimeStats?.totalGamesPlayed)}\n`;
    shareText += `Total Moves: ${safeNum(allTimeStats?.totalMovesUsed)}\n`;
    shareText += `Total Hints: ${safeNum(allTimeStats?.totalHintsUsed)}\n\n`;
    shareText += `First Try Streak: ${safeNum(allTimeStats?.firstTryStreak)}\n`;
    shareText += `Longest First Try: ${safeNum(allTimeStats?.longestFirstTryStreak)}\n\n`;

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