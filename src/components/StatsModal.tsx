import React, { useState, useEffect } from 'react';
import '../scss/main.scss';
import { TileColor } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faShareNodes } from '@fortawesome/free-solid-svg-icons';
import { GameStatistics } from '../types/stats';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: GameStatistics;
  onShareStats: () => void;
}

const StatsModal: React.FC<StatsModalProps> = ({ 
  isOpen, 
  onClose, 
  stats, 
  onShareStats 
}) => {
  if (!isOpen) return null;

  // Format time from seconds to mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate a simple bar chart for the last 7 days of scores
  const renderMiniChart = () => {
    const scores = stats.allTimeStats.dailyScores;
    const dates = Object.keys(scores).sort().slice(-7); // Get last 7 days
    
    if (dates.length === 0) return <div className="no-data">No data to display</div>;

    const maxScore = Math.max(...dates.map(date => scores[date]));
    
    return (
      <div className="mini-chart">
        {dates.map((date, index) => {
          const height = (scores[date] / maxScore) * 100;
          const dayOfMonth = new Date(date).getDate();
          
          return (
            <div key={index} className="chart-column">
              <div className="chart-bar" style={{ height: `${height}%` }}></div>
              <div className="chart-label">{dayOfMonth}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content stats-modal">
        <button className="close-button" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </button>
        
        <div className="modal-header">
          <h2 className="modal-title">Statistics</h2>
        </div>
        
        <div className="stats-section">
          <h3>Today's Game</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{stats.todayStats.movesUsed}</div>
              <div className="stat-label">Moves</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.todayStats.bestScore !== null ? stats.todayStats.bestScore : '-'}</div>
              <div className="stat-label">Best Score</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{formatTime(stats.todayStats.timeSpent)}</div>
              <div className="stat-label">Time</div>
            </div>
          </div>
        </div>
        
        <div className="stats-section">
          <h3>All-time Stats</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{stats.allTimeStats.gamesPlayed}</div>
              <div className="stat-label">Games</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.allTimeStats.winPercentage.toFixed(0)}%</div>
              <div className="stat-label">Win Rate</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.allTimeStats.averageMovesPerSolve.toFixed(1)}</div>
              <div className="stat-label">Avg Moves</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.allTimeStats.bestScoreEver !== null ? stats.allTimeStats.bestScoreEver : '-'}</div>
              <div className="stat-label">Best Ever</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.allTimeStats.streak}</div>
              <div className="stat-label">Streak</div>
            </div>
          </div>
        </div>
        
        <div className="stats-section">
          <h3>Your Progress</h3>
          <div className="chart-container">
            {renderMiniChart()}
          </div>
        </div>
        
        <div className="stats-actions">
          <button className="share-stats-button" onClick={onShareStats}>
            <FontAwesomeIcon icon={faShareNodes} /> Share Stats
          </button>
        </div>
      </div>
    </div>
  );
};

export default StatsModal; 