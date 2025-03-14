import React, { useState, useEffect, createContext, useContext } from 'react';
import './App.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faTrophy, faXmark, faLock, faCopy } from '@fortawesome/free-solid-svg-icons';
import { faTwitter, faFacebookF } from '@fortawesome/free-brands-svg-icons';
import ReactConfetti from 'react-confetti';

// Types
import { TileColor, allColors, DailyPuzzle, FirestorePuzzleData } from './types';
import { AppSettings, defaultSettings, ColorBlindMode } from './types/settings';
import { GameStatistics, defaultStats } from './types/stats';

// Components
import ColorPickerModal from './components/ColorPickerModal';
import WinModal from './components/WinModal';
import SettingsModal from './components/SettingsModal';
import StatsModal from './components/StatsModal';
import { MinimalWhiteLock } from './components/icons';

// Utils
import { floodFill, findLargestRegion, isBoardUnified, generatePuzzleFromDB } from './utils/gameLogic';
import { dateKeyForToday } from './utils/dateUtils';
import { loadDailyPuzzleIfExists, saveDailyPuzzle } from './utils/storageUtils';
import { tileColorToName, tileColorToEmoji, generateShareText, copyToClipboard } from './utils/shareUtils';
import { getHint, HintResult, getValidActions, computeActionDifference, NUM_COLORS } from './utils/hintUtils';

// Hooks
import useSettings from './hooks/useSettings';
import useGameStats from './hooks/useGameStats';

// Services
import { fetchPuzzleFromFirestore } from './services/firebaseService';

// Extend CSSProperties to include our custom properties
declare module 'react' {
  interface CSSProperties {
    '--current-color'?: string;
    '--target-color'?: string;
  }
}

// Create settings context
export const SettingsContext = createContext<AppSettings | null>(null);

