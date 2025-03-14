import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { TileColor, allColors } from '../types';
import { tileColorToName } from '../utils/shareUtils';

interface ColorPickerModalProps {
  onSelect: (color: TileColor) => void;
  onCancel: () => void;
  getColorCSS: (color: TileColor) => string;
  currentColor?: TileColor;
}

const ColorPickerModal: React.FC<ColorPickerModalProps> = ({ 
  onSelect, 
  onCancel, 
  getColorCSS,
  currentColor
}) => {
  return (
    <div className="color-picker-modal-backdrop" onClick={onCancel}>
      <div className="color-picker-modal" onClick={e => e.stopPropagation()}>        
        <div className="color-bubbles">
          {allColors.map(color => {
            const isCurrentColor = currentColor === color;
            return (
            <div key={color} className="color-bubble-container">
              <button
                className={`color-bubble ${isCurrentColor ? 'current-color' : ''}`}
                style={{ backgroundColor: getColorCSS(color) }}
                onClick={() => !isCurrentColor && onSelect(color)}
                aria-label={`Select ${color} color`}
                disabled={isCurrentColor}
              >
                {isCurrentColor && (
                  <FontAwesomeIcon icon={faCheck} className="current-color-check" />
                )}
              </button>
              <div className="color-label">{tileColorToName(color)}</div>
            </div>
          )})}
        </div>
      </div>
    </div>
  );
};

export default ColorPickerModal; 