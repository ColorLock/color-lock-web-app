import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { TileColor, DailyPuzzle } from '../types';
import { useGameContext } from './GameContext';
import { floodFill, findLargestRegion } from '../utils/gameLogic';
import { extractSolutionMoves, applyTutorialMove } from '../utils/tutorialUtils';
import { debugLog, LogLevel } from '../utils/debugUtils';
import { 
  TUTORIAL_PUZZLE_GRID, 
  TUTORIAL_SOLUTION_MOVES, 
  TARGET_COLOR, 
  GOAL_MOVES,
  getStepConfig
} from './tutorialConfig';

// Define tutorial step type
export enum TutorialStep {
  INTRO = 0,
  FIRST_MOVE_SELECTION = 1,
  COLOR_SELECTION = 2,
  LOCKED_REGIONS = 3,
  SOLUTION_DEMONSTRATION = 4,
  WINNING_COMPLETION = 5
}

/**
 * Maps tutorial steps to their corresponding move indices in the TUTORIAL_SOLUTION_MOVES array
 * Returns -1 for steps that don't correspond to a move
 */
const getMoveIndexForStep = (step: TutorialStep): number => {
  // In the new flow, steps don't directly map to move indices
  return -1;
};

// Define a type for tutorial moves
export interface TutorialMove {
  row: number;
  col: number;
  newColor: TileColor;
  oldColor: TileColor;
}

// Interface for the tooltip/arrow position
export interface OverlayElement {
  type: 'highlight';
  target: string; // CSS selector or element ID
  color?: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  description?: string; // Optional description for tooltips
}

// Interface for the tutorial context value
interface TutorialContextValue {
  // State
  isTutorialMode: boolean;
  currentStep: TutorialStep;
  tutorialBoard: TileColor[][] | null;
  originalBoard: TileColor[][] | null;
  tutorialMoves: TutorialMove[];
  isBoardFading: boolean;
  waitingForUserAction: boolean;
  showTutorialModal: boolean;
  suggestedTile: { row: number; col: number } | null;
  showColorPicker: boolean;
  lockedCells: Set<string>;
  showWarningModal: boolean;
  warningMessage: string;
  currentMoveIndex: number;
  TARGET_COLOR: TileColor;
  GOAL_MOVES: number;
  selectedTile: { row: number; col: number } | null;
  showHintButton: boolean;
  showTryAgainButton: boolean;
  demonstrationMessage: string; // Add this new field for the dynamic message during demonstration
  recentlyChangedTile: { row: number; col: number } | null;
  
  // Functions
  startTutorial: () => void;
  endTutorial: () => void;
  nextStep: () => void;
  handleTileClick: (row: number, col: number) => void;
  handleColorSelect: (color: TileColor) => void;
  setShowTutorialModal: (show: boolean) => void;
  closeColorPicker: () => void;
  closeWarningModal: () => void;
  getCurrentStepConfig: () => {
    title: string;
    message: string;
    overlayElements: OverlayElement[];
  };
}

// Create the context with a default undefined value
export const TutorialContext = createContext<TutorialContextValue | undefined>(undefined);

// Custom hook to use the tutorial context
export const useTutorialContext = () => {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorialContext must be used within a TutorialProvider');
  }
  return context;
};

// Props for the provider component
interface TutorialProviderProps {
  children: ReactNode;
}

/**
 * Tutorial provider component that manages tutorial state and logic
 * 
 * This component is responsible for:
 * 1. Managing the tutorial state (current step, board, etc.)
 * 2. Handling user interactions during the tutorial
 * 3. Automatically applying moves during algorithm demonstration steps
 * 4. Managing transitions between tutorial steps
 */
