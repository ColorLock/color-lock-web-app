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
  ALGORITHM_MOVE_2 = 4,
  CRITICAL_MOVE = 5,
  LOSING_SCENARIO = 6,
  ALGORITHM_MOVE_3 = 7,
  ALGORITHM_MOVE_4 = 8,
  ALGORITHM_MOVE_5 = 9,
  ALGORITHM_MOVE_6 = 10,
  ALGORITHM_MOVE_7 = 11,
  WINNING_COMPLETION = 12
}

/**
 * Maps tutorial steps to their corresponding move indices in the TUTORIAL_SOLUTION_MOVES array
 * Returns -1 for steps that don't correspond to a move
 */
const getMoveIndexForStep = (step: TutorialStep): number => {
  switch (step) {
    // First move is handled manually through user interaction
    case TutorialStep.ALGORITHM_MOVE_2: return 1;
    case TutorialStep.ALGORITHM_MOVE_3: return 2;
    case TutorialStep.ALGORITHM_MOVE_4: return 3;
    case TutorialStep.ALGORITHM_MOVE_5: return 4;
    case TutorialStep.ALGORITHM_MOVE_6: return 5;
    case TutorialStep.ALGORITHM_MOVE_7: return 6;
    default: return -1;
  }
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
  const [isShowingLostScenario, setIsShowingLostScenario] = useState<boolean>(false);
  const [preLostScenarioBoard, setPreLostScenarioBoard] = useState<TileColor[][] | null>(null);
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
   * Handle automatic tutorial progression for algorithm solution demonstration
   */
  useEffect(() => {
    if (!isTutorialMode || !tutorialBoard || solutionMoves.length === 0) return;
    
    // Helper function to determine if a step is an algorithm move step
    const isRegularAlgorithmMove = (step: TutorialStep): boolean => {
      return step >= TutorialStep.ALGORITHM_MOVE_2 && 
             step <= TutorialStep.ALGORITHM_MOVE_7 &&
             step !== TutorialStep.CRITICAL_MOVE && 
             step !== TutorialStep.LOSING_SCENARIO;
    };
    
    // For algorithm move steps, highlight the tile that will be changed
    if (isRegularAlgorithmMove(currentStep)) {
      // Get the move index directly from the helper function
      const moveIndex = getMoveIndexForStep(currentStep);
      
      debugLog('tutorial', `Highlight effect for algorithm step ${currentStep}:`, {
        currentStep,
        moveIndex,
        currentMoveIndex,
        solutionMovesLength: solutionMoves.length
      });
      
      // Clear any existing suggested tile first
      debugLog('tutorial', `Clearing suggested tile before algorithm move ${moveIndex}`);
      setSuggestedTile(null);
      
      // Set a timeout to ensure state has settled before setting the suggested tile
      const HIGHLIGHT_DELAY = 500; // Standardized highlight delay
      
      setTimeout(() => {
        if (moveIndex >= 0 && moveIndex < solutionMoves.length) {
          const moveToHighlight = solutionMoves[moveIndex];
          debugLog('tutorial', `Setting suggested tile for algorithm move ${moveIndex}`, {
            step: currentStep,
            moveIndex,
            currentMoveIndex: currentMoveIndex,
            tile: { row: moveToHighlight.row, col: moveToHighlight.col },
            color: moveToHighlight.oldColor
          });
          setSuggestedTile({row: moveToHighlight.row, col: moveToHighlight.col });
        } else {
          debugLog('tutorial', `No move found for algorithm step ${currentStep}, moveIndex ${moveIndex}`, null, LogLevel.WARN);
        }
      }, HIGHLIGHT_DELAY);
    }
    
    // For the critical move step, highlight an orange tile
    if (currentStep === TutorialStep.CRITICAL_MOVE) {
      // Just highlight the tile that will be changed to blue
      const orangePositions: {row: number, col: number}[] = [];
      
      // Find all orange tiles to highlight one
      if (tutorialBoard) {
        for (let r = 0; r < tutorialBoard.length; r++) {
          for (let c = 0; c < tutorialBoard[r].length; c++) {
            if (tutorialBoard[r][c] === 'orange') {
              orangePositions.push({row: r, col: c});
            }
          }
        }
        
        // If we found any orange tiles, highlight the first one
        if (orangePositions.length > 0) {
          setTimeout(() => {
            setSuggestedTile(orangePositions[0]);
          }, 500);
        }
      }
    }
    
    // For losing scenario, clear any highlighted tile
    if (currentStep === TutorialStep.LOSING_SCENARIO) {
      setSuggestedTile(null);
    }
    
    // For the winning completion step, apply remaining moves to complete the puzzle
    if (currentStep === TutorialStep.WINNING_COMPLETION && currentMoveIndex < solutionMoves.length) {
      // Reset the lost scenario flag
      setIsShowingLostScenario(false);
      
      // Apply remaining moves automatically (starting from move 7)
      const timer = setTimeout(() => {
        setCurrentStep(TutorialStep.WINNING_COMPLETION);
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [
    isTutorialMode,
    currentStep,
    currentMoveIndex,
    tutorialBoard,
    solutionMoves,
    isShowingLostScenario,
    preLostScenarioBoard
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
      // Hardcoded values for each step
      switch (prev) {
        case TutorialStep.COLOR_SELECTION:
          if (!waitingForUserAction) {
            debugLog('tutorial', "Setting move counter to 1 after COLOR_SELECTION");
            setCurrentMoveIndex(1); // Set to 1 after completing color selection
          }
          break;
          
        case TutorialStep.ALGORITHM_MOVE_2:
          debugLog('tutorial', "Setting move counter to 2 after ALGORITHM_MOVE_2");
          setCurrentMoveIndex(2);
          break;
          
        case TutorialStep.CRITICAL_MOVE:
          debugLog('tutorial', "Setting move counter to 3 after CRITICAL_MOVE");
          setCurrentMoveIndex(3);
          break;
          
        case TutorialStep.LOSING_SCENARIO:
          debugLog('tutorial', "Setting move counter to 2 after LOSING_SCENARIO");
          setCurrentMoveIndex(2);
          
          // Restore board to the state before critical move with orange cells
          if (preLostScenarioBoard) {
            setTutorialBoard(preLostScenarioBoard.map(row => [...row]));
            
            // Recalculate locked cells for the restored board
            const newLockedCells = findLargestRegion(preLostScenarioBoard);
            setLockedCells(newLockedCells);
            
            // Clear any existing suggested tile
            setSuggestedTile(null);
          }
          
          // Go to ALGORITHM_MOVE_3
          next = TutorialStep.ALGORITHM_MOVE_3;
          return next;
          
        case TutorialStep.ALGORITHM_MOVE_3:
          debugLog('tutorial', "Setting move counter to 3 after ALGORITHM_MOVE_3");
          setCurrentMoveIndex(3);
          break;
          
        case TutorialStep.ALGORITHM_MOVE_4:
          debugLog('tutorial', "Setting move counter to 4 after ALGORITHM_MOVE_4");
          setCurrentMoveIndex(4);
          break;
          
        case TutorialStep.ALGORITHM_MOVE_5:
          debugLog('tutorial', "Setting move counter to 5 after ALGORITHM_MOVE_5");
          setCurrentMoveIndex(5);
          break;
          
        case TutorialStep.ALGORITHM_MOVE_6:
          debugLog('tutorial', "Setting move counter to 6 after ALGORITHM_MOVE_6");
          setCurrentMoveIndex(6);
          break;
          
        case TutorialStep.ALGORITHM_MOVE_7:
          debugLog('tutorial', "Setting move counter to 7 after ALGORITHM_MOVE_7");
          setCurrentMoveIndex(7);
          
          // Apply the final move before proceeding to win
          if (tutorialBoard && solutionMoves.length > 6) {
            const finalMove = solutionMoves[6];
            const newBoard = applyTutorialMove(tutorialBoard, finalMove);
            setTutorialBoard(newBoard);
            
            // Update locked cells after the move
            const newLockedCells = findLargestRegion(newBoard);
            setLockedCells(newLockedCells);
            
            // Clear suggested tile
            setSuggestedTile(null);
          }
          
          next = TutorialStep.WINNING_COMPLETION;
          return next;
      }

      // Apply move logic based on which step we're moving FROM
      if (prev === TutorialStep.CRITICAL_MOVE && tutorialBoard) {
        // Save the board state before the critical move for the losing scenario
        setPreLostScenarioBoard(tutorialBoard.map(row => [...row]));
        
        // Create a losing move (turning orange to yellow)
        const criticalMove = { ...solutionMoves[2] }; // Use move index 2
        criticalMove.newColor = 'yellow' as TileColor;
        
        // Apply the losing move
        const newBoard = applyTutorialMove(tutorialBoard, criticalMove);
        setTutorialBoard(newBoard);
        
        // Update locked cells after the critical move
        const newLockedCells = findLargestRegion(newBoard);
        setLockedCells(newLockedCells);
        
        // Clear the highlighted tile
        setSuggestedTile(null);
      }
      
      // For steps ALGORITHM_MOVE_2 through ALGORITHM_MOVE_7 (excluding special cases)
      const isRegularAlgorithmMove = (step: TutorialStep): boolean => {
        return step >= TutorialStep.ALGORITHM_MOVE_2 && 
               step <= TutorialStep.ALGORITHM_MOVE_7 &&
               step !== TutorialStep.CRITICAL_MOVE && 
               step !== TutorialStep.LOSING_SCENARIO;
      };
      
      if (isRegularAlgorithmMove(prev) && tutorialBoard) {
        // Get the move index directly from the helper function
        const moveIndex = getMoveIndexForStep(prev);
        
        // Apply the move if valid
        if (moveIndex >= 0 && moveIndex < solutionMoves.length) {
          const move = {...solutionMoves[moveIndex]};
          
          const newBoard = applyTutorialMove(tutorialBoard, move);
          
          if (newBoard) {
            setTutorialBoard(newBoard);
            
            // Update locked cells after the move
            const newLockedCells = findLargestRegion(newBoard);
            setLockedCells(newLockedCells);
            
            // Clear suggested tile
            setSuggestedTile(null);
          }
        }
      }

      if (prev === TutorialStep.LOCKED_REGIONS) {
        setSuggestedTile(null);
            
        // Highlight the tile for algorithm move 2
        const HIGHLIGHT_DELAY = 500; // Match the standardized highlight delay
        
        setTimeout(() => {
          const moveIndex = 1; // Move index for ALGORITHM_MOVE_2
          const nextMove = solutionMoves[moveIndex];
          debugLog('tutorial', "Highlighting second tile for algorithm demo", nextMove);
          setSuggestedTile({row: nextMove.row, col: nextMove.col});
        }, HIGHLIGHT_DELAY);
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
      
      // Prepare for the next step by setting up highlighted tiles where needed
      if (isRegularAlgorithmMove(next)) {
        // Use timeout to ensure the board state has updated before highlighting
        const HIGHLIGHT_DELAY = 500; // Match the standardized highlight delay
        
        setTimeout(() => {
          // Special handling for algorithm moves after special scenarios
          if (next === TutorialStep.ALGORITHM_MOVE_3 && 
              preLostScenarioBoard !== null && 
              prev + 1 === TutorialStep.ALGORITHM_MOVE_3) {
            // For move 3 after the losing scenario, highlight the orange cell at (1,2)
            debugLog('tutorial', 'Preparing highlight for ALGORITHM_MOVE_3 after losing scenario - orange cell at (1,2)');
            setSuggestedTile({row: 1, col: 2});
          }
          else if (next === TutorialStep.ALGORITHM_MOVE_4) {
            // Highlight the yellow cell at position 3,4 - this is the move that will turn yellow to red
            debugLog('tutorial', 'Preparing highlight for ALGORITHM_MOVE_4 - yellow cell at (3,4)');
            setSuggestedTile({row: 3, col: 4});
          }
          else {
            const moveIndex = getMoveIndexForStep(next);
            if (moveIndex >= 0 && moveIndex < solutionMoves.length) {
              const moveToHighlight = solutionMoves[moveIndex];
              debugLog('tutorial', `Setting up highlight for next algorithm step ${next}, move ${moveIndex}`, {
                row: moveToHighlight.row,
                col: moveToHighlight.col,
                color: moveToHighlight.oldColor
              });
              setSuggestedTile({row: moveToHighlight.row, col: moveToHighlight.col});
            }
          }
        }, HIGHLIGHT_DELAY);
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
        return step >= TutorialStep.ALGORITHM_MOVE_2 && 
              step <= TutorialStep.ALGORITHM_MOVE_7 &&
              step !== TutorialStep.CRITICAL_MOVE && 
              step !== TutorialStep.LOSING_SCENARIO;
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
          if (currentStep === TutorialStep.ALGORITHM_MOVE_3 && preLostScenarioBoard) {
            // For move 3 after the losing scenario, highlight the orange cell at (1,2)
            // This is the one that will turn blue
            debugLog('tutorial', 'Specifically highlighting the orange cell at (1,2) for ALGORITHM_MOVE_3');
            setSuggestedTile({row: 1, col: 2});
          }
          else if (currentStep === TutorialStep.ALGORITHM_MOVE_4) {
            // Highlight the yellow cell at position 3,4 - this is the move that will turn yellow to red
            debugLog('tutorial', 'Specifically highlighting the yellow cell at (3,4) for ALGORITHM_MOVE_4');
            setSuggestedTile({row: 3, col: 4});
          } 
          else if (moveIndex >= 0 && moveIndex < solutionMoves.length) {
            const move = solutionMoves[moveIndex];
            debugLog('tutorial', `Setting highlight for algorithm step ${currentStep}, move ${moveIndex}`, {
              row: move.row,
              col: move.col,
              color: move.oldColor
            });
            setSuggestedTile({row: move.row, col: move.col});
          }
        } else {
          // Handle special steps with specific tile highlights
          switch (currentStep) {
            case TutorialStep.FIRST_MOVE_SELECTION:
              // For first move, highlight the green tile to click
              setSuggestedTile({ row: 1, col: 2 });
              break;
              
            case TutorialStep.CRITICAL_MOVE:
              // For critical move, find and highlight an orange tile
              if (tutorialBoard) {
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
              
            // Specifically do not highlight tiles for these steps
            case TutorialStep.LOSING_SCENARIO:
            case TutorialStep.INTRO:
            case TutorialStep.WINNING_COMPLETION:
              // No tile highlighting for these steps
              setSuggestedTile(null);
              break;
          }
        }
      }, HIGHLIGHT_DELAY);
    }
  }, [currentStep, isTutorialMode, solutionMoves, tutorialBoard, preLostScenarioBoard]);
  
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