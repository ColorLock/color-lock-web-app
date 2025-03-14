import { useState, useCallback } from 'react';
import { GameStatistics } from '../types/stats';
import { loadGameStats, saveGameStats } from '../utils/storageUtils';
import { dateKeyForToday } from '../utils/dateUtils';

/**
 * Custom hook for managing game statistics
 */
export default function useGameStats(defaultStats: GameStatistics) {
  const [gameStats, setGameStats] = useState<GameStatistics>(() => loadGameStats(defaultStats));
  
  /**
   * Update the game statistics when a puzzle is solved or the player gives up
   */
  const updateGameStats = useCallback((
    isSolved: boolean, 
    moveCount: number, 
    timeSpentSeconds: number
  ) => {
    const currentDate = dateKeyForToday();
    const currentStats = loadGameStats(defaultStats);
    
    // Update today's stats
    const todayStats = {
      movesUsed: moveCount,
      bestScore: currentStats.todayStats.bestScore === null || 
                 moveCount < currentStats.todayStats.bestScore
        ? moveCount 
        : currentStats.todayStats.bestScore,
      timeSpent: timeSpentSeconds
    };
    
    // Calculate daily scores for the mini chart
    const dailyScores = { ...currentStats.allTimeStats.dailyScores };
    if (isSolved) {
      dailyScores[currentDate] = moveCount;
    }
    
    // Calculate streak
    let streak = currentStats.allTimeStats.streak;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split('T')[0];
    
    if (isSolved) {
      // If yesterday is in our records, increment streak, otherwise reset to 1
      if (dailyScores[yesterdayKey] !== undefined) {
        streak += 1;
      } else {
        streak = 1;
      }
    }
    
    // Calculate other all-time stats
    const gamesPlayed = currentStats.allTimeStats.gamesPlayed + 1;
    const winCount = Object.keys(dailyScores).length;
    const winPercentage = gamesPlayed > 0 ? (winCount / gamesPlayed) * 100 : 0;
    
    // Calculate average moves per solve
    const scores = Object.values(dailyScores);
    let totalMoves = 0;
    for (const score of scores) {
      totalMoves += score as number;
    }
    const averageMovesPerSolve = winCount > 0 ? totalMoves / winCount : 0;
    
    // Find best score ever
    let bestScoreEver: number | null = null;
    if (scores.length > 0) {
      bestScoreEver = Math.min(...scores.map(score => score as number));
    }
    
    // Update all-time stats
    const allTimeStats = {
      gamesPlayed,
      winPercentage,
      averageMovesPerSolve,
      bestScoreEver,
      streak,
      dailyScores
    };
    
    // Save updated stats
    const updatedStats: GameStatistics = {
      todayStats,
      allTimeStats
    };
    
    saveGameStats(updatedStats);
    setGameStats(updatedStats);
    
    return updatedStats;
  }, [defaultStats]);
  
  /**
   * Generate shareable text for game statistics
   */
  const generateShareableStats = useCallback(() => {
    const { todayStats, allTimeStats } = gameStats;
    
    let shareText = `🔒 Color Lock Stats 🔒\n\n`;
    shareText += `Today's Game:\n`;
    shareText += `Moves: ${todayStats.movesUsed}\n`;
    shareText += `Best Score: ${todayStats.bestScore !== null ? todayStats.bestScore : '-'}\n`;
    shareText += `Time: ${Math.floor(todayStats.timeSpent / 60)}:${(todayStats.timeSpent % 60).toString().padStart(2, '0')}\n\n`;
    
    shareText += `All-time Stats:\n`;
    shareText += `Games: ${allTimeStats.gamesPlayed}\n`;
    shareText += `Win Rate: ${allTimeStats.winPercentage.toFixed(0)}%\n`;
    shareText += `Avg Moves: ${allTimeStats.averageMovesPerSolve.toFixed(1)}\n`;
    shareText += `Best Ever: ${allTimeStats.bestScoreEver !== null ? allTimeStats.bestScoreEver : '-'}\n`;
    shareText += `Streak: ${allTimeStats.streak}\n\n`;
    
    shareText += `Play at: https://colorlock.game`;
    
    return shareText;
  }, [gameStats]);
  
  return {
    gameStats,
    updateGameStats,
    generateShareableStats
  };
} 