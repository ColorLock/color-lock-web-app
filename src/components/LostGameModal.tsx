import React, { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { TileColor } from '../types';
import { useTutorialContext } from '../contexts/TutorialContext';

interface LostGameModalProps {
  isOpen: boolean;
  targetColor: TileColor | null;
  getColorCSS: (color: TileColor) => string;
  onClose: () => void;
  onTryAgain: () => void;
}

const LostGameModal: React.FC<LostGameModalProps> = ({
  isOpen,
  targetColor,
  getColorCSS,
  onClose,
  onTryAgain
}) => {
  const { isTutorialMode, nextStep } = useTutorialContext();
  const modalRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);
  
  // Handle the continue button in tutorial mode
  const handleContinue = () => {
    onClose();
    if (isTutorialMode) {
      nextStep();
    } else {
      onTryAgain();
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay">
      <div className="modal-content" ref={modalRef}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <div className="modal-body">
          <h2 style={{ color: 'black' }}>Oh no!</h2>
          <p>You locked the wrong color.</p>
          <p>Target was <span style={{ 
            color: targetColor ? getColorCSS(targetColor) : '#000000',
            fontWeight: 'bold'
          }}>{targetColor}</span></p>
          <div className="modal-buttons">
            <button className="share-button" onClick={handleContinue}>
              {isTutorialMode ? "Continue" : "Try Again"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LostGameModal; 