import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { FirestorePuzzleData } from '../types';
import { GameStatistics, LeaderboardEntry, defaultStats } from '../types/stats';
import {
    getDailyScoresStatsCallable,
    fetchPuzzleCallable,
    getUserStatsCallable,
    getGlobalLeaderboardCallable
} from '../services/firebaseService';
import { dateKeyForToday } from '../utils/dateUtils';
import { User } from 'firebase/auth';

interface DailyScoreStats {
    lowestScore: number | null;
    averageScore: number | null;
    totalPlayers: number;
    playersWithLowestScore: number;
}

interface LoadingStates {
    dailyScores: boolean;
    puzzle: boolean;
    userStats: boolean;
    leaderboard: boolean;
}

interface ErrorStates {
    dailyScores: string | null;
    puzzle: string | null;
    userStats: string | null;
    leaderboard: string | null;
}

interface DataCacheContextValue {
    dailyScoresStats: DailyScoreStats | null;
    puzzleData: FirestorePuzzleData | null;
    userStats: GameStatistics | null;
    globalLeaderboard: LeaderboardEntry[] | null;
    loadingStates: LoadingStates;
    errorStates: ErrorStates;
    fetchAndCacheData: (currentUser: User | null) => Promise<void>;
    isInitialFetchDone: boolean;
}

const initialLoadingStates: LoadingStates = {
    dailyScores: false,
    puzzle: false,
    userStats: false,
    leaderboard: false,
};

const initialErrorStates: ErrorStates = {
    dailyScores: null,
    puzzle: null,
    userStats: null,
    leaderboard: null,
};

const DataCacheContext = createContext<DataCacheContextValue | undefined>(undefined);

export const useDataCache = () => {
    const context = useContext(DataCacheContext);
    if (!context) {
        throw new Error('useDataCache must be used within a DataCacheProvider');
    }
    return context;
};

interface DataCacheProviderProps {
    children: ReactNode;
}

export const DataCacheProvider: React.FC<DataCacheProviderProps> = ({ children }) => {
    const [dailyScoresStats, setDailyScoresStats] = useState<DailyScoreStats | null>(null);
    const [puzzleData, setPuzzleData] = useState<FirestorePuzzleData | null>(null);
    const [userStats, setUserStats] = useState<GameStatistics | null>(null);
    const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardEntry[] | null>(null);
    const [loadingStates, setLoadingStates] = useState<LoadingStates>(initialLoadingStates);
    const [errorStates, setErrorStates] = useState<ErrorStates>(initialErrorStates);
    const [isInitialFetchDone, setIsInitialFetchDone] = useState(false);

    const fetchAndCacheData = useCallback(async (currentUser: User | null) => {
        if (isInitialFetchDone) {
            console.log("DataCacheContext: Initial fetch already done, skipping.");
            return;
        }
        console.log("DataCacheContext: Starting initial data fetch sequence...");

        const today = dateKeyForToday();

        // --- 1. Fetch Daily Scores Stats ---
        setLoadingStates(prev => ({ ...prev, dailyScores: true }));
        setErrorStates(prev => ({ ...prev, dailyScores: null }));
        try {
            console.log("DataCacheContext: Fetching Daily Scores Stats...");
            const result = await getDailyScoresStatsCallable({ puzzleId: today });
            if (result.data.success && result.data.stats) {
                setDailyScoresStats(result.data.stats);
                console.log("DataCacheContext: Daily Scores Stats fetched successfully.");
            } else {
                throw new Error(result.data.error || 'Failed to fetch daily scores stats');
            }
        } catch (error: any) {
            console.error("DataCacheContext: Error fetching daily scores stats:", error);
            setErrorStates(prev => ({ ...prev, dailyScores: error.message || 'Failed to load daily stats' }));
        } finally {
            setLoadingStates(prev => ({ ...prev, dailyScores: false }));
        }

        // --- 2. Fetch Puzzle Data ---
        setLoadingStates(prev => ({ ...prev, puzzle: true }));
        setErrorStates(prev => ({ ...prev, puzzle: null }));
        try {
            console.log("DataCacheContext: Fetching Puzzle Data...");
            const result = await fetchPuzzleCallable({ date: today });
            if (result.data.success && result.data.data) {
                setPuzzleData(result.data.data);
                console.log("DataCacheContext: Puzzle Data fetched successfully.");
            } else {
                throw new Error(result.data.error || 'Failed to fetch puzzle data');
            }
        } catch (error: any) {
            console.error("DataCacheContext: Error fetching puzzle data:", error);
            setErrorStates(prev => ({ ...prev, puzzle: error.message || 'Failed to load puzzle' }));
        } finally {
            setLoadingStates(prev => ({ ...prev, puzzle: false }));
        }

        // --- 3. Fetch User Stats (for any authenticated user, including guests) ---
        if (currentUser) {
            setLoadingStates(prev => ({ ...prev, userStats: true }));
            setErrorStates(prev => ({ ...prev, userStats: null }));
            try {
                console.log("DataCacheContext: Fetching User Stats...");
                const result = await getUserStatsCallable();
                if (result.data.success && result.data.stats) {
                    setUserStats(result.data.stats);
                    console.log("DataCacheContext: User Stats fetched successfully.");
                } else {
                    // If stats don't exist for user, backend returns success: true but no stats
                    if (result.data.success && !result.data.stats) {
                        console.log("DataCacheContext: No user stats found for user, using defaults.");
                        setUserStats({ ...defaultStats }); // Use default stats if none exist
                    } else {
                         throw new Error(result.data.error || 'Failed to fetch user stats');
                    }
                }
            } catch (error: any) {
                console.error("DataCacheContext: Error fetching user stats:", error);
                setErrorStates(prev => ({ ...prev, userStats: error.message || 'Failed to load user stats' }));
            } finally {
                setLoadingStates(prev => ({ ...prev, userStats: false }));
            }
        } else {
             console.log("DataCacheContext: Skipping user stats fetch (no user logged in).");
             setUserStats(null); // Ensure userStats is null if not fetched
        }

        // --- 4. Fetch Global Leaderboard ---
        setLoadingStates(prev => ({ ...prev, leaderboard: true }));
        setErrorStates(prev => ({ ...prev, leaderboard: null }));
        try {
            console.log("DataCacheContext: Fetching Global Leaderboard...");
            const result = await getGlobalLeaderboardCallable();
            if (result.data.success && result.data.leaderboard) {
                setGlobalLeaderboard(result.data.leaderboard);
                console.log("DataCacheContext: Global Leaderboard fetched successfully.");
            } else {
                throw new Error(result.data.error || 'Failed to fetch global leaderboard');
            }
        } catch (error: any) {
            console.error("DataCacheContext: Error fetching global leaderboard:", error);
            setErrorStates(prev => ({ ...prev, leaderboard: error.message || 'Failed to load leaderboard' }));
        } finally {
            setLoadingStates(prev => ({ ...prev, leaderboard: false }));
        }

        console.log("DataCacheContext: Initial data fetch sequence complete.");
        setIsInitialFetchDone(true);

    }, [isInitialFetchDone]); // Dependency ensures it only runs once unless isInitialFetchDone changes

    const value: DataCacheContextValue = {
        dailyScoresStats,
        puzzleData,
        userStats,
        globalLeaderboard,
        loadingStates,
        errorStates,
        fetchAndCacheData,
        isInitialFetchDone,
    };

    return (
        <DataCacheContext.Provider value={value}>
            {children}
        </DataCacheContext.Provider>
    );
}; 