import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import '../scss/main.scss';
import { TileColor } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faShareNodes, faCopy, faEnvelope, faShare, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { faTwitter, faFacebookF } from '@fortawesome/free-brands-svg-icons';
import { GameStatistics, defaultStats, LeaderboardEntry } from '../types/stats';
import { dateKeyForToday } from '../utils/dateUtils';
import { getGlobalLeaderboardCallable, getPersonalStatsCallable, getGlobalLeaderboardV2Callable } from '../services/firebaseService';
import { useDataCache } from '../contexts/DataCacheContext';
import { useAuth } from '../contexts/AuthContext';
import useSettings from '../hooks/useSettings';

// Leaderboard V2 types
interface LeaderboardEntryV2 {
  userId: string;
  username: string;
  value: number;
  rank: number;
  isCurrent?: boolean;
}

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: GameStatistics | null;
  onShareStats: () => void;
  isLoading?: boolean;
  initialTab?: 'personal' | 'global';
}

// Define the type for sorting state
type SortConfig = { key: keyof LeaderboardEntry; direction: 'asc' | 'desc' } | null;

// Use React.memo to wrap the component
const StatsModal: React.FC<StatsModalProps> = memo(({ 
  isOpen, 
  onClose, 
  stats: gameContextStats,
  onShareStats,
  isLoading: isLoadingPersonalStats = false,
  initialTab = 'personal'
}) => {
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const {
      userStats: cachedUserStats,
      globalLeaderboard: cachedLeaderboard,
      loadingStates: cacheLoadingStates,
      errorStates: cacheErrorStates
  } = useDataCache();

  const [activeTab, setActiveTab] = useState<'personal' | 'global'>(initialTab);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isWebShareSupported, setIsWebShareSupported] = useState<boolean>(false);
  
  // Personal stats state
  const [personalStats, setPersonalStats] = useState<any>(null);
  const [isLoadingNewPersonalStats, setIsLoadingNewPersonalStats] = useState<boolean>(false);
  const [personalStatsError, setPersonalStatsError] = useState<string | null>(null);
  
  // Global leaderboard V2 state
  const [leaderboardCategory, setLeaderboardCategory] = useState<'score' | 'goals' | 'streaks'>('score');
  const [leaderboardSubcategory, setLeaderboardSubcategory] = useState<string>('allTime');
  const [leaderboardDifficulty, setLeaderboardDifficulty] = useState<string>(settings.difficultyLevel);
  const [leaderboardV2Data, setLeaderboardV2Data] = useState<LeaderboardEntryV2[]>([]);
  const [requesterEntry, setRequesterEntry] = useState<LeaderboardEntryV2 | null>(null);
  const [isLoadingLeaderboardV2, setIsLoadingLeaderboardV2] = useState<boolean>(false);
  const [leaderboardV2Error, setLeaderboardV2Error] = useState<string | null>(null);
  
  // Check if Web Share API is supported
  useEffect(() => {
    setIsWebShareSupported(typeof navigator.share === 'function');
  }, []);
  
  // Set active tab when modal opens based on initialTab prop
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);
  
  const todayKey = dateKeyForToday(); // Get today's date key
  
  // Fetch personal stats when modal opens and user is authenticated
  useEffect(() => {
    const fetchPersonalStats = async () => {
      if (!isOpen || !currentUser || activeTab !== 'personal') return;
      
      setIsLoadingNewPersonalStats(true);
      setPersonalStatsError(null);
      
      try {
        console.log("[StatsModal] Fetching personal stats for:", todayKey, "difficulty:", settings.difficultyLevel);
        const result = await getPersonalStatsCallable({ 
          puzzleId: todayKey, 
          difficulty: settings.difficultyLevel 
        });
        
        console.log("[StatsModal] Personal stats result:", result);
        
        if (result.data.success && result.data.stats) {
          setPersonalStats(result.data.stats);
        } else {
          throw new Error(result.data.error || 'Failed to fetch personal stats');
        }
      } catch (error: any) {
        console.error("[StatsModal] Error fetching personal stats:", error);
        setPersonalStatsError(error.message || 'Could not load personal stats.');
      } finally {
        setIsLoadingNewPersonalStats(false);
      }
    };
    
    fetchPersonalStats();
  }, [isOpen, currentUser, activeTab, todayKey, settings.difficultyLevel]);
  
  // Determine which stats to display (prioritize cache, fallback to props)
  // Use cachedUserStats if available and user is logged in
  const displayUserStats = (currentUser && cachedUserStats) ? cachedUserStats : gameContextStats;
  const currentStats = displayUserStats || defaultStats;
  
  // Fetch leaderboard V2 data when category, subcategory, or difficulty changes
  useEffect(() => {
    const fetchLeaderboardV2 = async () => {
      if (!isOpen || activeTab !== 'global') return;
      
      setIsLoadingLeaderboardV2(true);
      setLeaderboardV2Error(null);
      
      try {
        console.log("[StatsModal] Fetching leaderboard V2:", { 
          category: leaderboardCategory, 
          subcategory: leaderboardSubcategory, 
          difficulty: leaderboardDifficulty 
        });
        
        const result = await getGlobalLeaderboardV2Callable({
          category: leaderboardCategory,
          subcategory: leaderboardSubcategory,
          difficulty: (leaderboardCategory === 'goals' || leaderboardCategory === 'streaks') 
            ? leaderboardDifficulty 
            : undefined
        });
        
        console.log("[StatsModal] Leaderboard V2 result:", result);
        
        if (result.data.success && result.data.leaderboard) {
          setLeaderboardV2Data(result.data.leaderboard);
          setRequesterEntry(result.data.requesterEntry || null);
        } else {
          throw new Error(result.data.error || 'Failed to fetch leaderboard');
        }
      } catch (error: any) {
        console.error("[StatsModal] Error fetching leaderboard V2:", error);
        setLeaderboardV2Error(error.message || 'Could not load leaderboard data.');
      } finally {
        setIsLoadingLeaderboardV2(false);
      }
    };
    
    fetchLeaderboardV2();
  }, [isOpen, activeTab, leaderboardCategory, leaderboardSubcategory, leaderboardDifficulty]);
  
  // Handle outside click
  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);
  
  // Helper to safely display values, using defaultStats as fallback
  const safelyDisplay = useCallback((value: any, type: 'number' | 'arrayLength' | 'mapKeys' | 'bestScoreToday' | 'attemptsToday' = 'number'): string | number => {
    try {
      if (type === 'bestScoreToday') {
        const score = currentStats?.bestScoresByDay?.[todayKey];
        return score !== null && score !== undefined && !isNaN(Number(score)) ? Number(score) : 'N/A';
      }
      if (type === 'attemptsToday') {
        const attemptsAchieve = currentStats?.attemptsToAchieveBotScore?.[todayKey];
        const attemptsBeat = currentStats?.attemptsToBeatBotScore?.[todayKey];
        const attemptsWin = currentStats?.attemptsToWinByDay?.[todayKey]; // Get win attempts
        // Determine which attempt value to show based on context (this might need refinement)
        const attempts = value; // Assuming `value` holds the relevant attempts data for the item
        return attempts !== null && attempts !== undefined && !isNaN(Number(attempts)) ? Number(attempts) : 'N/A';
      }
      if (type === 'number') {
        const num = Number(value);
        return !isNaN(num) ? num : 0;
      }
      if (type === 'arrayLength') {
        return Array.isArray(value) ? value.length : 0;
      }
      if (type === 'mapKeys') {
        return (typeof value === 'object' && value !== null) ? Object.keys(value).length : 0;
      }
    } catch (e) {
      console.error("Error displaying stat:", e, { value, type });
      return (type === 'bestScoreToday' || type === 'attemptsToday') ? 'N/A' : 0;
    }
    return String(value ?? ((type === 'bestScoreToday' || type === 'attemptsToday') ? 'N/A' : 0));
  }, [currentStats, todayKey]);
  
  // Helper functions for leaderboard V2
  const getSubcategoryOptions = useCallback((category: 'score' | 'goals' | 'streaks') => {
    switch (category) {
      case 'score':
        return [
          { value: 'last7', label: 'Last 7 Days' },
          { value: 'last30', label: 'Last 30 Days' },
          { value: 'allTime', label: 'All Time' }
        ];
      case 'goals':
        return [
          { value: 'beaten', label: 'Beaten' },
          { value: 'matched', label: 'Matched' }
        ];
      case 'streaks':
        return [
          { value: 'firstTry', label: 'First Try' },
          { value: 'goalAchieved', label: 'Goal Achieved' },
          { value: 'puzzleCompleted', label: 'Puzzle Completed' }
        ];
      default:
        return [];
    }
  }, []);
  
  const getHeaderLabel = useCallback((category: 'score' | 'goals' | 'streaks') => {
    switch (category) {
      case 'score':
        return 'Score';
      case 'goals':
        return 'Goals';
      case 'streaks':
        return 'Streaks';
      default:
        return 'Score';
    }
  }, []);
  
  const getSubheaderLabel = useCallback((category: 'score' | 'goals' | 'streaks', subcategory: string) => {
    const options = getSubcategoryOptions(category);
    const option = options.find(opt => opt.value === subcategory);
    return option?.label || subcategory;
  }, [getSubcategoryOptions]);
  
  // Handle category change
  const handleCategoryChange = useCallback((newCategory: 'score' | 'goals' | 'streaks') => {
    setLeaderboardCategory(newCategory);
    // Set default subcategory for the new category
    const defaultSubcategories = {
      score: 'allTime',
      goals: 'beaten',
      streaks: 'firstTry'
    };
    setLeaderboardSubcategory(defaultSubcategories[newCategory]);
  }, []);
  
  // Generate formatted share text using the passed callback
  const getFormattedShareText = useCallback(() => {
    // Use the generateShareableStats function from the useGameStats hook
    // This ensures consistency between the modal display and shared text
    const safeNum = (val: any) => (typeof val === 'number' && !isNaN(val) ? val : 0);
    const safeArrLen = (val: any) => (Array.isArray(val) ? val.length : 0);

    let shareText = `🔒 Color Lock Stats 🔒\n\n`;
    shareText += `Today's Game (${todayKey}):\n`;
    const bestToday = currentStats?.bestScoresByDay?.[todayKey] ?? 'N/A';
    shareText += `Best Score: ${bestToday}\n`;
    const attemptsToday = currentStats?.attemptsPerDay?.[todayKey] ?? 0;
    shareText += `Attempts Today: ${attemptsToday}\n`;
    const winsToday = currentStats?.winsPerDay?.[todayKey] ?? 0;
    shareText += `Wins Today: ${winsToday}\n\n`;

    shareText += `All-time Stats:\n`;
    shareText += `Current Win Streak: ${safeNum(currentStats?.currentPuzzleCompletedStreak)}\n`; // Separated
    shareText += `Longest Win Streak: ${safeNum(currentStats?.longestPuzzleCompletedStreak)}\n`; // Separated
    shareText += `Current Tie/Beat Streak: ${safeNum(currentStats?.currentTieBotStreak)}\n`;
    shareText += `Longest Tie/Beat Streak: ${safeNum(currentStats?.longestTieBotStreak)}\n`;
    shareText += `Days Played: ${safeArrLen(currentStats?.playedDays)}\n`;
    shareText += `Goals Achieved: ${safeArrLen(currentStats?.goalAchievedDays)}\n`;
    shareText += `Goals Beaten: ${safeArrLen(currentStats?.goalBeatenDays)}\n`;
    shareText += `Total Wins: ${safeNum(currentStats?.totalWins)}\n`;
    shareText += `Total Games Played: ${safeNum(currentStats?.totalGamesPlayed)}\n`;
    shareText += `Total Moves: ${safeNum(currentStats?.totalMovesUsed)}\n`;
    shareText += `Total Hints: ${safeNum(currentStats?.totalHintsUsed)}\n\n`;
    shareText += `First Try Streak: ${safeNum(currentStats?.currentFirstTryStreak)}\n`;
    shareText += `Longest First Try: ${safeNum(currentStats?.longestFirstTryStreak)}\n\n`;

    shareText += `Play at: ${window.location.origin}`;
    return shareText;
  }, [currentStats, todayKey]);

  const formattedShareText = getFormattedShareText();
  const shareTitle = "Color Lock - Game Statistics";
  const shareUrl = window.location.href;
  
  // --- Sharing Handlers ---
   const handleWebShare = useCallback(async () => {
    if (navigator.share) {
      try { await navigator.share({ title: shareTitle, text: formattedShareText }); }
      catch (err) { console.error('Error sharing:', err); }
    } else { handleCopyToClipboard(); }
  }, [formattedShareText, shareTitle]); // Dependencies

  const handleTwitterShare = useCallback(() => {
    const text = encodeURIComponent(formattedShareText);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  }, [formattedShareText, shareUrl]); // Dependencies

  const handleFacebookShare = useCallback(() => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}"e=${encodeURIComponent(formattedShareText)}`, '_blank');
  }, [formattedShareText, shareUrl]); // Dependencies

  const handleEmailShare = useCallback(() => {
    window.location.href = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(formattedShareText)}`;
  }, [formattedShareText, shareTitle]); // Dependencies

  const handleCopyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(formattedShareText).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }).catch(err => console.error('Could not copy text: ', err));
  }, [formattedShareText]); // Dependency

  if (!isOpen) return null;

  // Use combined loading state for personal stats tab
  const showPersonalStatsLoader = isLoadingPersonalStats || cacheLoadingStates.userStats;

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content stats-modal stats-modal-large">
        <button className="close-button" onClick={onClose} aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </button>
        
        <div className="modal-header">
          <h2 className="modal-title">Statistics</h2>
        </div>
        
        {/* Tabs */} 
        <div className="stats-tabs">
          <button
            className={`stats-tab ${activeTab === 'personal' ? 'active' : ''}`}
            onClick={() => setActiveTab('personal')}
            aria-selected={activeTab === 'personal'}
            role="tab"
          >
            Personal Stats
          </button>
          <button
            className={`stats-tab ${activeTab === 'global' ? 'active' : ''}`}
            onClick={() => setActiveTab('global')}
            aria-selected={activeTab === 'global'}
            role="tab"
          >
            Global Leaderboard
          </button>
        </div>

        {/* Tab Content */} 
        <div className="stats-tab-content">
          {/* Personal Stats Tab */} 
          {activeTab === 'personal' && (
            <div role="tabpanel" aria-labelledby="personal-tab">
              {isLoadingNewPersonalStats ? (
                <div className="stats-loading">
                  <div className="spinner"></div>
                  <p>Loading statistics...</p>
                </div>
              ) : personalStatsError ? (
                <div className="error-message">Error loading stats: {personalStatsError}</div>
              ) : !currentUser ? (
                <div className="error-message">Please sign in to view personal stats</div>
              ) : personalStats ? (
                <>
                  <div className="stats-section">
                    <h3>Today's Game ({todayKey})</h3>
                    <div className="personal-stats-grid">
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.today.bestEloScore ?? 'N/A'}</div>
                        <div className="personal-stat-label">Best Elo Score</div>
                      </div>
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.today.totalAttempts ?? 'N/A'}</div>
                        <div className="personal-stat-label">Attempts</div>
                      </div>
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.today.fewestMoves ?? 'N/A'}</div>
                        <div className="personal-stat-label">Fewest Moves ({personalStats.difficulty})</div>
                      </div>
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.today.bestDifficultyEloScore ?? 'N/A'}</div>
                        <div className="personal-stat-label">Best Elo ({personalStats.difficulty})</div>
                      </div>
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.today.attemptsToTieGoal ?? 'N/A'}</div>
                        <div className="personal-stat-label">Attempts to Tie ({personalStats.difficulty})</div>
                      </div>
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.today.attemptsToBeatGoal ?? 'N/A'}</div>
                        <div className="personal-stat-label">Attempts to Beat ({personalStats.difficulty})</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="stats-section">
                    <h3>All-time Stats</h3>
                    <div className="personal-stats-grid">
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.allTime.currentPuzzleStreak ?? 'N/A'}</div>
                        <div className="personal-stat-label">Current Puzzle Streak</div>
                      </div>
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.allTime.currentGoalStreak ?? 'N/A'}</div>
                        <div className="personal-stat-label">Current Goal Streak ({personalStats.difficulty})</div>
                      </div>
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.allTime.currentFirstTryStreak ?? 'N/A'}</div>
                        <div className="personal-stat-label">Current First Try ({personalStats.difficulty})</div>
                      </div>
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.allTime.gamesPlayed ?? 'N/A'}</div>
                        <div className="personal-stat-label">Games Played</div>
                      </div>
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.allTime.puzzlesSolved ?? 'N/A'}</div>
                        <div className="personal-stat-label">Puzzles Solved</div>
                      </div>
                      <div className="personal-stat-item">
                        <div className="personal-stat-value">{personalStats.allTime.totalMoves ?? 'N/A'}</div>
                        <div className="personal-stat-label">Total Moves</div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="error-message">No stats available</div>
              )}
            </div>
          )}

          {/* Global Leaderboard Tab */} 
          {activeTab === 'global' && (
            <div className="stats-section global-stats-section" role="tabpanel" aria-labelledby="global-tab">
              {/* Leaderboard Header with Controls */}
              <div className="leaderboard-header-section">
                <div className="leaderboard-header">
                  <h3>{getHeaderLabel(leaderboardCategory)}</h3>
                  <h4>{getSubheaderLabel(leaderboardCategory, leaderboardSubcategory)}</h4>
                </div>
                
                {/* Leaderboard Controls - Horizontal Layout */}
                <div className="leaderboard-controls-horizontal">
                  <div className="control-row">
                    <label htmlFor="category-select">Category:</label>
                    <div className="select-wrapper">
                      <select 
                        id="category-select"
                        value={leaderboardCategory} 
                        onChange={(e) => handleCategoryChange(e.target.value as 'score' | 'goals' | 'streaks')}
                        className="leaderboard-select"
                      >
                        <option value="score">Score</option>
                        <option value="goals">Goals</option>
                        <option value="streaks">Streaks</option>
                      </select>
                      <FontAwesomeIcon icon={faChevronDown} className="select-icon" />
                    </div>
                  </div>
                  
                  <div className="control-row">
                    <label htmlFor="subcategory-select">Period:</label>
                    <div className="select-wrapper">
                      <select 
                        id="subcategory-select"
                        value={leaderboardSubcategory} 
                        onChange={(e) => setLeaderboardSubcategory(e.target.value)}
                        className="leaderboard-select"
                      >
                        {getSubcategoryOptions(leaderboardCategory).map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <FontAwesomeIcon icon={faChevronDown} className="select-icon" />
                    </div>
                  </div>
                  
                  {(leaderboardCategory === 'goals' || leaderboardCategory === 'streaks') && (
                    <div className="control-row">
                      <label htmlFor="difficulty-select">Difficulty:</label>
                      <div className="select-wrapper">
                        <select 
                          id="difficulty-select"
                          value={leaderboardDifficulty} 
                          onChange={(e) => setLeaderboardDifficulty(e.target.value)}
                          className="leaderboard-select"
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                        <FontAwesomeIcon icon={faChevronDown} className="select-icon" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Leaderboard Content */}
              {isLoadingLeaderboardV2 ? (
                <div className="stats-loading">
                  <div className="spinner"></div>
                  <p>Loading leaderboard...</p>
                </div>
              ) : leaderboardV2Error ? (
                <div className="error-message">Error: {leaderboardV2Error}</div>
              ) : (
                <div className="leaderboard-list-container">
                  {/* Current user's position if not in top 10 */}
                  {requesterEntry && (
                    <div className="requester-entry">
                      <div className={`leaderboard-entry user-entry`}>
                        <div className="entry-rank">#{requesterEntry.rank}</div>
                        <div className="entry-info">
                          <div className="entry-username">
                            <span>{requesterEntry.username}</span>
                            {requesterEntry.isCurrent && <span className="current-badge">Current</span>}
                          </div>
                          <div className="entry-value">{requesterEntry.value}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top 10 List */}
                  <div className="leaderboard-list">
                    {leaderboardV2Data.length > 0 ? (
                      leaderboardV2Data.map((entry, index) => {
                        const isCurrentUser = currentUser && entry.userId === currentUser.uid;
                        const rankClass = 
                          entry.rank === 1 ? 'rank-gold' : 
                          entry.rank === 2 ? 'rank-silver' : 
                          entry.rank === 3 ? 'rank-bronze' : 
                          '';
                        
                        return (
                          <div 
                            key={entry.userId} 
                            className={`leaderboard-entry ${rankClass} ${isCurrentUser && !rankClass ? 'user-entry' : ''}`}
                          >
                            <div className="entry-rank">#{entry.rank}</div>
                            <div className="entry-info">
                              <div className="entry-username">
                                <span>{entry.username}</span>
                                {entry.isCurrent && <span className="current-badge">Current</span>}
                              </div>
                              <div className="entry-value">{entry.value}</div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="no-data-message">No leaderboard data available.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// Add displayName property
StatsModal.displayName = 'StatsModal';

export default StatsModal; 