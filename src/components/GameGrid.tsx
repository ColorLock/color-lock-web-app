import React from 'react';
import { TileColor } from '../types';
import { HintResult } from '../utils/hintUtils';
import Tile from './Tile';
import { AppSettings } from '../types/settings';
import { tileColorToName } from '../utils/shareUtils';

interface GameGridProps {
  grid: TileColor[][];
  lockedCells: Set<string>;
  hintCell: HintResult | null;
  settings: AppSettings;
  onTileClick: (row: number, col: number) => void;
  getColorCSS: (color: TileColor) => string;
}

const GameGrid: React.FC<GameGridProps> = ({
  grid,
  lockedCells,
  hintCell,
  settings,
  onTileClick,
  getColorCSS
}) => {
  // Function to check if a cell is part of the hint
  const isPartOfHint = (row: number, col: number): boolean => {
    if (!hintCell) return false;
    
    // The primary hint cell
    if (hintCell.row === row && hintCell.col === col) return true;
    
    // Check connected cells
    if (hintCell.connectedCells) {
      return hintCell.connectedCells.some(([r, c]) => r === row && c === col);
    }
    
    return false;
  };

  return (
    <div className="grid" style={{ position: 'relative' }}>
      {grid.map((row, rIdx) => (
        <div key={rIdx} className="grid-row">
          {row.map((color, cIdx) => {
            const key = `${rIdx},${cIdx}`;
            const isLocked = lockedCells.has(key);
            const isHinted = isPartOfHint(rIdx, cIdx);
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
                  onClick={onTileClick}
                  getColorCSS={getColorCSS}
                  hintCell={hintCell}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default GameGrid; 