import { useState, useCallback, useEffect } from 'react';
import { GameStatistics } from '../types/stats';
import { loadGameStats, saveGameStats } from '../utils/storageUtils';
import { dateKeyForToday } from '../utils/dateUtils';

/**
 * Custom hook for managing game statistics
 */
export default function useGameStats(defaultStats: GameStatistics) {
  const [gameStats, setGameStats] = useState<GameStatistics>(() => {
    // Check if it's a new day when loading stats
    const storedStats = loadGameStats(defaultStats);
    const lastPlayedDate = localStorage.getItem('lastPlayedDate');
    const currentDate = dateKeyForToday();
    
    // Initialize days played if this is the first time the app is used
    const isFirstTimeEver = !lastPlayedDate;
    
    // If it's a new day or first time ever, reset daily stats
    if (lastPlayedDate !== currentDate) {
      // Store yesterday's best score in dailyScores if it exists
      if (lastPlayedDate && storedStats.todayStats.bestScore !== null) {
        storedStats.allTimeStats.dailyScores[lastPlayedDate] = storedStats.todayStats.bestScore;
      }
      
      // Reset today's stats
      storedStats.todayStats = {
        movesUsed: 0,
        bestScore: null,
        timesPlayed: 0
      };
      
      // Clear the streak update flag for the new day
      const oldStreakKey = `streak-updated-${lastPlayedDate}`;
      localStorage.removeItem(oldStreakKey);
      
      // If this is the very first time using the app, initialize stats
      if (isFirstTimeEver) {
        console.log('First time ever using the app, initializing stats');
        storedStats.allTimeStats = {
          ...storedStats.allTimeStats,
          daysPlayed: 0,  // Will be incremented on first move
          totalMoves: 0,
          goalAchieved: 0,
          streak: 0,
          gamesPlayed: 0,
          dailyScores: {}
        };
      } else {
        // Check if we missed a day and need to reset streak
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = yesterday.toISOString().split('T')[0];
        
        if (lastPlayedDate !== yesterdayKey && !storedStats.allTimeStats.dailyScores[yesterdayKey]) {
          console.log('Day skipped, resetting streak');
          storedStats.allTimeStats.streak = 0;
        }
      }
      
      // Don't set lastPlayedDate here - it will be set when first move is made
      saveGameStats(storedStats);
    }
    
    // Initialize stats if they don't exist or are NaN
    if (!storedStats.allTimeStats.totalMoves || isNaN(storedStats.allTimeStats.totalMoves)) {
      storedStats.allTimeStats.totalMoves = 0;
    }
    
    if (!storedStats.allTimeStats.daysPlayed || isNaN(storedStats.allTimeStats.daysPlayed)) {
      storedStats.allTimeStats.daysPlayed = 0;
    }
    
    if (!storedStats.allTimeStats.goalAchieved || isNaN(storedStats.allTimeStats.goalAchieved)) {
      storedStats.allTimeStats.goalAchieved = 0;
    }
    
    if (!storedStats.allTimeStats.streak || isNaN(storedStats.allTimeStats.streak)) {
      storedStats.allTimeStats.streak = 0;
    }
    
    console.log('Initialized stats:', { 
      currentDate, 
      lastPlayedDate,
      isFirstTimeEver,
      daysPlayed: storedStats.allTimeStats.daysPlayed,
      totalMoves: storedStats.allTimeStats.totalMoves,
      streak: storedStats.allTimeStats.streak
    });
    
    return storedStats;
  });
  
  /**
   * Increment the times played counter and track first game of the day
   */
  const incrementTimesPlayed = useCallback(() => {
    const currentStats = { ...gameStats };
    const currentDate = dateKeyForToday();
    
    // Get the actual lastPlayed date from localStorage for most accurate comparison
    const lastPlayedDate = localStorage.getItem('lastPlayedDate');
    
    // Check if this is the first game of the day by comparing dates
    // If lastPlayedDate doesn't exist or is different from current date
    const isFirstGameOfDay = !lastPlayedDate || lastPlayedDate !== currentDate;
    
    console.log('incrementTimesPlayed:', { 
      currentDate, 
      lastPlayedDate, 
      isFirstGameOfDay,
      timesPlayed: currentStats.todayStats.timesPlayed,
      daysPlayed: currentStats.allTimeStats.daysPlayed
    });
    
    // Increment times played
    currentStats.todayStats.timesPlayed += 1;
    currentStats.allTimeStats.gamesPlayed += 1;
    
    // If this is the first game of the day, increment days played
    if (isFirstGameOfDay) {
      // Ensure daysPlayed is initialized
      if (!currentStats.allTimeStats.daysPlayed || isNaN(currentStats.allTimeStats.daysPlayed)) {
        currentStats.allTimeStats.daysPlayed = 0;
      }
      
      currentStats.allTimeStats.daysPlayed += 1;
      
      // Important: Update the last played date in localStorage right away
      localStorage.setItem('lastPlayedDate', currentDate);
      console.log('Incrementing days played to:', currentStats.allTimeStats.daysPlayed);
      
      // Reset today's stats since it's a new day
      currentStats.todayStats = {
        movesUsed: 0,
        bestScore: null,
        timesPlayed: 1  // Set to 1 since we're incrementing now
      };
    }
    
    // Save the updated stats
    saveGameStats(currentStats);
    setGameStats(currentStats);
    
    // Return whether this was the first game of the day
    return isFirstGameOfDay;
  }, [gameStats]);
  
  /**
   * Update total moves counter
   */
  const updateTotalMoves = useCallback((moveCount: number) => {
    if (!moveCount || isNaN(moveCount) || moveCount <= 0) return;
    
    const currentStats = { ...gameStats };
    
    // Ensure totalMoves is initialized
    if (!currentStats.allTimeStats.totalMoves || isNaN(currentStats.allTimeStats.totalMoves)) {
      currentStats.allTimeStats.totalMoves = 0;
    }
    
    // Add current move count to total moves
    currentStats.allTimeStats.totalMoves += moveCount;
    
    saveGameStats(currentStats);
    setGameStats(currentStats);
    
    return currentStats;
  }, [gameStats]);
  
  // Force a check for new day on component mount
  useEffect(() => {
    const currentDate = dateKeyForToday();
    const lastPlayedDate = localStorage.getItem('lastPlayedDate');
    
    // If it's a new day and we haven't played yet, update lastPlayedDate
    // but don't increment daysPlayed until the first move
    if (lastPlayedDate !== currentDate && gameStats.todayStats.timesPlayed === 0) {
      console.log('New day detected on mount:', {
        currentDate,
        lastPlayedDate,
        daysPlayed: gameStats.allTimeStats.daysPlayed
      });
      
      // Reset today's stats for the new day
      const updatedStats = {
        ...gameStats,
        todayStats: {
          movesUsed: 0,
          bestScore: null,
          timesPlayed: 0
        }
      };
      
      saveGameStats(updatedStats);
      setGameStats(updatedStats);
    }
  }, [gameStats.todayStats.timesPlayed]);
  
  /**
   * Update goal achieved counter if user beat or tied the bot score based on current difficulty
   */
  const updateGoalAchieved = useCallback((
    userScore: number, 
    botScore: number, 
    puzzleDateString: string
  ) => {
    const currentStats = { ...gameStats };
    const currentDate = dateKeyForToday();
    
    // Use puzzle-specific key to track achievements by date AND puzzle
    // This way if the puzzle changes, the achievement can be earned again
    // We also add the bot score to the key, so that different difficulty levels
    // for the same puzzle can each earn a separate achievement
    const achievementKey = `goal-achieved-${puzzleDateString}-difficulty-${botScore}`;
    
    // Check if this achievement was already recorded for this puzzle at this difficulty
    const alreadyAchievedForPuzzle = localStorage.getItem(achievementKey) === 'true';
    
    console.log('Checking goal achievement:', {
      userScore,
      botScore,
      puzzleDateString,
      achievementKey,
      alreadyAchievedForPuzzle
    });
    
    // If user beat or tied the bot score and this hasn't been recorded for this puzzle at this difficulty
    if (userScore <= botScore && !alreadyAchievedForPuzzle) {
      // Ensure goalAchieved is initialized
      if (!currentStats.allTimeStats.goalAchieved || isNaN(currentStats.allTimeStats.goalAchieved)) {
        currentStats.allTimeStats.goalAchieved = 0;
      }
      
      currentStats.allTimeStats.goalAchieved += 1;
      localStorage.setItem(achievementKey, 'true');
      
      console.log('Goal achieved! New count:', currentStats.allTimeStats.goalAchieved);
      
      saveGameStats(currentStats);
      setGameStats(currentStats);
    }
    
    return currentStats;
  }, [gameStats]);
  
  /**
   * Update the game statistics when a puzzle is solved or the player gives up
   */
  const updateGameStats = useCallback((
    isSolved: boolean, 
    moveCount: number,
    botScore?: number,
    puzzleDateString?: string
  ) => {
    const currentDate = dateKeyForToday();
    const currentStats = { ...gameStats };
    
    // Update today's stats
    currentStats.todayStats.movesUsed = moveCount;
    
    // Update best score if this is better than previous best
    if (isSolved && (currentStats.todayStats.bestScore === null || 
                    moveCount < currentStats.todayStats.bestScore)) {
      currentStats.todayStats.bestScore = moveCount;
    }
    
    // Store move in dailyScores if solved
    if (isSolved) {
      currentStats.allTimeStats.dailyScores[currentDate] = moveCount;
      
      // Handle streak updates
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = yesterday.toISOString().split('T')[0];
      
      // Check if we already updated the streak today
      const streakKey = `streak-updated-${currentDate}`;
      const streakAlreadyUpdated = localStorage.getItem(streakKey) === 'true';
      
      if (!streakAlreadyUpdated) {
        // Ensure streak is initialized
        if (!currentStats.allTimeStats.streak || isNaN(currentStats.allTimeStats.streak)) {
          currentStats.allTimeStats.streak = 0;
        }
        
        // If yesterday is in our records, increment streak, otherwise reset to 1
        if (currentStats.allTimeStats.dailyScores[yesterdayKey] !== undefined) {
          currentStats.allTimeStats.streak += 1;
        } else {
          currentStats.allTimeStats.streak = 1;
        }
        
        // Mark that we've updated the streak for today
        localStorage.setItem(streakKey, 'true');
        
        console.log('Updated streak:', {
          currentDate,
          yesterdayKey,
          hasYesterday: currentStats.allTimeStats.dailyScores[yesterdayKey] !== undefined,
          newStreak: currentStats.allTimeStats.streak
        });
      }
    }
    
    // Check if goal was achieved (user beat or tied bot score)
    if (isSolved && botScore !== undefined) {
      // Use the provided puzzle date string, or fall back to current date
      const puzzleDate = puzzleDateString || currentDate;
      updateGoalAchieved(moveCount, botScore, puzzleDate);
    }
    
    // Save updated stats
    saveGameStats(currentStats);
    setGameStats(currentStats);
    
    return currentStats;
  }, [gameStats, updateGoalAchieved]);
  
  /**
   * Generate shareable text for game statistics
   */
  const generateShareableStats = useCallback(() => {
    const { todayStats, allTimeStats } = gameStats;
    
    // Safety checks for NaN values
    const safeTotalMoves = !allTimeStats.totalMoves || isNaN(allTimeStats.totalMoves) ? 0 : allTimeStats.totalMoves;
    const safeDaysPlayed = !allTimeStats.daysPlayed || isNaN(allTimeStats.daysPlayed) ? 0 : allTimeStats.daysPlayed;
    const safeGoalAchieved = !allTimeStats.goalAchieved || isNaN(allTimeStats.goalAchieved) ? 0 : allTimeStats.goalAchieved;
    const safeStreak = !allTimeStats.streak || isNaN(allTimeStats.streak) ? 0 : allTimeStats.streak;
    
    let shareText = `🔒 Color Lock Stats 🔒\n\n`;
    shareText += `Today's Game:\n`;
    shareText += `Best Score: ${todayStats.bestScore !== null ? todayStats.bestScore : 'n/a'}\n`;
    shareText += `Times Played: ${todayStats.timesPlayed}\n\n`;
    
    shareText += `All-time Stats:\n`;
    shareText += `Streak: ${safeStreak}\n`;
    shareText += `Days Played: ${safeDaysPlayed}\n`;
    shareText += `Goals Achieved: ${safeGoalAchieved}\n`;
    shareText += `Total Moves: ${safeTotalMoves}\n\n`;
    
    shareText += `Play at: https://colorlock.game`;
    
    return shareText;
  }, [gameStats]);
  
  return {
    gameStats,
    updateGameStats,
    incrementTimesPlayed,
    updateTotalMoves,
    generateShareableStats
  };
} 