import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import '../scss/main.scss';
import { TileColor } from '../types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faShareNodes, faCopy, faEnvelope, faShare } from '@fortawesome/free-solid-svg-icons';
import { faTwitter, faFacebookF } from '@fortawesome/free-brands-svg-icons';
import { GameStatistics, defaultStats, LeaderboardEntry } from '../types/stats';
import { dateKeyForToday } from '../utils/dateUtils';
import { getGlobalLeaderboardCallable } from '../services/firebaseService';
import { useDataCache } from '../contexts/DataCacheContext';
import { useAuth } from '../contexts/AuthContext';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: GameStatistics | null;
  onShareStats: () => void;
  isLoading?: boolean;
}

// Define the type for sorting state
type SortConfig = { key: keyof LeaderboardEntry; direction: 'asc' | 'desc' } | null;

// Use React.memo to wrap the component
const StatsModal: React.FC<StatsModalProps> = memo(({ 
  isOpen, 
  onClose, 
  stats: gameContextStats,
  onShareStats,
  isLoading: isLoadingPersonalStats = false
}) => {
  const { currentUser } = useAuth();
  const {
      userStats: cachedUserStats,
      globalLeaderboard: cachedLeaderboard,
      loadingStates: cacheLoadingStates,
      errorStates: cacheErrorStates
  } = useDataCache();

  const [activeTab, setActiveTab] = useState<'personal' | 'global'>('personal');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState<boolean>(cacheLoadingStates.leaderboard);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(cacheErrorStates.leaderboard);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'totalMovesUsed', direction: 'desc' });
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isWebShareSupported, setIsWebShareSupported] = useState<boolean>(false);
  
  // Check if Web Share API is supported
  useEffect(() => {
    setIsWebShareSupported(typeof navigator.share === 'function');
  }, []);
  
  // Determine which stats to display (prioritize cache, fallback to props)
  // Use cachedUserStats if available and user is logged in
  const displayUserStats = (currentUser && cachedUserStats) ? cachedUserStats : gameContextStats;
  const currentStats = displayUserStats || defaultStats;
  const todayKey = dateKeyForToday(); // Get today's date key
  
  // Fetch leaderboard data when the global tab is active and modal is open
  useEffect(() => {
    const fetchLeaderboard = async () => {
      // Check cache first
      if (cachedLeaderboard) {
        console.log("[StatsModal] Using cached global leaderboard.");
        setLeaderboardData(cachedLeaderboard);
        setIsLoadingLeaderboard(false);
        setLeaderboardError(null);
        return;
      }

      // If not cached and tab is activated
      if (activeTab === 'global' && !isLoadingLeaderboard) {
        console.log("[StatsModal] No cached leaderboard, attempting fetch...");
        setIsLoadingLeaderboard(true);
        setLeaderboardError(null);
        try {
          console.log("[StatsModal] Invoking getGlobalLeaderboardCallable()...");
          const result = await getGlobalLeaderboardCallable();
          console.log("[StatsModal] Callable function call returned (raw):", result);
          
          if (result.data.success && result.data.leaderboard) {
            // Apply the initial sort config to the fetched data
            const initialSortedData = sortLeaderboard(result.data.leaderboard, sortConfig);
            setLeaderboardData(initialSortedData);
          } else {
            throw new Error(result.data.error || 'Failed to fetch leaderboard');
          }
        } catch (error: any) {
          console.error("[StatsModal] Error calling getGlobalLeaderboard callable:", error);
          setLeaderboardError(error.message || 'Could not load leaderboard data.');
        } finally {
          setIsLoadingLeaderboard(false);
        }
      }
    };

    if (isOpen) {
      fetchLeaderboard();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isOpen, cachedLeaderboard]);
  
  // Update local state if cache updates while modal is open
  useEffect(() => {
    if (isOpen && cachedLeaderboard) {
      // Sort cached leaderboard data when it updates
      const sortedCachedData = sortLeaderboard(cachedLeaderboard, sortConfig);
      setLeaderboardData(sortedCachedData);
      setIsLoadingLeaderboard(cacheLoadingStates.leaderboard);
      setLeaderboardError(cacheErrorStates.leaderboard);
    }
  }, [cachedLeaderboard, cacheLoadingStates.leaderboard, cacheErrorStates.leaderboard, isOpen, sortConfig]);
  
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
  
  // --- Change: Extracted sorting logic to a reusable function ---
  const sortLeaderboard = (data: LeaderboardEntry[], config: SortConfig): LeaderboardEntry[] => {
    let sortableItems = [...data];
    if (config !== null) {
      sortableItems.sort((a, b) => {
        // Handle potentially undefined values during sorting
        const aValue = a[config.key] ?? (config.direction === 'asc' ? Infinity : -Infinity);
        const bValue = b[config.key] ?? (config.direction === 'asc' ? Infinity : -Infinity);

        // Compare values
        if (aValue < bValue) return config.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return config.direction === 'asc' ? 1 : -1;

        // Secondary sort by username if primary values are equal
        const aUsername = a.username?.toLowerCase() || '';
        const bUsername = b.username?.toLowerCase() || '';
        if (aUsername < bUsername) return -1;
        if (aUsername > bUsername) return 1;

        return 0; // Keep original order if all else fails
      });
    }
    return sortableItems;
  };

  // Memoized sorted leaderboard data using the extracted function
  const sortedLeaderboardData = useMemo(() => {
    return sortLeaderboard(leaderboardData, sortConfig);
  }, [leaderboardData, sortConfig]);
  
  // Request sorting function
  const requestSort = (key: keyof LeaderboardEntry) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (!sortConfig || sortConfig.key !== key) {
      // Define default sort directions for specific keys
      const descKeys: (keyof LeaderboardEntry)[] = [
        'totalWins', 'longestPuzzleCompletedStreak', 'currentPuzzleCompletedStreak',
        'longestTieBotStreak', 'currentTieBotStreak', 'currentFirstTryStreak',
        'longestFirstTryStreak', 'eloScoreTotal', 'eloScoreTotalLast30', 'totalMovesUsed'
      ];
      const ascKeys: (keyof LeaderboardEntry)[] = [
        'eloScoreAvg', 'eloScoreAvgLast30'
      ];
      if (descKeys.includes(key)) direction = 'desc';
      else if (ascKeys.includes(key)) direction = 'asc';
      else direction = 'asc'; // Default to ascending for username
    }
    setSortConfig({ key, direction });
  };
  
  // Get sorting indicator arrow
  const getSortIndicator = (key: keyof LeaderboardEntry) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };
  
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
              {showPersonalStatsLoader ? (
                <div className="stats-loading">
                  <div className="spinner"></div>
                  <p>Loading statistics...</p>
                </div>
              ) : cacheErrorStates.userStats ? (
                <div className="error-message">Error loading stats: {cacheErrorStates.userStats}</div>
              ) : (
                <>
                  <div className="stats-section">
                    <h3>Today's Game ({todayKey})</h3>
                    <div className="stats-grid today-stats-grid">
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.bestScoresByDay, 'bestScoreToday')}</div>
                        <div className="stat-label">Best Score</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.attemptsPerDay?.[todayKey], 'number')}</div>
                        <div className="stat-label">Attempts</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.winsPerDay?.[todayKey], 'number')}</div>
                        <div className="stat-label">Wins Today</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.hintUsageByDay?.[todayKey], 'number')}</div>
                        <div className="stat-label">Hints Today</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.attemptsToAchieveBotScore?.[todayKey], 'attemptsToday')}</div>
                        <div className="stat-label">Attempts to Achieve Bot</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.attemptsToBeatBotScore?.[todayKey], 'attemptsToday')}</div>
                        <div className="stat-label">Attempts to Beat Bot</div>
                      </div>
                       <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.attemptsToWinByDay?.[todayKey], 'attemptsToday')}</div>
                        <div className="stat-label">Attempts to Win</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="stats-section">
                    <h3>All-time Stats</h3>
                    <div className="stats-grid all-time-stats-grid">
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.currentPuzzleCompletedStreak, 'number')}</div>
                        <div className="stat-label">Current Win Streak</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.longestPuzzleCompletedStreak, 'number')}</div>
                        <div className="stat-label">Longest Win Streak</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.currentTieBotStreak, 'number')}</div>
                        <div className="stat-label">Current Tie/Beat Streak</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.longestTieBotStreak, 'number')}</div>
                        <div className="stat-label">Longest Tie/Beat Streak</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.playedDays, 'arrayLength')}</div>
                        <div className="stat-label">Days Played</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.goalAchievedDays, 'arrayLength')}</div>
                        <div className="stat-label">Goals Achieved</div>
                        <div className="stat-description">(Met or Beat Bot)</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.goalBeatenDays, 'arrayLength')}</div>
                        <div className="stat-label">Goals Beaten</div>
                        <div className="stat-description">(Beat Bot)</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.totalWins, 'number')}</div>
                        <div className="stat-label">Total Wins</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.totalGamesPlayed, 'number')}</div>
                        <div className="stat-label">Total Games</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.totalMovesUsed, 'number')}</div>
                        <div className="stat-label">Total Moves</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.totalHintsUsed, 'number')}</div>
                        <div className="stat-label">Total Hints</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.currentFirstTryStreak, 'number')}</div>
                        <div className="stat-label">First Try Streak</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{safelyDisplay(currentStats?.longestFirstTryStreak, 'number')}</div>
                        <div className="stat-label">Longest 1st Try</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{currentStats?.eloScoreAvg?.toFixed(0) ?? 'N/A'}</div>
                        <div className="stat-label">Elo Avg (All)</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{currentStats?.eloScoreAvgLast30?.toFixed(0) ?? 'N/A'}</div>
                        <div className="stat-label">Elo Avg (30d)</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{currentStats?.eloScoreTotal ?? 'N/A'}</div>
                        <div className="stat-label">Elo Total</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{currentStats?.eloScoreTotalLast30 ?? 'N/A'}</div>
                        <div className="stat-label">Elo Total (30d)</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="share-section">
                    <p>Share your statistics:</p>
                    <div className="social-buttons">
                      <button 
                        className="social-button twitter-button" 
                        onClick={handleTwitterShare}
                        aria-label="Share to Twitter"
                      >
                        <FontAwesomeIcon icon={faTwitter} />
                      </button>
                      <button 
                        className="social-button facebook-button" 
                        onClick={handleFacebookShare}
                        aria-label="Share to Facebook"
                      >
                        <FontAwesomeIcon icon={faFacebookF} />
                      </button>
                      <button 
                        className="social-button email-button" 
                        onClick={handleEmailShare}
                        aria-label="Share via Email"
                      >
                        <FontAwesomeIcon icon={faEnvelope} />
                      </button>
                      <button 
                        className="social-button copy-button" 
                        onClick={handleCopyToClipboard}
                        aria-label="Copy to Clipboard"
                      >
                        <FontAwesomeIcon icon={faCopy} />
                        {copySuccess && <span className="copy-success-tooltip">Copied!</span>}
                      </button>
                      {isWebShareSupported && (
                        <button 
                          className="social-button web-share-button" 
                          onClick={handleWebShare}
                          aria-label="Share"
                        >
                          <FontAwesomeIcon icon={faShare} />
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Global Leaderboard Tab */} 
          {activeTab === 'global' && (
            <div className="stats-section global-stats-section" role="tabpanel" aria-labelledby="global-tab">
              {isLoadingLeaderboard ? (
                <div className="stats-loading">
                  <div className="spinner"></div>
                  <p>Loading leaderboard...</p>
                </div>
              ) : leaderboardError ? (
                <div className="error-message">Error: {leaderboardError}</div>
              ) : (
                <div className="table-container">
                  <table className="global-stats-table">
                    <thead>
                      <tr>
                        <th onClick={() => requestSort('username')} aria-sort={sortConfig?.key === 'username' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Username{getSortIndicator('username')}
                        </th>
                        <th onClick={() => requestSort('totalWins')} aria-sort={sortConfig?.key === 'totalWins' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Wins{getSortIndicator('totalWins')}
                        </th>
                        <th onClick={() => requestSort('totalMovesUsed')} aria-sort={sortConfig?.key === 'totalMovesUsed' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Moves{getSortIndicator('totalMovesUsed')}
                        </th>
                        <th onClick={() => requestSort('currentPuzzleCompletedStreak')} aria-sort={sortConfig?.key === 'currentPuzzleCompletedStreak' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Win Strk{getSortIndicator('currentPuzzleCompletedStreak')}
                        </th>
                         <th onClick={() => requestSort('longestPuzzleCompletedStreak')} aria-sort={sortConfig?.key === 'longestPuzzleCompletedStreak' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Max Win Strk{getSortIndicator('longestPuzzleCompletedStreak')}
                        </th>
                        <th onClick={() => requestSort('currentTieBotStreak')} aria-sort={sortConfig?.key === 'currentTieBotStreak' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Tie/Beat Strk{getSortIndicator('currentTieBotStreak')}
                        </th>
                        <th onClick={() => requestSort('longestTieBotStreak')} aria-sort={sortConfig?.key === 'longestTieBotStreak' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Max Tie/Beat{getSortIndicator('longestTieBotStreak')}
                        </th>
                        <th onClick={() => requestSort('currentFirstTryStreak')} aria-sort={sortConfig?.key === 'currentFirstTryStreak' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          1st Try Strk{getSortIndicator('currentFirstTryStreak')}
                        </th>
                        <th onClick={() => requestSort('longestFirstTryStreak')} aria-sort={sortConfig?.key === 'longestFirstTryStreak' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Max 1st Try{getSortIndicator('longestFirstTryStreak')}
                        </th>
                        <th onClick={() => requestSort('eloScoreAvg')} aria-sort={sortConfig?.key === 'eloScoreAvg' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Elo Avg{getSortIndicator('eloScoreAvg')}
                        </th>
                        <th onClick={() => requestSort('eloScoreTotal')} aria-sort={sortConfig?.key === 'eloScoreTotal' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Elo Total{getSortIndicator('eloScoreTotal')}
                        </th>
                        <th onClick={() => requestSort('eloScoreAvgLast30')} aria-sort={sortConfig?.key === 'eloScoreAvgLast30' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Elo Avg (30d){getSortIndicator('eloScoreAvgLast30')}
                        </th>
                        <th onClick={() => requestSort('eloScoreTotalLast30')} aria-sort={sortConfig?.key === 'eloScoreTotalLast30' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          Elo Total (30d){getSortIndicator('eloScoreTotalLast30')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLeaderboardData.length > 0 ? (
                          sortedLeaderboardData.map((entry) => {
                            // --- Change: Check if this row is the current user ---
                            const isCurrentUser = currentUser && entry.userId === currentUser.uid;
                            return (
                              // --- Change: Add 'current-user-row' class conditionally ---
                              <tr key={entry.userId} className={isCurrentUser ? 'current-user-row' : ''}>
                                <td>{entry.username || 'Anonymous'}</td>
                                <td>{entry.totalWins}</td>
                                <td>{entry.totalMovesUsed}</td>
                                <td>{entry.currentPuzzleCompletedStreak}</td>
                                <td>{entry.longestPuzzleCompletedStreak}</td>
                                <td>{entry.currentTieBotStreak}</td>
                                <td>{entry.longestTieBotStreak}</td>
                                <td>{entry.currentFirstTryStreak}</td>
                                <td>{entry.longestFirstTryStreak}</td>
                                <td>{entry.eloScoreAvg !== null ? entry.eloScoreAvg.toFixed(0) : 'N/A'}</td>
                                <td>{entry.eloScoreTotal !== null ? entry.eloScoreTotal : 'N/A'}</td>
                                <td>{entry.eloScoreAvgLast30 !== null ? entry.eloScoreAvgLast30.toFixed(0) : 'N/A'}</td>
                                <td>{entry.eloScoreTotalLast30 !== null ? entry.eloScoreTotalLast30 : 'N/A'}</td>
                              </tr>
                            );
                          })
                      ) : (
                        <tr>
                          <td colSpan={13} style={{ textAlign: 'center' }}>No leaderboard data available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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