import React, { useEffect, useState } from 'react';
import { OverlayElement } from '../contexts/TutorialContext';
import { debugLog } from '../utils/debugUtils';

/**
 * Props for the TutorialOverlay component
 */
interface TutorialOverlayProps {
  /** Array of overlay elements to display */
  overlayElements: OverlayElement[];
}

/**
 * An overlay element with calculated position styles
 */
interface PositionedElement extends OverlayElement {
  /** CSS positioning for the element */
  positionStyle: React.CSSProperties;
  /** CSS styling for highlight boxes (only for highlight type elements) */
  highlightStyle?: React.CSSProperties;
}

/**
 * Component that renders overlay elements during tutorial steps
 * 
 * This component is responsible for:
 * 1. Rendering highlights that guide the user
 * 2. Calculating the correct positioning for these elements relative to their targets
 * 3. Updating positions when the window is resized
 */
const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ overlayElements }) => {
  const [positionedElements, setPositionedElements] = useState<PositionedElement[]>([]);
  
  // Calculate positions for all overlay elements
  useEffect(() => {
    /**
     * Calculate positions of all overlay elements relative to their targets
     */
    const calculatePositions = () => {
      const elements: PositionedElement[] = [];
      
      overlayElements.forEach(element => {
        const targetElement = document.querySelector(element.target);
        
        if (targetElement) {
          const rect = targetElement.getBoundingClientRect();
          const style: React.CSSProperties = {};
          let highlightStyle: React.CSSProperties | undefined;
          
          // For highlight type, create a box around the target element
          if (element.type === 'highlight') {
            highlightStyle = {
              position: 'absolute',
              top: `${rect.top - 4}px`,
              left: `${rect.left - 4}px`,
              width: `${rect.width + 8}px`,
              height: `${rect.height + 8}px`,
              border: `3px solid ${element.color || 'red'}`,
              borderRadius: '4px',
              pointerEvents: 'none',
              zIndex: 1000
            };
          }
          
          elements.push({
            ...element,
            positionStyle: style,
            highlightStyle
          });
        } else {
          debugLog('tutorialOverlay', `Target element not found: ${element.target}`);
        }
      });
      
      setPositionedElements(elements);
    };
    
    // Calculate positions initially
    calculatePositions();
    
    // Recalculate on window resize
    window.addEventListener('resize', calculatePositions);
    
    return () => {
      window.removeEventListener('resize', calculatePositions);
    };
  }, [overlayElements]);
  
  return (
    <div className="tutorial-overlay">
      {positionedElements.map((element, index) => (
        <React.Fragment key={index}>
          {/* Render highlight box if element type is 'highlight' */}
          {element.type === 'highlight' && element.highlightStyle && (
            <div 
              className="tutorial-highlight"
              style={element.highlightStyle}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default TutorialOverlay; 