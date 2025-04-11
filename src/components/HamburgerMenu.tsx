import React, { ReactNode, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faTimes } from '@fortawesome/free-solid-svg-icons';

interface HamburgerMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ 
  isOpen, 
  onToggle, 
  children 
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Close the menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onToggle();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onToggle]);

  return (
    <div className="hamburger-container" ref={menuRef}>
      <button 
        className="hamburger-button" 
        onClick={onToggle} 
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
      >
        <FontAwesomeIcon icon={isOpen ? faTimes : faBars} />
      </button>
      
      {isOpen && (
        <div className="hamburger-menu-content">
          {children}
        </div>
      )}
    </div>
  );
};

export default HamburgerMenu; 