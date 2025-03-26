import React, { useEffect, useState, useRef } from 'react';
import { useTutorialContext, TutorialStep } from '../contexts/TutorialContext';
import { TileColor } from '../types';
import { floodFill } from '../utils/gameLogic';
import { debugLog, LogLevel } from '../utils/debugUtils';

/**
 * Component that highlights cells during the tutorial
 * 
 * This component is responsible for:
 * 1. Highlighting tiles the user needs to click on during interactive tutorial steps
 * 2. Highlighting connected groups of cells for algorithm demonstration steps
 * 3. Visually showing which cells will be affected by a move
 */
const TutorialHighlight: React.FC = () => {
  const { 
    currentStep, 
    tutorialBoard, 
    suggestedTile, 
    waitingForUserAction 
  } = useTutorialContext();
  
  const [connectedCells, setConnectedCells] = useState<{row: number, col: number}[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  /**
   * Determines whether highlights should be shown for the current step
   */
  const shouldShowHighlight = () => {
    // For user selection steps
    if ((currentStep === TutorialStep.FIRST_MOVE_SELECTION || 
         currentStep === TutorialStep.COLOR_SELECTION) && 
        waitingForUserAction) {
      return true;
    }
    
    // For locked regions explanation
    if (currentStep === TutorialStep.LOCKED_REGIONS) {
      return true;
    }
    
    // For solution demonstration step
    if (currentStep === TutorialStep.SOLUTION_DEMONSTRATION) {
      return true;
    }
    
    return false;
  };
  
  // When we need to show highlights, calculate connected cells
  useEffect(() => {
    debugLog('tutorialHighlight', "Checking highlight conditions", {
      currentStep,
      shouldShow: shouldShowHighlight(),
      suggestedTile
    });
    
    if (shouldShowHighlight() && tutorialBoard && suggestedTile) {
      // Get the color of the suggested tile
      const { row, col } = suggestedTile;
      
      if (row >= 0 && col >= 0 && 
          row < tutorialBoard.length && 
          col < tutorialBoard[0].length) {
        const tileColor = tutorialBoard[row][col];
        debugLog('tutorialHighlight', "Highlighting tile", { row, col, tileColor });
        
        // For all steps that need highlighting, show all connected tiles of the same color
        if (currentStep === TutorialStep.FIRST_MOVE_SELECTION || 
            currentStep === TutorialStep.COLOR_SELECTION ||
            currentStep === TutorialStep.SOLUTION_DEMONSTRATION ||
            currentStep === TutorialStep.LOCKED_REGIONS) {
          // Use flood fill to find all connected tiles of the same color
          const [rowIndices, colIndices] = floodFill(tutorialBoard, row, col, tileColor);
          
          // Log the color and original position for debugging
          debugLog('tutorialHighlight', `Flood fill from (${row},${col}) with color ${tileColor}`);
          
          // Transform to array of {row, col} objects
          let cells: {row: number, col: number}[] = [];
          
          if (rowIndices.length > 0) {
            cells = rowIndices.map((r, i) => ({ row: r, col: colIndices[i] }));
          } else {
            // If floodFill didn't find any connected cells (shouldn't happen but just in case),
            // fall back to just highlighting the suggested tile
            debugLog('tutorialHighlight', `FloodFill returned no cells, falling back to single cell highlighting for (${row},${col})`, null, LogLevel.WARN);
            cells = [{ row, col }];
            
            // Also check adjacent cells manually for algorithm steps
            if (currentStep === TutorialStep.SOLUTION_DEMONSTRATION || 
                currentStep === TutorialStep.LOCKED_REGIONS) {
              
              // Check right
              if (col + 1 < tutorialBoard[0].length && 
                  tutorialBoard[row][col + 1] === tileColor) {
                cells.push({ row, col: col + 1 });
              }
              
              // Check left
              if (col - 1 >= 0 && 
                  tutorialBoard[row][col - 1] === tileColor) {
                cells.push({ row, col: col - 1 });
              }
              
              // Check up
              if (row - 1 >= 0 && 
                  tutorialBoard[row - 1][col] === tileColor) {
                cells.push({ row: row - 1, col });
              }
              
              // Check down
              if (row + 1 < tutorialBoard.length && 
                  tutorialBoard[row + 1][col] === tileColor) {
                cells.push({ row: row + 1, col });
              }
              
              debugLog('tutorialHighlight', `Manually added adjacent cells of same color, total: ${cells.length}`);
            }
          }
          
          debugLog('tutorialHighlight', `Found ${cells.length} connected cells for ${tileColor} at (${row},${col})`, cells);
          setConnectedCells(cells);
        }
      } else {
        debugLog('tutorialHighlight', "Invalid suggestedTile coordinates", suggestedTile, LogLevel.WARN);
        setConnectedCells([]);
      }
    } else {
      // Clear connected cells when not in appropriate steps
      setConnectedCells([]);
    }
  }, [currentStep, waitingForUserAction, tutorialBoard, suggestedTile]);
  
  // Handle repositioning on resize
  useEffect(() => {
    // Only add listener if we're in the correct step and have cells to highlight
    if (shouldShowHighlight() && connectedCells.length > 0) {
      const handleResize = () => {
        // Force a rerender when window is resized
        setConnectedCells([...connectedCells]);
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [currentStep, connectedCells]);
  
  // Return null if no highlights should be shown
  if (!shouldShowHighlight() || !tutorialBoard || !suggestedTile || connectedCells.length === 0) {
    return null;
  }
  
  return (
    <div 
      ref={containerRef}
      className="tutorial-highlight-container" 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        zIndex: 10, 
        pointerEvents: 'none' 
      }}
    >
      {connectedCells.map(({ row, col }) => {
        // Find the tile element that corresponds to this cell
        const selector = `.grid-cell[data-row="${row}"][data-col="${col}"]`;
        const tileElement = document.querySelector(selector);
        const gridElement = document.querySelector('.grid');
        
        if (!tileElement || !gridElement) return null;
        
        // Get the position relative to the grid
        const tileRect = tileElement.getBoundingClientRect();
        const gridRect = gridElement.getBoundingClientRect();
        
        const top = tileRect.top - gridRect.top;
        const left = tileRect.left - gridRect.left;
        
        // Determine if this is the originally suggested tile (center of the highlight)
        const isOriginalTile = row === suggestedTile?.row && col === suggestedTile?.col;
        
        // Determine the highlight style based on step
        const isLockedRegionStep = currentStep === TutorialStep.LOCKED_REGIONS;
        const isSolutionDemonstration = currentStep === TutorialStep.SOLUTION_DEMONSTRATION;
        
        // Apply different styles based on the step type
        const highlightStyle: React.CSSProperties = {
          position: 'absolute',
          top: `${top}px`,
          left: `${left}px`,
          width: `${tileRect.width}px`,
          height: `${tileRect.height}px`,
          zIndex: 20,
          border: isOriginalTile ? '3px solid white' : 'none',
          boxShadow: isSolutionDemonstration 
            ? 'inset 0 0 15px 5px rgba(255, 255, 255, 0.7)'  // Brighter glow for solution demonstration
            : isLockedRegionStep
              ? 'inset 0 0 15px 5px rgba(255, 215, 0, 0.5)'  // Golden glow for locked regions
              : 'inset 0 0 10px 3px rgba(255, 255, 255, 0.5)', // Subtle glow for user steps
          borderRadius: '2px'
        };
        
        // Determine CSS class based on step
        const highlightClass = isLockedRegionStep 
          ? 'locked-region-highlight' 
          : isSolutionDemonstration 
            ? 'solution-highlight' 
            : 'user-highlight';
        
        return (
          <div 
            key={`highlight-${row}-${col}`} 
            className={`tutorial-cell-highlight ${highlightClass}`}
            style={highlightStyle}
          />
        );
      })}
    </div>
  );
};

export default TutorialHighlight; 