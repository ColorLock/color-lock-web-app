import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { useTutorialContext } from '../contexts/TutorialContext';
import { useModalClickOutside } from '../utils/modalUtils';

/**
 * Props for the TutorialWarningModal component
 */
interface TutorialWarningModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Function to call when the modal is closed */
  onClose: () => void;
}

/**
 * Modal that displays warnings during the tutorial
 * 
 * This modal appears when the user makes an incorrect action during the tutorial,
 * providing guidance on what they should do instead.
 */
const TutorialWarningModal: React.FC<TutorialWarningModalProps> = ({ isOpen, onClose }) => {
  // Use the custom hook for handling click outside
  const modalRef = useModalClickOutside(onClose, isOpen);
  
  // Get the warning message from the tutorial context
  const { warningMessage } = useTutorialContext();
  
  // If the modal is not open, don't render anything
  if (!isOpen) return null;
  
  return (
    <div className="modal-overlay">
      <div className="modal-content" ref={modalRef}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faTimes} />
        </button>
        <div className="modal-body">
          <h2>Tutorial Hint</h2>
          <p>{warningMessage}</p>
          <div className="modal-buttons">
            <button 
              className="modal-button primary-button"
              onClick={onClose}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialWarningModal; 