const App: React.FC = () => {
  const GRID_SIZE = 5;
  const DATE_TO_USE = dateKeyForToday();

  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedTile, setSelectedTile] = useState<{ row: number; col: number } | null>(null);
  const [showWinModal, setShowWinModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hintCell, setHintCell] = useState<HintResult | null>(null);
  const [firestoreData, setFirestoreData] = useState<FirestorePuzzleData | null>(null);
  const [isOnOptimalPath, setIsOnOptimalPath] = useState(true);
  const [moveCount, setMoveCount] = useState(0);
  const [nextPuzzleTime, setNextPuzzleTime] = useState<{hours: string, minutes: string, seconds: string}>({
    hours: "00",
    minutes: "00",
    seconds: "00"
  });
  const [timeLeft, setTimeLeft] = useState<string>("23:59:59");

  // Add settings state
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    // Load settings from localStorage on initial render
    const savedSettings = localStorage.getItem('colorLockSettings');
    if (savedSettings) {
      try {
        return JSON.parse(savedSettings);
      } catch (e) {
        console.error('Failed to parse saved settings', e);
      }
    }
    return defaultSettings;
  });

  // Add statistics state
  const [showStats, setShowStats] = useState(false);
  const { gameStats, updateGameStats: updateStats } = useGameStats(defaultStats);
  
  // Track game start time for calculating time spent
  const [gameStartTime, setGameStartTime] = useState<Date | null>(null);

  const [windowDimensions, setWindowDimensions] = useState<{width: number, height: number}>({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [confettiActive, setConfettiActive] = useState<boolean>(true);
  const [showShareButtons, setShowShareButtons] = useState<boolean>(false);

  // Load game statistics
  const loadGameStats = (): GameStatistics => {
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
  };

  // Save game statistics
  const saveGameStats = (stats: GameStatistics) => {
    localStorage.setItem('colorLockStats', JSON.stringify(stats));
  };

  // Generate the puzzle for the fixed date on first render.
  useEffect(() => {
    const loadPuzzle = async () => {
      try {
        setLoading(true);
        console.log("Starting puzzle loading process");
        
        // Add a timeout to prevent infinite waiting
        const fetchPuzzleWithTimeout = async (): Promise<FirestorePuzzleData> => {
          const timeout = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Fetch timeout')), 10000)
          );
          
          // Add type assertion to the result of Promise.race
          return Promise.race([
            fetchPuzzleFromFirestore(DATE_TO_USE),
            timeout
          ]) as Promise<FirestorePuzzleData>;
        };
        
        try {
          console.log("Attempting to fetch puzzle from Firestore");
          const firestoreData = await fetchPuzzleWithTimeout();
          console.log("Firestore data received:", firestoreData);
          setFirestoreData(firestoreData);
          const newPuzzle = generatePuzzleFromDB(firestoreData, DATE_TO_USE);
          console.log("Successfully fetched puzzle from Firestore");
          setPuzzle(newPuzzle);
          setError(null);
        } catch (err) {
          console.error('Detailed fetch error:', err);
          setError('Using offline mode - connected features unavailable');
          throw err; // Re-throw to trigger the fallback
        }
      } catch (finalError) {
        console.error('Critical error in puzzle loading:', finalError);
        setError('Failed to load puzzle. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    };

    loadPuzzle();
  }, []);

  // When the puzzle is first loaded, set the game start time
  useEffect(() => {
    if (puzzle && !gameStartTime) {
      setGameStartTime(new Date());
    }
  }, [puzzle, gameStartTime]);

  // Initialize the locked cells based on the largest region when the puzzle first loads
  useEffect(() => {
    if (puzzle && puzzle.lockedCells.size === 0) {
      // Find the largest region
      const largestRegion = findLargestRegion(puzzle.grid);
      if (largestRegion.size > 0) {
        // Update the puzzle with the locked cells
        setPuzzle(prevPuzzle => {
          if (!prevPuzzle) return null;
          return {
            ...prevPuzzle,
            lockedCells: largestRegion
          };
        });
      }
    }
  }, [puzzle]);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('colorLockSettings', JSON.stringify(settings));
  }, [settings]);

  if (loading) {
    return <div className="loading">Loading puzzle...</div>;
  }

  if (!puzzle) {
    return <div>Loading puzzle...</div>;
  }

  // Get the daily goal if available
  const dailyGoal = puzzle.algoScore;

  // Handle tile clicks
  const handleTileClick = (row: number, col: number) => {
    if (puzzle.isSolved || puzzle.isLost) return;
    if (puzzle.lockedCells.has(`${row},${col}`)) return;
    setSelectedTile({ row, col });
    setShowColorPicker(true);
  };

  // Add a utility function to check if the current grid matches the expected state
  const checkIfOnOptimalPath = (grid: TileColor[][], moveNumber: number): boolean => {
    if (!firestoreData || !firestoreData.states || moveNumber >= firestoreData.states.length) {
      return false;
    }
    
    // Get the expected state for the current move number
    const expectedState = firestoreData.states[moveNumber];
    
    // Compare current grid with expected state
    for (let r = 0; r < GRID_SIZE; r++) {
      const rowKey = r.toString();
      if (!expectedState[rowKey]) return false;
      
      const expectedRow = expectedState[rowKey];
      for (let c = 0; c < GRID_SIZE; c++) {
        if (grid[r][c] !== expectedRow[c]) {
          return false;
        }
      }
    }
    
    return true;
  };

  // Modify handleColorSelect to check if user is still on optimal path after each move
  const handleColorSelect = (newColor: TileColor) => {
    if (!selectedTile) return;
    
    // Clear any active hints
    setHintCell(null);
    
    const { row, col } = selectedTile;
    const oldColor = puzzle.grid[row][col];
    if (oldColor === newColor) {
      closeColorPicker();
      return;
    }
    const newGrid = puzzle.grid.map(r => [...r]);
    const [rowsChanged, colsChanged] = floodFill(newGrid, row, col, oldColor);
    rowsChanged.forEach((r, i) => {
      newGrid[r][colsChanged[i]] = newColor;
    });

    let newLockedCells = puzzle.lockedCells;
    let newIsSolved = puzzle.isSolved;
    let newIsLost = puzzle.isLost;
    const newUserMoves = puzzle.userMovesUsed + 1;

    // Update largest region
    const largestRegion = findLargestRegion(newGrid);
    if (largestRegion.size > newLockedCells.size) {
      newLockedCells = largestRegion;
    }

    // If the largest region (>= 13) is not the target color, mark as lost.
    if (largestRegion.size >= 13) {
      const firstCell = largestRegion.values().next().value as string;
      const [fr, fc] = firstCell.split(',').map(Number);
      if (newGrid[fr][fc] !== puzzle.targetColor) {
        newIsLost = true;
      }
    }

    // Check if board is unified.
    if (isBoardUnified(newGrid)) {
      if (newGrid[0][0] === puzzle.targetColor) {
        newIsSolved = true;
        newLockedCells = new Set();
      } else {
        newIsLost = true;
      }
    }

    // NEW: Check if the user is still on the optimal path
    const willBeOnPath = checkIfOnOptimalPath(newGrid, newUserMoves);
    setIsOnOptimalPath(willBeOnPath);
    
    if (!willBeOnPath) {
      console.log("User has deviated from the optimal solution path");
    }

    const updated: DailyPuzzle = {
      ...puzzle,
      grid: newGrid,
      lockedCells: newLockedCells,
      userMovesUsed: newUserMoves,
      isSolved: newIsSolved,
      isLost: newIsLost
    };
    setPuzzle(updated);
    closeColorPicker();

    if (updated.isSolved) {
      handlePuzzleSolved();
    }
  };

  const closeColorPicker = () => {
    setShowColorPicker(false);
    setSelectedTile(null);
  };

  // Update the handleHint function to use dynamic calculation if off-path
  const handleHint = () => {
    // Clear previous hint
    setHintCell(null);
    
    if (!puzzle || !firestoreData) {
      console.error("Cannot provide hint: puzzle or firestoreData is missing");
      return;
    }

    if (puzzle.isSolved || puzzle.isLost) {
      console.log("Game is already over, no hint needed");
      return;
    }

    let hint: HintResult | null = null;
    
    if (isOnOptimalPath) {
      // User is on the optimal path, use the predefined next action
      console.log("User is on optimal path, providing next predefined action");
      hint = getHint(firestoreData, puzzle.userMovesUsed);
    } else {
      // User has deviated, calculate the best action dynamically
      console.log("User has deviated from optimal path, calculating best action");
      
      // Get all valid actions
      const validActions = getValidActions(puzzle.grid, puzzle.lockedCells, firestoreData);
      
      if (validActions.length === 0) {
        console.log("No valid actions available");
        return;
      }
      
      // Evaluate each action and find the best one(s)
      let bestActions: number[] = [];
      let bestDifference = -Infinity;
      
      validActions.forEach(actionIdx => {
        const difference = computeActionDifference(
          puzzle.grid, 
          puzzle.lockedCells, 
          puzzle.targetColor, 
          actionIdx,
          firestoreData
        );
        
        if (difference > bestDifference) {
          bestDifference = difference;
          bestActions = [actionIdx];
        } else if (difference === bestDifference) {
          bestActions.push(actionIdx);
        }
      });
      
      if (bestActions.length > 0) {
        // If there are ties, choose randomly
        const randomIndex = Math.floor(Math.random() * bestActions.length);
        const bestActionIdx = bestActions[randomIndex];
        
        // Create a hint result from the best action
        hint = decodeActionIdFromApp(bestActionIdx, firestoreData);
        console.log(`Selected best action with difference ${bestDifference}`);
      }
    }
    
    if (hint && hint.valid) {
      console.log("Hint provided:", hint);
      setHintCell(hint);
    } else {
      console.log("No valid hint available");
    }
  };
  
  // Helper function to decode action ID (similar to the one in hints.tsx)
  const decodeActionIdFromApp = (actionId: number, firestoreData: FirestorePuzzleData): HintResult => {
    const row = (GRID_SIZE - 1) - Math.floor(actionId / (GRID_SIZE * NUM_COLORS));
    const remainder = actionId % (GRID_SIZE * NUM_COLORS);
    const col = Math.floor(remainder / NUM_COLORS);
    const colorIndex = remainder % NUM_COLORS;
    
    let newColor: TileColor;
    
    if (firestoreData.colorMap) {
      const mappedIndex = firestoreData.colorMap.indexOf(colorIndex);
      if (mappedIndex !== -1) {
        const colorValues = Object.values(TileColor);
        newColor = colorValues[mappedIndex] as TileColor;
      } else {
        const colorValues = Object.values(TileColor);
        newColor = colorValues[colorIndex] as TileColor;
      }
    } else {
      const colorValues = Object.values(TileColor);
      newColor = colorValues[colorIndex] as TileColor;
    }
    
    return {
      row,
      col,
      newColor,
      valid: row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE
    };
  };

  const handlePuzzleSolved = () => {
    // Update statistics when puzzle is solved
    const timeSpent = gameStartTime ? Math.floor((new Date().getTime() - gameStartTime.getTime()) / 1000) : 0;
    updateStats(true, moveCount, timeSpent);
    setShowWinModal(true);
  };

  // Reset isOnOptimalPath when trying again
  const handleTryAgain = async () => {
    try {
      // If the player resets and doesn't solve the puzzle, count it as a played game
      if (puzzle && !puzzle.isSolved) {
        const timeSpent = gameStartTime ? Math.floor((new Date().getTime() - gameStartTime.getTime()) / 1000) : 0;
        updateStats(false, moveCount, timeSpent);
      }
      
      // Clear any active hints
      setHintCell(null);
      
      let puzzleData = firestoreData;
      // If we don't have the data cached, fetch it
      if (!puzzleData) {
        puzzleData = await fetchPuzzleFromFirestore(DATE_TO_USE);
        setFirestoreData(puzzleData);
      }
      
      // Reset the game
      const newPuzzle = generatePuzzleFromDB(puzzleData, DATE_TO_USE);
      setPuzzle(newPuzzle);
      setIsOnOptimalPath(true);
      setMoveCount(0);
      setGameStartTime(new Date()); // Reset start time
    } catch (error) {
      console.error("Error in try again:", error);
      setError("Couldn't load new puzzle. Please refresh the page.");
    } finally {
      setShowWinModal(false);
    }
  };

  // More detailed locked region analysis
  function getLockedRegionsInfo(grid: TileColor[][], lockedCells: Set<string>): { 
    totalSize: number, 
    regions: number[]  // Array of sizes of each connected region
  } {
    if (lockedCells.size === 0) {
      return { totalSize: 0, regions: [] };
    }
    
    // Convert locked cells to array of [row, col] pairs
    const lockedCoords: [number, number][] = Array.from(lockedCells).map(key => {
      const [row, col] = key.split(',').map(Number);
      return [row, col];
    });
    
    // Track visited cells
    const visited = new Set<string>();
    const regions: number[] = [];
    
    // For each locked cell
    for (const [startRow, startCol] of lockedCoords) {
      const key = `${startRow},${startCol}`;
      if (visited.has(key)) continue;
      
      // Start a new region
      const stack: [number, number][] = [[startRow, startCol]];
      let regionSize = 0;
      
      // Flood fill to find connected cells
      while (stack.length > 0) {
        const [row, col] = stack.pop()!;
        const cellKey = `${row},${col}`;
        
        if (visited.has(cellKey)) continue;
        if (!lockedCells.has(cellKey)) continue;
        
        visited.add(cellKey);
        regionSize++;
        
        // Check neighbors
        const neighbors: [number, number][] = [
          [row+1, col], [row-1, col], [row, col+1], [row, col-1]
        ];
        
        for (const [nr, nc] of neighbors) {
          const neighborKey = `${nr},${nc}`;
          if (!visited.has(neighborKey) && lockedCells.has(neighborKey)) {
            stack.push([nr, nc]);
          }
        }
      }
      
      regions.push(regionSize);
    }
    
    // Sort regions by size (largest first)
    regions.sort((a, b) => b - a);
    
    return {
      totalSize: lockedCells.size,
      regions
    };
  }

  // Function to calculate locked region size
  const getLockedRegionSize = () => {
    return puzzle?.lockedCells?.size || 0;
  };
  
  // Function to get the color of locked squares
  const getLockedSquaresColor = (): TileColor | null => {
    // If no locked cells, return null
    if (!puzzle?.lockedCells?.size) return null;
    
    // Get the first locked cell coordinates
    const firstLockedCell = Array.from(puzzle.lockedCells)[0];
    if (!firstLockedCell) return null;
    
    // Convert 'row,col' string to row and col numbers
    const [row, col] = firstLockedCell.split(',').map(Number);
    
    // Return the color of that locked cell from the grid
    return puzzle.grid[row][col];
  };
  
  // Function to get CSS color for the locked count
  const getLockedColorCSS = () => {
    const lockedColor = getLockedSquaresColor();
    // Use the color of locked squares, or white if not available
    return lockedColor !== null ? getColorCSS(lockedColor) : '#ffffff';
  };

  // Custom function to get adjusted colors based on color blindness setting
  const getAdjustedColorCSS = (color: TileColor): string => {
    // For custom color scheme
    if (settings.customColorScheme[color]) {
      return settings.customColorScheme[color] as string;
    }
    
    // For color blind modes
    if (settings.colorBlindMode !== ColorBlindMode.None) {
      const colorBlindPresets: Record<ColorBlindMode, Record<TileColor, string>> = {
        [ColorBlindMode.Protanopia]: {
          [TileColor.Red]: '#a0a0a0', // Gray instead of red
          [TileColor.Green]: '#f5f5a0', // Yellow-ish instead of green
          [TileColor.Blue]: '#5555ff', // Keep blue
          [TileColor.Yellow]: '#ffff55', // Keep yellow
          [TileColor.Purple]: '#a0a0ff', // Light blue instead of purple
          [TileColor.Orange]: '#f5f5a0', // Yellow-ish instead of orange
        },
        [ColorBlindMode.Deuteranopia]: {
          [TileColor.Red]: '#ff5555', // Keep red
          [TileColor.Green]: '#a0a0a0', // Gray instead of green
          [TileColor.Blue]: '#5555ff', // Keep blue
          [TileColor.Yellow]: '#ffff55', // Keep yellow
          [TileColor.Purple]: '#ff55ff', // Keep purple
          [TileColor.Orange]: '#ff5555', // Red-ish instead of orange
        },
        [ColorBlindMode.Tritanopia]: {
          [TileColor.Red]: '#ff5555', // Keep red
          [TileColor.Green]: '#55ff55', // Keep green
          [TileColor.Blue]: '#a0a0a0', // Gray instead of blue
          [TileColor.Yellow]: '#ff5555', // Red-ish instead of yellow
          [TileColor.Purple]: '#ff55ff', // Keep purple
          [TileColor.Orange]: '#ff9955', // Keep orange
        },
        [ColorBlindMode.None]: {} as Record<TileColor, string> // This is a placeholder
      };
      
      if (colorBlindPresets[settings.colorBlindMode][color]) {
        return colorBlindPresets[settings.colorBlindMode][color];
      }
    }
    
    // Use default colors enhanced for high contrast mode if enabled
    const baseColorMap = {
      [TileColor.Red]: settings.highContrastMode ? '#ff3333' : '#ff5555',
      [TileColor.Green]: settings.highContrastMode ? '#33ff33' : '#55ff55',
      [TileColor.Blue]: settings.highContrastMode ? '#3333ff' : '#5555ff',
      [TileColor.Yellow]: settings.highContrastMode ? '#ffff33' : '#ffff55',
      [TileColor.Purple]: settings.highContrastMode ? '#ff33ff' : '#ff55ff',
      [TileColor.Orange]: settings.highContrastMode ? '#ff9933' : '#ff9955',
    };
    
    return baseColorMap[color] || '#ffffff';
  };

  // Override the original getColorCSS function to use our new adjusted version
  const getColorCSS = (color: TileColor): string => {
    return getAdjustedColorCSS(color);
  };

  // Function to handle settings change
  const handleSettingsChange = (newSettings: AppSettings) => {
    console.log("Applying new settings:", newSettings);
    setSettings(prevSettings => {
      // First check if any settings actually changed to avoid unnecessary rerenders
      const hasChanges = Object.keys(newSettings).some(key => {
        const k = key as keyof AppSettings;
        // Deep compare for objects like customColorScheme
        if (k === 'customColorScheme') {
          return JSON.stringify(newSettings[k]) !== JSON.stringify(prevSettings[k]);
        }
        return newSettings[k] !== prevSettings[k];
      });
      
      if (hasChanges) {
        // Only update if there are actual changes
        const updatedSettings = {...newSettings};
        // Save to localStorage immediately
        localStorage.setItem('colorLockSettings', JSON.stringify(updatedSettings));
        return updatedSettings;
      }
      return prevSettings;
    });
  };

  // Define this function inside the component
  function getCurrentMoveCount() {
    // Simply return the current moves from the puzzle state
    return puzzle ? puzzle.userMovesUsed : 0;
  }

  // Helper function to convert TileColor to emoji
  function tileColorToEmoji(color: TileColor): string {
    const colorEmojis = {
      [TileColor.Red]: "🟥",
      [TileColor.Green]: "🟩",
      [TileColor.Blue]: "🟦",
      [TileColor.Yellow]: "🟨",
      [TileColor.Purple]: "🟪",
      [TileColor.Orange]: "🟧",
    };
    
    return colorEmojis[color] || "⬜";
  }

  // Function to generate share text with emojis
  const generateShareText = (): string => {
    if (!puzzle) return "";
    
    // Get current date
    const now = new Date();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
    
    // Create header text
    let shareText = `Color Lock - ${dateStr}\n`;
    shareText += `Target: ${tileColorToEmoji(puzzle.targetColor)}\n\n`;
    shareText += `Score: ${puzzle.userMovesUsed} moves`;
    
    // Add medal emoji if move count meets or beats the goal
    if (puzzle.userMovesUsed <= puzzle.algoScore) {
      shareText += " 🏅";
    }
    
    shareText += "\n\n";
    shareText += "Today's Board:\n";
    
    // Add the starting grid
    for (let r = 0; r < puzzle.startingGrid.length; r++) {
      const row = puzzle.startingGrid[r];
      const rowEmojis = row.map(color => tileColorToEmoji(color)).join("");
      shareText += rowEmojis + "\n";
    }
    
    return shareText;
  };
  
  // Function to handle generic share action
  const handleShare = async () => {
    const shareText = generateShareText();
    
    // Try to use the Web Share API if available
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Color Lock Results',
          text: shareText,
        });
        console.log('Successfully shared');
      } catch (error) {
        console.error('Error sharing:', error);
        // Fall back to clipboard if sharing fails
        copyToClipboard(shareText, 'Result copied to clipboard!');
      }
    } else {
      // Fallback to clipboard for browsers that don't support Web Share API
      copyToClipboard(shareText, 'Result copied to clipboard!');
    }
  };
  
  // Function to share to Twitter
  const shareToTwitter = () => {
    const shareText = generateShareText();
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer');
  };
  
  // Function to share to Facebook
  const shareToFacebook = () => {
    const shareText = generateShareText();
    // Facebook sharing requires a URL, so we'll share the game URL and use the text as the quote
    const baseUrl = window.location.href.split('?')[0]; // Remove any query parameters
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(baseUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(facebookUrl, '_blank', 'noopener,noreferrer');
  };
  
  // Helper function to copy to clipboard with visual feedback
  const copyToClipboard = (text: string, message: string = 'Copied to clipboard!') => {
    // Create a tooltip element for feedback
    const tooltip = document.createElement('div');
    tooltip.className = 'copy-tooltip';
    
    navigator.clipboard.writeText(text)
      .then(() => {
        // Success message
        tooltip.textContent = message;
        tooltip.classList.add('success');
      })
      .catch((err) => {
        // Error message
        console.error('Failed to copy: ', err);
        tooltip.textContent = 'Failed to copy';
        tooltip.classList.add('error');
      })
      .finally(() => {
        // Display tooltip
        document.body.appendChild(tooltip);
        
        // Remove tooltip after 2 seconds
        setTimeout(() => {
          tooltip.classList.add('fade-out');
          setTimeout(() => {
            document.body.removeChild(tooltip);
          }, 300);
        }, 2000);
      });
  };

  // Share statistics
  const shareGameStats = () => {
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
    
    copyToClipboard(shareText, 'Stats copied to clipboard!');
  };

  // Determine additional container classes based on settings
  const containerClasses = ['container'];
  if (settings.highContrastMode) {
    containerClasses.push('high-contrast-mode');
  }
  if (!settings.enableAnimations) {
    containerClasses.push('no-animations');
  }

  // Sound settings
  const soundEnabled = settings?.enableSoundEffects || false;

  return (
    <div className={containerClasses.join(' ')}>
      {/* Settings Button */}
      <button className="settings-button" onClick={() => setShowSettings(true)} aria-label="Settings">
        <FontAwesomeIcon icon={faGear} />
      </button>

      {/* Stats Button */}
      <button className="stats-button" onClick={() => setShowStats(true)} aria-label="Statistics">
        <FontAwesomeIcon icon={faTrophy} />
      </button>

      {/* Top info card */}
      <div className="top-card">
        <h1>Color Lock</h1>
        <div className="target-row">
          <span>Target:</span>
          <div className="target-circle" style={{ backgroundColor: getColorCSS(puzzle.targetColor) }} />
        </div>
        <div className="goal-row">
          <span>Goal: {dailyGoal}</span>
          <span>Moves: {puzzle.userMovesUsed}</span>
        </div>
        <button className="hint-button" onClick={handleHint}>Get Hint</button>
      </div>

      {/* Grid */}
      <div className="grid">
        {puzzle.grid.map((row, rIdx) => (
          <div key={rIdx} className="grid-row">
            {row.map((color, cIdx) => {
              const key = `${rIdx},${cIdx}`;
              const isLocked = puzzle.lockedCells.has(key);
              const isHinted = !!(hintCell && hintCell.row === rIdx && hintCell.col === cIdx);
              const isPartOfLargestRegion = isLocked && settings.highlightLargestRegion;
              
              return (
                <div key={key} className="grid-cell-container">
                  <Tile
                    color={color}
                    row={rIdx}
                    col={cIdx}
                    isLocked={isLocked}
                    isHighlighted={isPartOfLargestRegion}
                    isHinted={isHinted}
                    onClick={handleTileClick}
                    getColorCSS={getColorCSS}
                    hintCell={hintCell}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* If lost, show a message */}
      {puzzle.isLost && (
        <div className="status-message lost">
          You locked the wrong color. Target was {puzzle.targetColor}.
        </div>
      )}

      {/* Controls section with locked region indicator and centered Try Again button */}
      <div className="controls-container">
        <div className="controls-inner">
          {/* Locked region indicator with updated styling */}
          {settings.showLockedRegionCounter && (
            <div className="locked-region-counter">
              <span className="locked-label game-title-font">Locked Squares:</span>
              <span 
                className="locked-count"
                style={{ 
                  color: getLockedColorCSS(),
                  textShadow: '-0.5px -0.5px 0 #000, 0.5px -0.5px 0 #000, -0.5px 0.5px 0 #000, 0.5px 0.5px 0 #000',
                  fontSize: '22px'
                }}
              >
                {getLockedRegionSize()}
              </span>
            </div>
          )}
          
          {/* Try Again button */}
          <button 
            className="try-again-button" 
            onClick={handleTryAgain}
          >
            Try Again
          </button>
        </div>
      </div>

      {/* Color Picker Modal */}
      {showColorPicker && selectedTile && (
        <ColorPickerModal 
          onSelect={handleColorSelect} 
          onCancel={closeColorPicker} 
          getColorCSS={getColorCSS}
          currentColor={puzzle.grid[selectedTile.row][selectedTile.col]} 
        />
      )}

      {/* Win Modal */}
      {showWinModal && (
        <WinModal 
          puzzle={puzzle} 
          onTryAgain={handleTryAgain} 
          onClose={() => setShowWinModal(false)}
          getColorCSS={getColorCSS}
          shareToTwitter={shareToTwitter}
          shareToFacebook={shareToFacebook}
          copyToClipboard={(text: string) => copyToClipboard(text, 'Result copied to clipboard!')}
          generateShareText={generateShareText}
          setShowWinModal={setShowWinModal}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />

      {/* Stats Modal */}
      <StatsModal 
        isOpen={showStats}
        onClose={() => setShowStats(false)}
        stats={gameStats}
        onShareStats={shareGameStats}
      />
    </div>
  );
};

// Create component to render a single tile
const Tile: React.FC<{
  color: TileColor;
  row: number;
  col: number;
  isLocked: boolean;
  isHighlighted: boolean;
  isHinted: boolean;
  onClick: (row: number, col: number) => void;
  getColorCSS: (color: TileColor) => string;
  hintCell?: HintResult | null;
}> = ({ color, row, col, isLocked, isHighlighted, isHinted, onClick, getColorCSS, hintCell }) => {
  const colorName = tileColorToName(color);
  
  // Determine the CSS classes for the tile
  const classes = ['grid-cell'];
  if (isLocked) classes.push('locked');
  if (isHighlighted) classes.push('highlight-largest-region');
  if (isHinted) classes.push('hint-cell');
  
  // For hinted cells, set the background color explicitly and add animations
  const cellStyle = {
    backgroundColor: getColorCSS(color),
    ...(isHinted && hintCell && {
      '--current-color': getColorCSS(color),
      '--target-color': getColorCSS(hintCell.newColor),
      border: '2px solid #1e90ff', // Persistent blue border
      boxShadow: '0 0 6px 1px rgba(30, 144, 255, 0.6)' // Persistent blue glow
    })
  };
  
  return (
    <div 
      className={classes.join(' ')}
      style={cellStyle}
      onClick={() => onClick(row, col)}
      aria-label={`${colorName} tile at row ${row+1}, column ${col+1}${isLocked ? ', locked' : ''}`}
      data-row={row}
      data-col={col}
      data-color={color}
    >
      {isLocked && <MinimalWhiteLock size={16} />}
    </div>
  );
};

export default App;