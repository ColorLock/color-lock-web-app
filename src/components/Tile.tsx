import React from 'react';
import { TileColor } from '../types';
import { tileColorToName } from '../utils/shareUtils';
import { MinimalWhiteLock } from './icons';
import { HintResult } from '../utils/hintUtils';

interface TileProps {
  color: TileColor;
  row: number;
  col: number;
  isLocked: boolean;
  isHighlighted: boolean;
  isHinted: boolean;
  onClick: (row: number, col: number) => void;
  getColorCSS: (color: TileColor) => string;
  hintCell?: HintResult | null;
  puzzleTargetColor?: TileColor;
}

const Tile: React.FC<TileProps> = ({
  color,
  row,
  col,
  isLocked,
  isHighlighted,
  isHinted,
  onClick,
  getColorCSS,
  hintCell,
  puzzleTargetColor
}) => {
  const colorName = tileColorToName(color);
  
  // Determine if this is the primary hint cell (the one that will change color)
  const isPrimaryHintCell = isHinted && hintCell && hintCell.row === row && hintCell.col === col;
  
  // Determine the CSS classes for the tile
  const classes = ['grid-cell'];
  if (isLocked) classes.push('locked');
  if (isHighlighted) classes.push('highlight-largest-region');
  if (isHinted) classes.push('hint-cell');
  if (isPrimaryHintCell) classes.push('primary-hint-cell');
  
  // For hinted cells, set the background color explicitly and add animations
  const cellStyle = {
    backgroundColor: getColorCSS(color),
    ...(isHinted && hintCell && {
      // All hinted cells (primary and connected) use move's target color for glow/border
      '--current-color': getColorCSS(color),
      '--target-color': getColorCSS(hintCell.newColor),
    })
  };
  
  return (
    <div 
      className={classes.join(' ')}
      style={cellStyle}
      onClick={() => onClick(row, col)}
      aria-label={`${colorName} tile at row ${row+1}, column ${col+1}${isLocked ? ', locked' : ''}${isPrimaryHintCell ? ', hint target' : ''}`}
      data-row={row}
      data-col={col}
      data-color={color}
      data-hint-target={isPrimaryHintCell ? 'true' : undefined}
    >
      {isLocked && <MinimalWhiteLock size={16} />}
    </div>
  );
};

export default Tile; 