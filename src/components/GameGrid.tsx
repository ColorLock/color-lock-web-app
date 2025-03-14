import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock } from '@fortawesome/free-solid-svg-icons';
import { TileColor } from '../types';

interface GameGridProps {
  grid: TileColor[][];
  lockedCells: Set<string>;
  largestRegion: Set<string>;
  hintCell: { row: number, col: number, targetColor: TileColor } | null;
  currentColor: TileColor | null;
  highlightLargestRegion: boolean;
  onTileClick: (row: number, col: number) => void;
  getColorCSS: (color: TileColor) => string;
}

// Extend CSSProperties to include our custom properties
declare module 'react' {
  interface CSSProperties {
    '--current-color'?: string;
    '--target-color'?: string;
  }
}

const GameGrid: React.FC<GameGridProps> = ({
  grid,
  lockedCells,
  largestRegion,
  hintCell,
  currentColor,
  highlightLargestRegion,
  onTileClick,
  getColorCSS
}) => {
  return (
    <div className="grid">
      {grid.map((row, rIdx) => (
        <div key={rIdx} className="grid-row">
          {row.map((color, cIdx) => {
            const cellKey = `${rIdx},${cIdx}`;
            const isHinted = hintCell && hintCell.row === rIdx && hintCell.col === cIdx;
            const isLocked = lockedCells.has(cellKey);
            const isLargest = largestRegion.has(cellKey) && highlightLargestRegion;
            
            let cellClasses = ["grid-cell"];
            if (isHinted) cellClasses.push("hint-cell");
            if (isLargest) cellClasses.push("highlight-largest-region");
            
            const style: React.CSSProperties = {
              backgroundColor: getColorCSS(color)
            };
            
            // For hinted cells, add custom properties for animation
            if (isHinted && hintCell) {
              style['--current-color'] = getColorCSS(color);
              style['--target-color'] = getColorCSS(hintCell.targetColor);
            }
            
            return (
              <div 
                key={cIdx} 
                className="grid-cell-container"
              >
                <div
                  className={cellClasses.join(' ')}
                  style={style}
                  onClick={() => onTileClick(rIdx, cIdx)}
                  data-row={rIdx}
                  data-col={cIdx}
                >
                  {isHinted && <div className="hint-pulse" />}
                </div>
                
                {isLocked && (
                  <div className="locked-overlay">
                    <FontAwesomeIcon 
                      icon={faLock} 
                      className="lock-icon" 
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default GameGrid; 