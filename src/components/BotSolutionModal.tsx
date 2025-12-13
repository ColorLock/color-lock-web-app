import React, { useContext, useEffect } from 'react';
import { TileColor } from '../types';
import { SettingsContext } from '../App';

interface BotSolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  targetColor: TileColor;
  getColorCSS: (color: TileColor) => string;
}

const BotSolutionModal: React.FC<BotSolutionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetColor,
  getColorCSS
}) => {
  const settings = useContext(SettingsContext);
  const soundEnabled = settings?.enableSoundEffects || false;

  // Play sound when modal opens (if enabled)
  useEffect(() => {
    if (isOpen && soundEnabled) {
      const audio = new Audio('/sounds/hint-sound.mp3');
      audio.volume = 0.5;
      audio.play().catch(err => console.warn('Could not play sound:', err));
    }
  }, [isOpen, soundEnabled]);

  // Early return after the hook
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="autocomplete-modal autocomplete-modal-animated">
        <h2 className="congratulations-title">Bot Solution</h2>

        <div className="unlocked-message">
          Are you sure you want to see the bot solution?
        </div>

        <div className="autocomplete-content">
          <p>
            <strong>Warning:</strong> You won't be able to add to your stats for this puzzle on this difficulty anymore.
          </p>
          <p>
            You can still keep attempting the puzzle after viewing the solution.
          </p>
        </div>

        <div className="modal-buttons">
          <button className="inverse-share-button" onClick={onClose}>
            No, keep playing
          </button>
          <button className="share-button" onClick={onConfirm}>
            Yes, show solution
          </button>
        </div>
      </div>
    </div>
  );
};

export default BotSolutionModal;
