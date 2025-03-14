import React from 'react';

interface LockIconProps {
  size?: number;
}

// Minimal white lock icon used in the grid
export const MinimalWhiteLock: React.FC<LockIconProps> = ({ size = 14 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 14 14" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className="lock-icon"
  >
    {/* Thinner shackle */}
    <path 
      d="M5 7V5.5C5 4.6 6.3 4 7 4C7.7 4 9 4.6 9 5.5V7" 
      stroke="white" 
      strokeWidth="1.2" 
      strokeLinecap="round"
    />
    
    {/* Thinner lock body */}
    <rect x="4" y="7" width="6" height="5" fill="white" rx="0.8" />
  </svg>
); 