export const TutorialProvider: React.FC<TutorialProviderProps> = ({ children }) => {
  // State for tutorial
  const [isTutorialMode, setIsTutorialMode] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<TutorialStep>(TutorialStep.INTRO);
  const [tutorialBoard, setTutorialBoard] = useState<TileColor[][] | null>(null);
  const [originalBoard, setOriginalBoard] = useState<TileColor[][] | null>(null);
  const [tutorialMoves, setTutorialMoves] = useState<TutorialMove[]>([]);
  const [isBoardFading, setIsBoardFading] = useState<boolean>(false);
  const [waitingForUserAction, setWaitingForUserAction] = useState<boolean>(false);
  const [showTutorialModal, setShowTutorialModal] = useState<boolean>(false);
  const [_suggestedTile, _setSuggestedTile] = useState<{ row: number; col: number } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
  const [showWarningModal, setShowWarningModal] = useState<boolean>(false);
  const [warningMessage, setWarningMessage] = useState<string>('');
  const [currentMoveIndex, setCurrentMoveIndex] = useState<number>(0);
  const [selectedTile, setSelectedTile] = useState<{ row: number; col: number } | null>(null);
  const [demonstrationMessage, setDemonstrationMessage] = useState<string>('');
  const [recentlyChangedTile, setRecentlyChangedTile] = useState<{ row: number; col: number } | null>(null);
  const showHintButton = false;
  const showTryAgainButton = false;
  
  // Custom setter for suggestedTile with logging
  const setSuggestedTile = (tile: { row: number; col: number } | null) => {
    debugLog('tutorial', "Setting suggestedTile to", tile);
    _setSuggestedTile(tile);
  };

  // Getter for suggestedTile
  const suggestedTile = _suggestedTile;
  
  // Store solution moves separately for demonstration
  const [solutionMoves, setSolutionMoves] = useState<TutorialMove[]>([]);
  const [activeDemonstrationIndex, setActiveDemonstrationIndex] = useState<number>(1); // Start from move index 1
  const [lockedCells, setLockedCells] = useState<Set<string>>(new Set());
  
  // Debug color picker state changes
  useEffect(() => {
    debugLog('tutorial', `showColorPicker changed to: ${showColorPicker}, currentStep: ${TutorialStep[currentStep]}`, {
      waitingForUserAction,
      selectedTile
    });
  }, [showColorPicker, currentStep, waitingForUserAction, selectedTile]);
  
  // Ensure color picker is shown when in COLOR_SELECTION step
  useEffect(() => {
    if (currentStep === TutorialStep.COLOR_SELECTION && waitingForUserAction && !showColorPicker && selectedTile) {
      debugLog('tutorial', "Forcing color picker to be visible in COLOR_SELECTION step", null, LogLevel.WARN);
      setShowColorPicker(true);
    }
  }, [currentStep, waitingForUserAction, showColorPicker, selectedTile]);
  
  /**
   * Transform hardcoded solution moves to tutorial moves format
   */
  useEffect(() => {
    if (isTutorialMode && tutorialBoard && !solutionMoves.length) {
      const moves: TutorialMove[] = TUTORIAL_SOLUTION_MOVES.map(move => ({
        row: move.row,
        col: move.col,
        newColor: move.newColor,
        oldColor: tutorialBoard[move.row][move.col]
      }));
      
      debugLog('tutorial', "Generated solution moves", moves);
      
      setSolutionMoves(moves);
    }
  }, [isTutorialMode, tutorialBoard, solutionMoves.length]);
  
  /**
   * Handle automatic tutorial progression in SOLUTION_DEMONSTRATION step
   */
  useEffect(() => {
    if (!isTutorialMode || !tutorialBoard || solutionMoves.length === 0) return;
    
    if (currentStep === TutorialStep.SOLUTION_DEMONSTRATION) {
      debugLog('tutorial', `Solution demonstration active, current index: ${activeDemonstrationIndex}`);
      
      // If we've completed all the solution moves, advance to winning completion
      if (activeDemonstrationIndex >= solutionMoves.length) {
        debugLog('tutorial', "All solution moves demonstrated, advancing to WINNING_COMPLETION");
        setCurrentStep(TutorialStep.WINNING_COMPLETION);
        setSuggestedTile(null);
        setRecentlyChangedTile(null);
        return;
      }
      
      // Get the current move to demonstrate
      const currentMove = solutionMoves[activeDemonstrationIndex];
      
      // Set the demonstration message
      // For the first move, show the introductory message
      if (activeDemonstrationIndex === 1) {
        setDemonstrationMessage('Now that we\'ve seen how to change a tile and how the lock functionality works, let\'s take you through the rest of the solution for this puzzle. First we\'ll change purple to yellow.');
      } else if (activeDemonstrationIndex === 2) {
        // For move index 2 (second move being demonstrated), changing orange to blue
        setDemonstrationMessage(`Changing orange to ${currentMove.newColor}.`);
      } else if (activeDemonstrationIndex === 4) {
        // For the fourth move - moved from index 5 to index 4
        setDemonstrationMessage(`Now we'll change the other group of yellow to red.`);
      } else if (activeDemonstrationIndex === 5) {
        // For the fifth move - changed message to refer to green instead of yellow
        setDemonstrationMessage(`Changing green to red.`);
      } else {
        // Default message for other moves
        setDemonstrationMessage(`Changing ${currentMove.oldColor} to ${currentMove.newColor}.`);
      }
      
      // First highlight the tile that will be changed (only if it's not a recently changed tile)
      if (!recentlyChangedTile || 
          recentlyChangedTile.row !== currentMove.row || 
          recentlyChangedTile.col !== currentMove.col) {
        setSuggestedTile({row: currentMove.row, col: currentMove.col});
      }
      
      // After a timeout, apply the move - 15 seconds for first message, 7 seconds for others
      const timeoutDuration = activeDemonstrationIndex === 1 ? 15000 : 7000;
      const timeoutId = setTimeout(() => {
        debugLog('tutorial', `Applying demonstration move ${activeDemonstrationIndex}`, currentMove);
        
        // Clear the highlight before applying the move
        setSuggestedTile(null);
        
        // Store the tile we're about to change to prevent re-highlighting
        setRecentlyChangedTile({row: currentMove.row, col: currentMove.col});
        
        // Apply the move to the board
        const newBoard = applyTutorialMove(tutorialBoard, currentMove);
        setTutorialBoard(newBoard);
        
        // Update locked cells after the move
        const newLockedCells = findLargestRegion(newBoard);
        setLockedCells(newLockedCells);
        
        // Increment the move counter
        setCurrentMoveIndex(prev => prev + 1);
        
        // After a brief pause, move to the next demonstration move
        setTimeout(() => {
          // Increment the demonstration index first
          const nextIndex = activeDemonstrationIndex + 1;
          setActiveDemonstrationIndex(nextIndex);
          
          // If there's another move to show, immediately highlight the next tile
          // but only if it's different from the one we just changed
          if (nextIndex < solutionMoves.length) {
            const nextMove = solutionMoves[nextIndex];
            
            // Only set the suggested tile if it's not the one we just changed
            if (!recentlyChangedTile || 
                recentlyChangedTile.row !== nextMove.row || 
                recentlyChangedTile.col !== nextMove.col) {
              setSuggestedTile({row: nextMove.row, col: nextMove.col});
            }
            
            // Update the message for the next move
            if (nextIndex === 2) {
              setDemonstrationMessage(`Changing orange to ${nextMove.newColor}.`);
            } else if (nextIndex === 4) {
              // Update index from 5 to 4 for the "other yellow to red" message
              setDemonstrationMessage(`Now we'll change the other group of yellow to red.`);
            } else if (nextIndex === 5) {
              // Change message to refer to green instead of yellow
              setDemonstrationMessage(`Changing green to red.`);
            } else if (nextIndex === 1) {
              setDemonstrationMessage('Now that we\'ve seen how to change a tile and how the lock functionality works, let\'s take you through the rest of the solution for this puzzle. First we\'ll change purple to yellow.');
            } else {
              setDemonstrationMessage(`Changing ${nextMove.oldColor} to ${nextMove.newColor}.`);
            }
          }
        }, 500); // Shorter pause before showing the next highlight
      }, timeoutDuration); // Dynamic timeout: 15 seconds for first message, 7 seconds for others
      
      return () => clearTimeout(timeoutId);
    }
  }, [
    isTutorialMode,
    currentStep,
    activeDemonstrationIndex,
    tutorialBoard,
    solutionMoves,
    recentlyChangedTile
  ]);
  
  /**
   * Monitor tutorial board changes
   */
  useEffect(() => {
    if (isTutorialMode && tutorialBoard && currentStep === TutorialStep.LOCKED_REGIONS) {
      debugLog('tutorial', "tutorialBoard updated after color selection:", {
        boardState: JSON.stringify(tutorialBoard),
        hasGreenCells: tutorialBoard.some(row => row.some(cell => cell === 'green')),
        lockedCellsSize: lockedCells.size
      });
    }
  }, [tutorialBoard, currentStep, isTutorialMode, lockedCells]);
  
  /**
   * Start tutorial function
   * Initializes the tutorial and sets up the board, locked cells, etc.
   */
  const startTutorial = () => {
    // Always use our hardcoded tutorial grid
    const initialTutorialBoard = TUTORIAL_PUZZLE_GRID.map(row => [...row]);
    
    // Save the original board
    setOriginalBoard(initialTutorialBoard.map(row => [...row]));
    setTutorialBoard(initialTutorialBoard);
    
    // Find and set the largest region as locked
    const initialLockedCells = findLargestRegion(initialTutorialBoard);
    debugLog('tutorial', "Initial locked cells in tutorial", {
      count: initialLockedCells.size,
      cells: Array.from(initialLockedCells)
    });
    setLockedCells(initialLockedCells);
    
    // Start fading animation
    setIsBoardFading(true);
    
    // Clear any existing suggested tile
    setSuggestedTile(null);
    
    // Reset the move counter
    setCurrentMoveIndex(0);
    
    // After fade out, enable tutorial mode
    setTimeout(() => {
      setIsTutorialMode(true);
      setIsBoardFading(false);
      
      // Set current step to INTRO
      setCurrentStep(TutorialStep.INTRO);
    }, 500); // Match this with CSS animation duration
    
    setShowTutorialModal(false);
  };
  
  /**
   * End tutorial function
   * Resets the tutorial state and restores the original game
   */
  const endTutorial = () => {
    // Start fading animation
    setIsBoardFading(true);
    
    // After fade out, disable tutorial mode and reset state
    setTimeout(() => {
      setIsTutorialMode(false);
      setCurrentStep(TutorialStep.INTRO);
      setIsBoardFading(false);
      setRecentlyChangedTile(null);
    }, 500); // Match this with CSS animation duration
  };
  
  /**
   * Handle next step function - manages transitions between tutorial steps
   */
  const nextStep = () => {
    setCurrentStep((prev: TutorialStep) => {
      let next = prev + 1 as TutorialStep;
      
      // Don't advance past COLOR_SELECTION if the user hasn't completed their selection
      if (prev === TutorialStep.COLOR_SELECTION && waitingForUserAction) {
        debugLog('tutorial', "Preventing advance from COLOR_SELECTION until user completes selection");
        // Ensure color picker is showing
        setShowColorPicker(true);
        return prev; // Stay on current step
      }
      
      // Set move counter based on which step we're moving FROM
      switch (prev) {
        case TutorialStep.COLOR_SELECTION:
          if (!waitingForUserAction) {
            debugLog('tutorial', "Setting move counter to 1 after COLOR_SELECTION");
            setCurrentMoveIndex(1); // Set to 1 after completing color selection
          }
          break;
          
        case TutorialStep.LOCKED_REGIONS:
          // When moving from LOCKED_REGIONS to SOLUTION_DEMONSTRATION,
          // reset the demonstration index to start from move 1
          setActiveDemonstrationIndex(1);
          break;
      }
      
      // For steps that require user action, set waiting flag
      if (
        next === TutorialStep.FIRST_MOVE_SELECTION ||
        next === TutorialStep.COLOR_SELECTION
      ) {
        setWaitingForUserAction(true);
        
        // Set suggested tile when transitioning to FIRST_MOVE_SELECTION step
        if (next === TutorialStep.FIRST_MOVE_SELECTION) {
          debugLog('tutorial', "Setting suggested tile for first move selection");
          setSuggestedTile({ row: 1, col: 2 }); // Suggest a green tile to click
        }
      } else {
        setWaitingForUserAction(false);
      }
      
      return next;
    });
  };
  
  /**
   * Handle tile click in tutorial mode
   * @param row The row of the clicked tile
   * @param col The column of the clicked tile
   */
  const handleTileClick = (row: number, col: number) => {
    if (!isTutorialMode || !tutorialBoard) return;
    
    debugLog('tutorial', `Tile clicked at (${row},${col}) in step ${TutorialStep[currentStep]}`, {
      waitingForUserAction,
      tutorialBoard: !!tutorialBoard,
      isTutorialMode
    });
    
    // Only relevant for the first move selection step
    if (currentStep === TutorialStep.FIRST_MOVE_SELECTION && waitingForUserAction) {
      // Get the color of the clicked tile
      const clickedColor = tutorialBoard[row][col];
      
      // For tutorial purposes, ensure we're only allowing clicks on green tiles
      if (clickedColor !== 'green') {
        // If not green, show warning modal
        debugLog('tutorial', "Not clicking on a green tile, ignoring");
        setWarningMessage('Please select the green cell currently highlighted with a red border.');
        setShowWarningModal(true);
        return;
      }
      
      debugLog('tutorial', "Green tile clicked at", { row, col });
      
      // Store the selected tile
      setSelectedTile({ row, col });
      
      // Show the color picker immediately when a green tile is clicked
      debugLog('tutorial', "Setting showColorPicker to true after valid tile click");
      setShowColorPicker(true);
      
      // Move to color selection step
      debugLog('tutorial', "Moving to COLOR_SELECTION step");
      setCurrentStep(TutorialStep.COLOR_SELECTION);
      setWaitingForUserAction(true);
    }
  };
  
  /**
   * Close the color picker
   */
  const closeColorPicker = () => {
    debugLog('tutorial', "Closing color picker");
    
    // If we're in the color selection step, log a warning but allow closing
    // Don't force it to reopen as this would create an infinite loop with App.tsx
    if (currentStep === TutorialStep.COLOR_SELECTION && waitingForUserAction) {
      debugLog('tutorial', "Warning: Closing color picker during COLOR_SELECTION step", null, LogLevel.WARN);
    }
    
    setShowColorPicker(false);
  };
  
  /**
   * Handle color selection in tutorial mode
   * @param color The selected color
   */
  const handleColorSelect = (color: TileColor) => {
    debugLog('tutorial', "Color selected", {
      color,
      currentStep,
      isTutorialMode
    });
    
    if (!isTutorialMode) {
      debugLog('tutorial', "Not in tutorial mode, ignoring", null, LogLevel.WARN);
      return;
    }
    
    if (!tutorialBoard) {
      debugLog('tutorial', "No tutorial board, ignoring", null, LogLevel.WARN);
      return;
    }
    
    // For FIRST_MOVE_SELECTION, just advance to COLOR_SELECTION
    if (currentStep === TutorialStep.FIRST_MOVE_SELECTION) {
      debugLog('tutorial', "First move selection, advancing to color selection");
      // Close color picker 
      setShowColorPicker(false);
      
      // Move to color selection step
      setCurrentStep(TutorialStep.COLOR_SELECTION);
      setWaitingForUserAction(true);
      return;
    }
    
    // For COLOR_SELECTION, change only the selected tile
    if (currentStep === TutorialStep.COLOR_SELECTION) {
      debugLog('tutorial', "In COLOR_SELECTION step, color selected:", color);
      
      // In tutorial, only allow orange to be selected
      if (color !== 'orange') {
        debugLog('tutorial', "User must select orange in this step, got:", color, LogLevel.WARN);
        setWarningMessage('You must select the Orange square for this step.');
        setShowWarningModal(true);
        return; // Don't proceed if not orange
      }

      try {
        // Close color picker first
        setShowColorPicker(false);
        
        // Clear the highlighted tile immediately
        setSuggestedTile(null);
        
        if (tutorialBoard && selectedTile) {
          debugLog('tutorial', "Creating board change for selected tile", selectedTile);
          
          // Create a deep copy of the board
          const newBoard = tutorialBoard.map(row => [...row]);
          
          // Change only the selected tile to orange
          newBoard[selectedTile.row][selectedTile.col] = 'orange' as TileColor;
          
          debugLog('tutorial', "Changed selected tile to orange:", selectedTile);
          
          // Find the new largest region to lock
          const newLockedCells = findLargestRegion(newBoard);
          debugLog('tutorial', "New locked region size:", newLockedCells.size);
          
          // Update state with new board and locked cells, then move to next step
          setTutorialBoard(newBoard);
          setLockedCells(newLockedCells);
          setCurrentStep(TutorialStep.LOCKED_REGIONS);
          setWaitingForUserAction(false);
          
          // Increment the move counter to 1 after completing color selection
          setCurrentMoveIndex(1);
          
          // Clear selected tile
          setSelectedTile(null);
          
          debugLog('tutorial', "Board updated, advancing to LOCKED_REGIONS step");
        }
      } catch (error) {
        debugLog('tutorial', "Error applying color change:", error, LogLevel.ERROR);
      }
    } else {
      debugLog('tutorial', "Not in COLOR_SELECTION step, currentStep is:", currentStep);
    }
  };
  
  /**
   * Close the warning modal
   */
  const closeWarningModal = () => {
    setShowWarningModal(false);
  };
  
  /**
   * Get configuration for current tutorial step
   * @returns Object with title, message, and overlay elements for current step
   */
  const getCurrentStepConfig = () => {
    return getStepConfig(currentStep, solutionMoves);
  };
  
  /**
   * Highlights the appropriate tile for the current step
   */
  useEffect(() => {
    // This effect ensures the suggestedTile is properly set when transitioning to new steps
    if (isTutorialMode) {
      // Helper function to determine if a step is an algorithm move step
      const isRegularAlgorithmMove = (step: TutorialStep): boolean => {
        return step >= TutorialStep.FIRST_MOVE_SELECTION && 
              step <= TutorialStep.SOLUTION_DEMONSTRATION &&
              step !== TutorialStep.WINNING_COMPLETION;
      };
      
      // Clear any suggested tile first to avoid stale highlights
      setSuggestedTile(null);
      
      // Standardized delay for all highlighting effects
      const HIGHLIGHT_DELAY = 500;
      
      // Set a consistent timeout to ensure state is updated before setting new highlight
      setTimeout(() => {
        if (isRegularAlgorithmMove(currentStep)) {
          // For algorithm moves, highlight the tile that should be changed
          const moveIndex = getMoveIndexForStep(currentStep);
          
          // Special handling for specific algorithm moves
          if (currentStep === TutorialStep.FIRST_MOVE_SELECTION) {
            // For first move, highlight the green tile to click
            setSuggestedTile({ row: 1, col: 2 });
          } else if (currentStep === TutorialStep.SOLUTION_DEMONSTRATION) {
            // For solution demonstration, highlight the current move that will be applied
            if (activeDemonstrationIndex < solutionMoves.length) {
              const currentMove = solutionMoves[activeDemonstrationIndex];
              
              // Only highlight if not recently changed
              if (!recentlyChangedTile || 
                  recentlyChangedTile.row !== currentMove.row || 
                  recentlyChangedTile.col !== currentMove.col) {
                setSuggestedTile({row: currentMove.row, col: currentMove.col});
              }
            }
          } else if (currentStep === TutorialStep.LOCKED_REGIONS) {
            // In the LOCKED_REGIONS step, highlight the locked orange region
            if (tutorialBoard) {
              // Find and highlight the first orange tile (which should be part of the locked region)
              for (let r = 0; r < tutorialBoard.length; r++) {
                for (let c = 0; c < tutorialBoard[r].length; c++) {
                  if (tutorialBoard[r][c] === 'orange') {
                    setSuggestedTile({row: r, col: c});
                    return; // Exit after finding the first orange tile
                  }
                }
              }
            }
          } else {
            const move = solutionMoves[moveIndex];
            debugLog('tutorial', `Setting highlight for algorithm step ${currentStep}, move ${moveIndex}`, {
              row: move.row,
              col: move.col,
              color: move.oldColor
            });
            
            // Only highlight if not recently changed
            if (!recentlyChangedTile || 
                recentlyChangedTile.row !== move.row || 
                recentlyChangedTile.col !== move.col) {
              setSuggestedTile({row: move.row, col: move.col});
            }
          }
        } else {
          // Handle special steps with specific tile highlights
          switch (currentStep) {
            case TutorialStep.FIRST_MOVE_SELECTION:
              // For first move, highlight the green tile to click
              setSuggestedTile({ row: 1, col: 2 });
              break;
              
            case TutorialStep.SOLUTION_DEMONSTRATION:
              // For solution demonstration, highlight the current move that will be applied
              if (activeDemonstrationIndex < solutionMoves.length) {
                const currentMove = solutionMoves[activeDemonstrationIndex];
                
                // Only highlight if not recently changed
                if (!recentlyChangedTile || 
                    recentlyChangedTile.row !== currentMove.row || 
                    recentlyChangedTile.col !== currentMove.col) {
                  setSuggestedTile({row: currentMove.row, col: currentMove.col});
                }
              }
              break;
              
            case TutorialStep.LOCKED_REGIONS:
              // For locked regions step, highlight the locked orange region
              if (tutorialBoard) {
                // Find and highlight the first orange tile (which should be part of the locked region)
                for (let r = 0; r < tutorialBoard.length; r++) {
                  for (let c = 0; c < tutorialBoard[r].length; c++) {
                    if (tutorialBoard[r][c] === 'orange') {
                      setSuggestedTile({row: r, col: c});
                      return; // Exit after finding the first orange tile
                    }
                  }
                }
              }
              break;
              
            case TutorialStep.WINNING_COMPLETION:
              // No tile highlighting for winning completion
              setSuggestedTile(null);
              break;
          }
        }
      }, HIGHLIGHT_DELAY);
    }
  }, [currentStep, isTutorialMode, solutionMoves, tutorialBoard, activeDemonstrationIndex, recentlyChangedTile]);
  
  // Value for the context provider
  const value: TutorialContextValue = {
    isTutorialMode,
    currentStep,
    tutorialBoard,
    originalBoard,
    tutorialMoves,
    isBoardFading,
    waitingForUserAction,
    showTutorialModal,
    suggestedTile,
    showColorPicker,
    lockedCells,
    showWarningModal,
    warningMessage,
    currentMoveIndex,
    TARGET_COLOR,
    GOAL_MOVES,
    selectedTile,
    showHintButton,
    showTryAgainButton,
    demonstrationMessage,
    recentlyChangedTile,
    startTutorial,
    endTutorial,
    nextStep,
    handleTileClick,
    handleColorSelect,
    setShowTutorialModal,
    closeColorPicker,
    closeWarningModal,
    getCurrentStepConfig
  };
  
  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}; 