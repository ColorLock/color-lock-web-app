import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger as v2Logger } from "firebase-functions/v2";
import { calculateEloScore } from "./eloUtils";
import { GameStatistics, defaultStats } from "../../src/types/stats";
import { DifficultyLevel } from "../../src/types/settings";
import { DateTime } from "luxon";

/**
 * App Check Strategy:
 * 
 * In this codebase, we use a dynamic approach to App Check enforcement:
 * 
 * 1. Production Environment: 
 *    - App Check is strictly enforced (`enforceAppCheck: true`)
 *    - All requests must have valid App Check tokens
 *    - Full security is maintained
 * 
 * 2. Emulator/Development Environment:
 *    - App Check is automatically disabled (`enforceAppCheck: false`)
 *    - Allows for easier local testing without dealing with App Check complexities
 *    - The environment is detected using multiple methods (FUNCTIONS_EMULATOR env var, etc.)
 * 
 * This approach maintains security in production while enabling seamless local development.
 * The `getAppCheckConfig()` helper function handles this logic.
 */

// Initialize Firebase app
admin.initializeApp();

// Initialize Firestore client
const db = admin.firestore();

// Configure logging (choose v1 or v2 logger)
const logger = v2Logger; // Using v2 logger

// Utility function to determine App Check enforcement based on environment
function getAppCheckConfig() {
    // Multiple ways to detect emulator environment
    const isEmulatorEnv = 
        process.env.FUNCTIONS_EMULATOR === 'true' || 
        process.env.FIRESTORE_EMULATOR_HOST !== undefined ||
        process.env.FIREBASE_CONFIG?.includes('"emulators"') ||
        process.env.NODE_ENV === 'development';
    
    // Log the detection for debugging purposes
    logger.info(`Running in ${isEmulatorEnv ? 'emulator/development' : 'production'} environment. App Check will be ${isEmulatorEnv ? 'disabled' : 'enforced'}.`);
    
    return {
        enforceAppCheck: !isEmulatorEnv, // false in emulator, true in production
    };
}

/**
 * v2 Firebase Cloud Function to fetch a puzzle by date
 */
export const fetchPuzzle = onCall(
    {
        // Runtime options
        memory: "256MiB",
        timeoutSeconds: 60,
        // App Check options
        ...getAppCheckConfig(), // Use helper to determine App Check enforcement
    },
    async (request) => {
        // request.app will be defined if enforceAppCheck is true and validation passed
        // request.auth contains user authentication info (or null if unauthenticated)
        const userId = request.auth?.uid || "guest/unauthenticated";
        logger.info(`v2/fetchPuzzle invoked by user: ${userId}, App Check verified: ${!!request.app}`);

        // Validate Input Data
        const date = request.data.date;
        if (!date) {
            logger.error("Missing 'date' parameter in v2/fetchPuzzle call.");
            throw new HttpsError("invalid-argument", "The function must be called with a \"date\" argument.");
        }

        // Function Logic
        try {
            logger.info(`v2: Attempting to fetch puzzle for date: ${date}`);
            const puzzleRef = db.collection("puzzles").doc(date);
            const puzzleSnap = await puzzleRef.get();

            if (puzzleSnap.exists) {
                logger.info("v2: Puzzle found in Firestore");
                const puzzleData = puzzleSnap.data();

                // Add stricter validation
                if (!puzzleData || typeof puzzleData.algoScore !== "number" || !puzzleData.targetColor || !Array.isArray(puzzleData.states) || puzzleData.states.length === 0 || !Array.isArray(puzzleData.actions)) {
                    logger.error(`v2: Invalid puzzle data format found for date: ${date}`, puzzleData);
                    throw new HttpsError("internal", "Invalid puzzle data format found.");
                }

                return { success: true, data: puzzleData }; // Return data on success
            } else {
                logger.warn(`v2: No puzzle found for date: ${date}`);
                throw new HttpsError("not-found", `Puzzle not found for date: ${date}`);
            }
        } catch (error) {
            logger.error(`v2: Error in fetchPuzzle for date ${date}:`, error);
            if (error instanceof HttpsError) {
                throw error; // Re-throw HttpsError
            }
            throw new HttpsError("internal", "Internal server error fetching puzzle");
        }
    }
);

// --- New: Record Puzzle History (per data_sctructure_1.json) ---

interface RecordPuzzlePayload {
    puzzle_id: string;
    user_id?: string;
    difficulty: DifficultyLevel | "easy" | "medium" | "hard";
    attemptNumber: number;
    moves: number;
    hintUsed: boolean;
    botMoves: number;
    win_loss: "win" | "loss";
}

// Export helper functions for testing
export function normalizeDifficulty(d: RecordPuzzlePayload["difficulty"]): DifficultyLevel {
    const val = typeof d === "string" ? d.toLowerCase() : d;
    if (val === DifficultyLevel.Easy || val === "easy") return DifficultyLevel.Easy;
    if (val === DifficultyLevel.Medium || val === "medium") return DifficultyLevel.Medium;
    return DifficultyLevel.Hard;
}

export function isDayAfter(prevDateStr: string | null | undefined, currentDateStr: string): boolean {
    if (!prevDateStr) return false;
    try {
        const prev = new Date(prevDateStr);
        const curr = new Date(currentDateStr);
        const prevUTC = Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate());
        const nextPrev = new Date(prevUTC);
        nextPrev.setUTCDate(new Date(prevUTC).getUTCDate() + 1);
        const expected = `${nextPrev.getUTCFullYear()}-${String(nextPrev.getUTCMonth() + 1).padStart(2, '0')}-${String(nextPrev.getUTCDate()).padStart(2, '0')}`;
        return expected === currentDateStr;
    } catch {
        return false;
    }
}

async function getLowestHardDailyScore(puzzleId: string, excludeUserId?: string): Promise<number | null> {
    const docSnap = await db.collection("dailyScoresV2").doc(puzzleId).get();
    if (!docSnap.exists) return null;
    
    const data = docSnap.data();
    const hardScores = data?.hard;
    
    if (!hardScores || typeof hardScores !== "object") return null;
    
    let minScore: number | null = null;
    for (const userId in hardScores) {
        // Skip the current user when checking if they're first to beat bot
        if (excludeUserId && userId === excludeUserId) continue;
        
        const moves = hardScores[userId];
        if (typeof moves === "number" && !isNaN(moves)) {
            if (minScore === null || moves < minScore) {
                minScore = moves;
            }
        }
    }
    
    return minScore;
}

export const recordPuzzleHistory = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        if (!request.auth) {
            logger.error("recordPuzzleHistory: unauthenticated call");
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;
        const payload = request.data as RecordPuzzlePayload;

        if (!payload || !payload.puzzle_id || !payload.difficulty || typeof payload.attemptNumber !== 'number' || typeof payload.moves !== 'number' || typeof payload.hintUsed !== 'boolean' || typeof payload.botMoves !== 'number' || (payload.win_loss !== 'win' && payload.win_loss !== 'loss')) {
            throw new HttpsError("invalid-argument", "Invalid or missing fields in payload.");
        }
        if (payload.user_id && payload.user_id !== userId) {
            throw new HttpsError("permission-denied", "User ID mismatch.");
        }

        const puzzleId = payload.puzzle_id;
        const difficulty = normalizeDifficulty(payload.difficulty);
        const moves = payload.moves;
        const hintUsed = payload.hintUsed;
        const botMoves = payload.botMoves;
        const isWin = payload.win_loss === 'win';

        // Determine firstToBeatBot by looking at existing dailyScores (Hard difficulty only, ignoring Easy/Medium entries)
        // Exclude the current user's previous scores when checking if they're first to beat bot
        const qualifiesVsBot = moves < botMoves;
        let firstToBeatBot = false;
        if (difficulty === DifficultyLevel.Hard) {
            const lowestExisting = await getLowestHardDailyScore(puzzleId, userId); // null => no hard scores yet from other users
            firstToBeatBot = qualifiesVsBot && (lowestExisting === null || lowestExisting > moves);
        }
        // These will be computed using global attempt number inside the transaction
        let firstTry = false;
        let elo = 0;

        const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
        const puzzleRef = userHistoryRef.collection("puzzles").doc(puzzleId);
        const levelAgnosticRef = userHistoryRef.collection("leaderboard").doc("levelAgnostic");
        const difficultyRef = userHistoryRef.collection("leaderboard").doc(difficulty);

        let v2Writes: Array<{ diffKey: DifficultyLevel; moves: number }> = [];
        await db.runTransaction(async (tx) => {
            // Read all docs first
            const [puzzleSnap, laSnap, dSnap] = await Promise.all([
                tx.get(puzzleRef),
                tx.get(levelAgnosticRef),
                tx.get(difficultyRef)
            ]);

            // Prepare in-memory data
            const puzzleData = puzzleSnap.exists ? (puzzleSnap.data() || {}) : {} as Record<string, unknown>;
            const la = laSnap.exists ? (laSnap.data() as any) : {};
            const d = dSnap.exists ? (dSnap.data() as any) : {};

            // Compute and persist global per-puzzle attempt count
            const prevTotalAttempts = typeof (puzzleData as any).totalAttempts === 'number' ? (puzzleData as any).totalAttempts : 0;
            const globalAttemptNumber = prevTotalAttempts + 1;
            (puzzleData as any).totalAttempts = globalAttemptNumber;

            // firstTry is true only if this is the first-ever attempt on this puzzle,
            // the user ties/beats the bot, and no hint was used on that first attempt
            firstTry = globalAttemptNumber === 1 && moves <= botMoves && !hintUsed;

            // Persist global hintUsed across difficulties; once true, remains true
            const prevGlobalHintUsed = !!(puzzleData as any).hintUsed;
            if (!prevGlobalHintUsed && hintUsed) {
                (puzzleData as any).hintUsed = true;
            } else if (prevGlobalHintUsed) {
                (puzzleData as any).hintUsed = true;
            }
            const globalHintUsed = !!(puzzleData as any).hintUsed;

            // Potential puzzle-level update (only on win); ensure difficulty doc exists on loss
            if (isWin) {
                const diffKey = difficulty; // 'easy' | 'medium' | 'hard'
                const existing = (puzzleData as any)[diffKey] as { attemptNumber: number; moves: number; hintUsed: boolean; firstTry?: boolean; firstToBeatBot?: boolean; eloScore?: number; elo?: number } | undefined;
                let newDiffObj: any;
                // Prepare Elo input using the global attempt number and global hint usage
                const gameStatsForElo: GameStatistics = {
                    ...defaultStats,
                    attemptsToWinByDay: { [puzzleId]: globalAttemptNumber },
                    // Penalize Elo if any hint was used on this puzzle (attempt index not tracked)
                    attemptWhenHintUsed: { [puzzleId]: globalHintUsed ? 1 : null },
                    attemptsToAchieveBotScore: (moves < botMoves || moves === botMoves) ? { [puzzleId]: globalAttemptNumber } : {},
                    attemptsToBeatBotScore: (moves < botMoves) ? { [puzzleId]: globalAttemptNumber } : {},
                    bestScoresByDayDifficulty: { [puzzleId]: difficulty },
                } as GameStatistics;
                elo = calculateEloScore(gameStatsForElo, { algoScore: botMoves }, puzzleId, moves, firstToBeatBot, difficulty);

                const achievedTieNow = moves <= botMoves;
                const achievedBeatNow = moves < botMoves;

                const existingMovesVal = (existing as any)?.moves;
                const shouldReplaceMoves = !existing || typeof existingMovesVal !== 'number' || (typeof existingMovesVal === 'number' && moves < existingMovesVal);

                if (!existing) {
                    newDiffObj = { attemptNumber: globalAttemptNumber, moves, firstTry, eloScore: elo };
                    if (achievedTieNow) newDiffObj.attemptToTieBot = globalAttemptNumber;
                    if (achievedBeatNow) newDiffObj.attemptToBeatBot = globalAttemptNumber;
                    newDiffObj.firstToBeatBot = difficulty === DifficultyLevel.Hard ? firstToBeatBot : false;
                } else {
                    // Preserve first recorded attempts; only set if not previously set
                    const attemptToTieBot = (existing as any).attemptToTieBot ?? (achievedTieNow ? globalAttemptNumber : null);
                    const attemptToBeatBot = (existing as any).attemptToBeatBot ?? (achievedBeatNow ? globalAttemptNumber : null);

                    if (shouldReplaceMoves) {
                        newDiffObj = {
                            attemptNumber: globalAttemptNumber,
                            moves,
                            firstTry: existing.firstTry ?? firstTry, // Preserve existing firstTry value
                            eloScore: elo,
                            attemptToTieBot,
                            attemptToBeatBot,
                        };
                        // Allow firstToBeatBot to be set on any attempt where user achieves it
                        newDiffObj.firstToBeatBot = difficulty === DifficultyLevel.Hard ? (existing.firstToBeatBot || firstToBeatBot) : false;
                    } else {
                        newDiffObj = {
                            attemptNumber: existing.attemptNumber,
                            moves: existing.moves,
                            firstTry: existing.firstTry ?? firstTry,
                            eloScore: (existing as any).eloScore ?? (existing as any).elo ?? elo,
                            attemptToTieBot,
                            attemptToBeatBot,
                        };
                        newDiffObj.firstToBeatBot = difficulty === DifficultyLevel.Hard ? (existing.firstToBeatBot || false) : false;
                    }
                }
                (puzzleData as any)[diffKey] = newDiffObj;

                // --- New: Write per-difficulty daily score to separate collection (v2) ---
                // Path: dailyScoresV2/{puzzleId}/{difficulty}/{userId} with field { moves }
                // Mirror to V2 immediately in transaction and queue for stats recompute
                try {
                    const existingMoves = (existing as any)?.moves;
                    const shouldMirror = !existing || typeof existingMoves !== 'number' || (typeof existingMoves === 'number' && moves < existingMoves);
                    if (shouldMirror) {
                        const v2DocRef = db.collection("dailyScoresV2").doc(puzzleId);
                        // Write nested map using proper merge semantics (no dot-path in set)
                        tx.set(v2DocRef, { [diffKey]: { [userId]: moves } }, { merge: true });
                        v2Writes.push({ diffKey, moves });
                    }
                } catch (e) {
                    logger.warn("Failed mirroring per-difficulty daily score (v2)", { puzzleId, difficulty: diffKey, userId }, e);
                }
            } else {
                // Loss: ensure difficulty entry exists with defaults on first recorded loss
                const diffKey = difficulty; // 'easy' | 'medium' | 'hard'
                const existingLoss = (puzzleData as any)[diffKey] as { attemptNumber?: number } | undefined;
                if (!existingLoss) {
                    (puzzleData as any)[diffKey] = {
                        attemptNumber: globalAttemptNumber,
                        moves: null,
                        attemptToBeatBot: null,
                        attemptToTieBot: null,
                        eloScore: null,
                        firstToBeatBot: false,
                        firstTry: false,
                    };
                    // Loss: Do NOT write to dailyScoresV2
                    logger.info("Loss recorded for puzzle history only, not writing to dailyScoresV2", { puzzleId, difficulty: diffKey, userId });
                }
            }

            // Prepare level-agnostic leaderboard update
            const prevMoves = typeof la?.moves === 'number' ? la.moves : 0;
            const prevAttempts = typeof la?.puzzleAttempts === 'number' ? la.puzzleAttempts : 0;
            const prevSolved = typeof la?.puzzleSolved === 'number' ? la.puzzleSolved : 0;
            const prevCurrentStreak = typeof la?.currentPuzzleCompletedStreak === 'number' ? la.currentPuzzleCompletedStreak : 0;
            const prevLongestStreak = typeof la?.longestPuzzleCompletedStreak === 'number' ? la.longestPuzzleCompletedStreak : 0;
            const prevLastCompletedDate = typeof la?.lastPuzzleCompletedDate === 'string' ? la.lastPuzzleCompletedDate : null;

            let currentStreak = prevCurrentStreak;
            let longestStreak = prevLongestStreak;
            
            if (isWin) {
                // Only update streak if this is a different day than last completed
                if (prevLastCompletedDate === puzzleId) {
                    // Same day, keep current streak unchanged
                    logger.info(`[LEADERBOARD] Puzzle ${puzzleId} already completed, keeping streak at ${currentStreak}`);
                } else if (isDayAfter(prevLastCompletedDate, puzzleId)) {
                    // Consecutive day, increment streak
                    currentStreak = prevCurrentStreak + 1;
                    logger.info(`[LEADERBOARD] Consecutive day win, streak incremented to ${currentStreak}`);
                } else {
                    // Gap or first win, reset to 1
                    currentStreak = 1;
                    logger.info(`[LEADERBOARD] Non-consecutive day or first win, streak reset to 1`);
                }
            }
            longestStreak = Math.max(prevLongestStreak, currentStreak);

            // Prepare difficulty leaderboard update (no moves/puzzleAttempts in difficulty docs)
            let diffUpdate: any = {};
            // Prepare level-agnostic Elo updates when new best Elo for the day is achieved
            let eloAggregateUpdate: any = undefined;
            if (isWin) {
                const prevFirstTryCurrent = typeof d?.currentFirstTryStreak === 'number' ? d.currentFirstTryStreak : 0;
                const prevFirstTryLongest = typeof d?.longestFirstTryStreak === 'number' ? d.longestFirstTryStreak : 0;
                const prevLastFirstTryDate = typeof d?.lastFirstTryDate === 'string' ? d.lastFirstTryDate : null;
                const prevGoalsAchieved = typeof d?.goalsAchieved === 'number' ? d.goalsAchieved : 0;
                const prevGoalAchievedDate = typeof d?.goalAchievedDate === 'string' ? d.goalAchievedDate : null;
                const prevGoalsBeaten = typeof d?.goalsBeaten === 'number' ? d.goalsBeaten : 0;
                const prevGoalBeatenDate = typeof d?.goalBeatenDate === 'string' ? d.goalBeatenDate : null;
                const prevTieCurrent = typeof d?.currentTieBotStreak === 'number' ? d.currentTieBotStreak : 0;
                const prevTieLongest = typeof d?.longestTieBotStreak === 'number' ? d.longestTieBotStreak : 0;
                const prevLastTieDate = typeof d?.lastTieBotDate === 'string' ? d.lastTieBotDate : null;

                // First try streak
                let newFirstTryCurrent = prevFirstTryCurrent;
                let newFirstTryLongest = prevFirstTryLongest;
                let newLastFirstTryDate = prevLastFirstTryDate;
                if (globalAttemptNumber === 1 && moves <= botMoves && !hintUsed) {
                    if (!prevLastFirstTryDate) {
                        newFirstTryCurrent = 1;
                    } else if (isDayAfter(prevLastFirstTryDate, puzzleId)) {
                        newFirstTryCurrent = prevFirstTryCurrent + 1;
                    } else {
                        newFirstTryCurrent = 1;
                    }
                    newFirstTryLongest = Math.max(newFirstTryCurrent, prevFirstTryLongest);
                    newLastFirstTryDate = puzzleId;
                }

                // Goals achieved/beaten
                let newGoalsAchieved = prevGoalsAchieved;
                let newGoalAchievedDate = prevGoalAchievedDate;
                if (moves <= botMoves && prevGoalAchievedDate !== puzzleId) {
                    newGoalsAchieved = prevGoalsAchieved + 1;
                    newGoalAchievedDate = puzzleId;
                }
                let newGoalsBeaten = prevGoalsBeaten;
                let newGoalBeatenDate = prevGoalBeatenDate;
                if (moves < botMoves && prevGoalBeatenDate !== puzzleId) {
                    newGoalsBeaten = prevGoalsBeaten + 1;
                    newGoalBeatenDate = puzzleId;
                }

                // Tie/beat streak (based on moves <= botMoves)
                let newTieCurrent = prevTieCurrent;
                let newTieLongest = prevTieLongest;
                let newLastTieDate = prevLastTieDate;
                if (moves <= botMoves) {
                    if (!prevLastTieDate) {
                        newTieCurrent = 1;
                    } else if (isDayAfter(prevLastTieDate, puzzleId)) {
                        newTieCurrent = prevTieCurrent + 1;
                    } else {
                        newTieCurrent = 1;
                    }
                    newTieLongest = Math.max(newTieCurrent, prevTieLongest);
                    newLastTieDate = puzzleId;
                }

                diffUpdate = {
                    currentFirstTryStreak: newFirstTryCurrent,
                    longestFirstTryStreak: newFirstTryLongest,
                    lastFirstTryDate: newLastFirstTryDate ?? null,
                    goalsAchieved: newGoalsAchieved,
                    goalAchievedDate: newGoalAchievedDate ?? null,
                    goalsBeaten: newGoalsBeaten,
                    goalBeatenDate: newGoalBeatenDate ?? null,
                    currentTieBotStreak: newTieCurrent,
                    longestTieBotStreak: newTieLongest,
                    lastTieBotDate: newLastTieDate ?? null,
                };

                // --- Level-agnostic Elo maintenance ---
                try {
                    const existingEloMap = (la && typeof la.eloScoreByDay === 'object') ? { ...(la.eloScoreByDay as Record<string, number>) } : {} as Record<string, number>;
                    const prevDayElo = typeof existingEloMap[puzzleId] === 'number' ? existingEloMap[puzzleId] : undefined;
                    if (prevDayElo === undefined || elo > prevDayElo) {
                        existingEloMap[puzzleId] = elo;
                        // Recompute aggregates
                        let eloAllTime = 0;
                        let eloLast30 = 0;
                        let eloLast7 = 0;
                        const now = new Date();
                        const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
                        const start30 = new Date(todayUTC); start30.setUTCDate(start30.getUTCDate() - 29);
                        const start7 = new Date(todayUTC); start7.setUTCDate(start7.getUTCDate() - 6);

                        for (const [dayStr, val] of Object.entries(existingEloMap)) {
                            if (typeof val !== 'number' || isNaN(val)) continue;
                            eloAllTime += val;
                            // Parse YYYY-MM-DD
                            try {
                                const parts = dayStr.split('-');
                                if (parts.length === 3) {
                                    const dUTC = Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                                    const d = new Date(dUTC);
                                    if (!isNaN(d.getTime())) {
                                        if (d >= start30) eloLast30 += val;
                                        if (d >= start7) eloLast7 += val;
                                    }
                                }
                            } catch {}
                        }

                        eloAggregateUpdate = {
                            eloScoreByDay: existingEloMap,
                            eloScoreAllTime: eloAllTime,
                            eloScoreLast30: eloLast30,
                            eloScoreLast7: eloLast7,
                        };
                    }
                } catch (e) {
                    logger.warn('Failed to recompute elo aggregates for user leaderboard', e);
                }
            }

            // Perform writes after all reads (always write to persist totalAttempts)
            tx.set(puzzleRef, puzzleData, { merge: true });

            const laBaseUpdate: any = {
                moves: prevMoves + moves,
                puzzleAttempts: prevAttempts + 1,
            };
            if (isWin) {
                const shouldIncrementSolved = prevLastCompletedDate !== puzzleId;
                const newSolved = shouldIncrementSolved ? prevSolved + 1 : prevSolved;
                tx.set(levelAgnosticRef, {
                    ...laBaseUpdate,
                    puzzleSolved: newSolved,
                    currentPuzzleCompletedStreak: currentStreak,
                    longestPuzzleCompletedStreak: longestStreak,
                    lastPuzzleCompletedDate: puzzleId,
                    ...(eloAggregateUpdate || {}),
                }, { merge: true });
            } else {
                // Loss: only update moves and attempts
                tx.set(levelAgnosticRef, laBaseUpdate, { merge: true });
            }

            // Only write difficulty doc on wins
            if (isWin) {
                tx.set(difficultyRef, diffUpdate, { merge: true });
            }
        });

        
        // Write to V2 daily scores for any queued writes and recompute stats for affected difficulties
        try {
            if (v2Writes.length > 0) {
                const uniq = Array.from(new Map(v2Writes.map(w => [w.diffKey, w])).values());
                for (const w of uniq) {
                    await writeDailyScoreV2(puzzleId, w.diffKey, userId, w.moves);
                    await updateDailyScoresV2Stats(puzzleId, w.diffKey);
                }
            }
        } catch (e) {
            logger.warn("Failed to update dailyScoresV2 (write/stats)", { puzzleId, difficulty, userId }, e);
        }

        return { success: true, firstTry, firstToBeatBot, elo };
    }
);

// Helper: Write a user's best per-difficulty score to dailyScoresV2
async function writeDailyScoreV2(puzzleId: string, difficulty: DifficultyLevel, userId: string, moves: number): Promise<void> {
    const diffKey = difficulty; // 'easy' | 'medium' | 'hard'
    const ref = db.collection("dailyScoresV2").doc(puzzleId);
    await ref.set({ [diffKey]: { [userId]: moves } }, { merge: true });
}

// Helper: Update aggregated stats for dailyScoresV2 per puzzle+difficulty
async function updateDailyScoresV2Stats(puzzleId: string, difficulty: DifficultyLevel): Promise<void> {
    const diffKey = difficulty; // 'easy' | 'medium' | 'hard'
    const docRef = db.collection("dailyScoresV2").doc(puzzleId);
    const docSnap = await docRef.get();
    const data = docSnap.exists ? (docSnap.data() as any) : {};
    const diffMap = (data && typeof data[diffKey] === 'object') ? (data[diffKey] as Record<string, any>) : {};

    let lowestScore: number | null = null;
    let totalPlayers = 0;
    let playersWithLowestScore = 0;

    for (const [uid, val] of Object.entries(diffMap)) {
        const moves = typeof val === 'number' ? val : null;
        if (moves === null || isNaN(moves)) continue;
        totalPlayers += 1;
        if (lowestScore === null || moves < lowestScore) {
            lowestScore = moves;
            playersWithLowestScore = 1;
        } else if (lowestScore !== null && moves === lowestScore) {
            playersWithLowestScore += 1;
        }
    }
}

// --- New: Get per-difficulty stats for dailyScoresV2 ---
export const getDailyScoresV2Stats = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        const userId = request.auth?.uid || "guest/unauthenticated";
        const puzzleId = request.data?.puzzleId as string | undefined;
        logger.info(`getDailyScoresV2Stats invoked by: ${userId} for puzzleId: ${puzzleId}`);

        if (!puzzleId) {
            throw new HttpsError("invalid-argument", "puzzleId is required.");
        }

        const diffKeys: DifficultyLevel[] = [
            DifficultyLevel.Easy,
            DifficultyLevel.Medium,
            DifficultyLevel.Hard,
        ];

        try {
            const baseRef = db.collection("dailyScoresV2").doc(puzzleId);
            const baseSnap = await baseRef.get();
            const baseData = baseSnap.exists ? (baseSnap.data() as any) : {};

            const result: Record<string, { lowestScore: number | null; totalPlayers: number; playersWithLowestScore: number; averageScore: number | null }> = {};

            // Compute directly from the main document map (ensures averageScore is included)
            for (const diff of diffKeys) {
                const diffMap = (baseData && typeof baseData[diff] === 'object') ? (baseData[diff] as Record<string, any>) : {};
                let lowestScore: number | null = null;
                let totalPlayers = 0;
                let playersWithLowestScore = 0;
                let sumScores = 0;

                for (const [, val] of Object.entries(diffMap)) {
                    const moves = typeof val === 'number' ? val : null;
                    if (moves === null || isNaN(moves)) continue;
                    totalPlayers += 1;
                    sumScores += moves;
                    if (lowestScore === null || moves < lowestScore) {
                        lowestScore = moves;
                        playersWithLowestScore = 1;
                    } else if (lowestScore !== null && moves === lowestScore) {
                        playersWithLowestScore += 1;
                    }
                }

                const averageScore = totalPlayers > 0 ? (sumScores / totalPlayers) : null;
                result[diff] = { lowestScore, totalPlayers, playersWithLowestScore, averageScore };
            }

            return { success: true, stats: result };
        } catch (e) {
            logger.error('getDailyScoresV2Stats: error computing stats', e);
            throw new HttpsError('internal', 'Failed to fetch dailyScoresV2 stats');
        }
    }
);

// --- New: Get Win Modal Stats ---
interface GetWinModalStatsRequest {
    puzzleId: string;
    difficulty: DifficultyLevel | "easy" | "medium" | "hard";
}

export const getWinModalStats = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;
        const { puzzleId, difficulty } = (request.data || {}) as GetWinModalStatsRequest;
        if (!puzzleId || !difficulty) {
            throw new HttpsError("invalid-argument", "puzzleId and difficulty are required.");
        }

        const normalizedDifficulty = normalizeDifficulty(difficulty);

        try {
            const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
            const puzzleRef = userHistoryRef.collection("puzzles").doc(puzzleId);
            const levelAgnosticRef = userHistoryRef.collection("leaderboard").doc("levelAgnostic");
            const difficultyRef = userHistoryRef.collection("leaderboard").doc(normalizedDifficulty);

            const [puzzleSnap, laSnap, diffSnap] = await Promise.all([
                puzzleRef.get(),
                levelAgnosticRef.get(),
                difficultyRef.get(),
            ]);

            const totalAttempts = puzzleSnap.exists && typeof (puzzleSnap.data() as any)?.totalAttempts === 'number'
                ? (puzzleSnap.data() as any).totalAttempts
                : null;

            const laData = laSnap.exists ? (laSnap.data() as any) : {};
            const dData = diffSnap.exists ? (diffSnap.data() as any) : {};

            const currentPuzzleCompletedStreak = typeof laData.currentPuzzleCompletedStreak === 'number'
                ? laData.currentPuzzleCompletedStreak
                : null;

            const currentTieBotStreak = typeof dData.currentTieBotStreak === 'number'
                ? dData.currentTieBotStreak
                : null;

            const currentFirstTryStreak = typeof dData.currentFirstTryStreak === 'number'
                ? dData.currentFirstTryStreak
                : null;

            return {
                success: true,
                stats: {
                    totalAttempts,
                    currentPuzzleCompletedStreak,
                    currentTieBotStreak,
                    currentFirstTryStreak,
                    difficulty: normalizedDifficulty,
                }
            };
        } catch (e) {
            logger.error('getWinModalStats: failed to build stats', e);
            throw new HttpsError('internal', 'Failed to fetch win modal stats');
        }
    }
);

// --- New: Get Personal Stats for Stats Modal ---
interface GetPersonalStatsRequest {
    puzzleId: string;
    difficulty: DifficultyLevel | "easy" | "medium" | "hard";
}

export const getPersonalStats = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const userId = request.auth.uid;
        const { puzzleId, difficulty } = (request.data || {}) as GetPersonalStatsRequest;

        if (!puzzleId || !difficulty) {
            throw new HttpsError("invalid-argument", "puzzleId and difficulty are required.");
        }

        // If puzzleId and difficulty are provided, return puzzle-specific stats
        const normalizedDifficulty = normalizeDifficulty(difficulty);
        logger.info(`getPersonalStats invoked by: ${userId} for puzzle: ${puzzleId} on difficulty: ${normalizedDifficulty}`);

        try {
            const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
            const puzzleRef = userHistoryRef.collection("puzzles").doc(puzzleId);
            const levelAgnosticRef = userHistoryRef.collection("leaderboard").doc("levelAgnostic");
            const difficultyRef = userHistoryRef.collection("leaderboard").doc(normalizedDifficulty);

            const [puzzleSnap, laSnap, diffSnap] = await Promise.all([
                puzzleRef.get(),
                levelAgnosticRef.get(),
                difficultyRef.get(),
            ]);

            const puzzleData = puzzleSnap.exists ? (puzzleSnap.data() as any) : {};
            const laData = laSnap.exists ? (laSnap.data() as any) : {};
            const dData = diffSnap.exists ? (diffSnap.data() as any) : {};
            
            // Get difficulty-specific data
            const diffData = puzzleData[normalizedDifficulty] || {};

            // Today's Game stats
            const todayStats = {
                bestEloScore: typeof laData.eloScoreByDay?.[puzzleId] === 'number' 
                    ? laData.eloScoreByDay[puzzleId] 
                    : null,
                totalAttempts: typeof puzzleData.totalAttempts === 'number' 
                    ? puzzleData.totalAttempts 
                    : null,
                fewestMoves: typeof diffData.moves === 'number' 
                    ? diffData.moves 
                    : null,
                bestDifficultyEloScore: typeof diffData.eloScore === 'number' 
                    ? diffData.eloScore 
                    : (typeof diffData.elo === 'number' ? diffData.elo : null),
                attemptsToTieGoal: typeof diffData.attemptToTieBot === 'number' 
                    ? diffData.attemptToTieBot 
                    : null,
                attemptsToBeatGoal: typeof diffData.attemptToBeatBot === 'number' 
                    ? diffData.attemptToBeatBot 
                    : null,
            };

            // All-time stats
            const allTimeStats = {
                currentPuzzleStreak: typeof laData.currentPuzzleCompletedStreak === 'number' 
                    ? laData.currentPuzzleCompletedStreak 
                    : null,
                currentGoalStreak: typeof dData.currentTieBotStreak === 'number' 
                    ? dData.currentTieBotStreak 
                    : null,
                currentFirstTryStreak: typeof dData.currentFirstTryStreak === 'number' 
                    ? dData.currentFirstTryStreak 
                    : null,
                gamesPlayed: typeof laData.puzzleAttempts === 'number' 
                    ? laData.puzzleAttempts 
                    : null,
                puzzlesSolved: typeof laData.puzzleSolved === 'number' 
                    ? laData.puzzleSolved 
                    : null,
                totalMoves: typeof laData.moves === 'number' 
                    ? laData.moves 
                    : null,
            };

            return {
                success: true,
                stats: {
                    today: todayStats,
                    allTime: allTimeStats,
                    difficulty: normalizedDifficulty,
                }
            };
        } catch (e) {
            logger.error('getPersonalStats: failed to fetch stats', e);
            throw new HttpsError('internal', 'Failed to fetch personal stats');
        }
    }
);

// --- New: Get Global Leaderboard V2 (userPuzzleHistory-based) ---
interface GetGlobalLeaderboardV2Request {
    category: 'score' | 'goals' | 'streaks';
    subcategory: string; // e.g., 'last7', 'last30', 'allTime', 'beaten', 'matched', 'firstTry', 'goalAchieved', 'puzzleCompleted'
    difficulty?: DifficultyLevel | "easy" | "medium" | "hard";
}

interface LeaderboardEntryV2 {
    userId: string;
    username: string;
    value: number;
    rank: number;
    isCurrent?: boolean; // For streaks, indicates if current equals longest
}

export const getGlobalLeaderboardV2 = onCall(
    {
        memory: "512MiB",
        timeoutSeconds: 120,
        ...getAppCheckConfig(),
    },
    async (request) => {
        const requesterId = request.auth?.uid || "guest/unauthenticated";
        const { category, subcategory, difficulty } = (request.data || {}) as GetGlobalLeaderboardV2Request;
        
        logger.info(`getGlobalLeaderboardV2 invoked by: ${requesterId}, category: ${category}, subcategory: ${subcategory}, difficulty: ${difficulty}`);

        if (!category || !subcategory) {
            throw new HttpsError("invalid-argument", "category and subcategory are required.");
        }

        // Validate category-specific requirements
        if ((category === 'goals' || category === 'streaks') && !difficulty) {
            throw new HttpsError("invalid-argument", "difficulty is required for goals and streaks categories.");
        }

        const normalizedDifficulty = difficulty ? normalizeDifficulty(difficulty) : null;

        try {
            // Determine which field to query based on category and subcategory
            let fieldPath: string;
            let checkCurrent = false;
            let currentFieldPath: string | null = null;

            if (category === 'score') {
                switch (subcategory) {
                    case 'last7':
                        fieldPath = 'eloScoreLast7';
                        break;
                    case 'last30':
                        fieldPath = 'eloScoreLast30';
                        break;
                    case 'allTime':
                        fieldPath = 'eloScoreAllTime';
                        break;
                    default:
                        throw new HttpsError("invalid-argument", `Invalid score subcategory: ${subcategory}`);
                }
            } else if (category === 'goals' && normalizedDifficulty) {
                switch (subcategory) {
                    case 'beaten':
                        fieldPath = 'goalsBeaten';
                        break;
                    case 'matched':
                        fieldPath = 'goalsAchieved';
                        break;
                    default:
                        throw new HttpsError("invalid-argument", `Invalid goals subcategory: ${subcategory}`);
                }
            } else if (category === 'streaks' && normalizedDifficulty) {
                checkCurrent = true;
                switch (subcategory) {
                    case 'firstTry':
                        fieldPath = 'longestFirstTryStreak';
                        currentFieldPath = 'currentFirstTryStreak';
                        break;
                    case 'goalAchieved':
                        fieldPath = 'longestTieBotStreak';
                        currentFieldPath = 'currentTieBotStreak';
                        break;
                    case 'puzzleCompleted':
                        fieldPath = 'longestPuzzleCompletedStreak';
                        currentFieldPath = 'currentPuzzleCompletedStreak';
                        checkCurrent = true;
                        break;
                    default:
                        throw new HttpsError("invalid-argument", `Invalid streaks subcategory: ${subcategory}`);
                }
            } else {
                throw new HttpsError("invalid-argument", "Invalid category or missing difficulty.");
            }

            // Query all documents from the leaderboard collection group
            const allLeaderboardDocs = await db.collectionGroup("leaderboard").get();
            
            // Determine which document ID to filter for
            let targetDocId: string;
            if (category === 'score' || (category === 'streaks' && subcategory === 'puzzleCompleted')) {
                targetDocId = "levelAgnostic";
            } else if (normalizedDifficulty) {
                targetDocId = normalizedDifficulty;
            } else {
                throw new HttpsError("internal", "Failed to determine target document.");
            }

            // Extract userId from collection group doc path
            const getUserIdFromDoc = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                const parent = doc.ref.parent; // leaderboard collection
                const userDoc = parent.parent; // userPuzzleHistory/{uid} document
                return userDoc ? userDoc.id : undefined;
            };

            // Build entries array, filtering by document ID in memory
            const entries: Array<{ userId: string; value: number; currentValue?: number }> = [];
            
            allLeaderboardDocs.forEach(doc => {
                // Filter by document ID
                if (doc.id !== targetDocId) return;
                
                const userId = getUserIdFromDoc(doc);
                if (!userId) return;
                
                const data = doc.data() as any;
                const value = typeof data[fieldPath] === 'number' ? data[fieldPath] : null;
                
                if (value === null || isNaN(value) || value === 0) return;
                
                const entry: { userId: string; value: number; currentValue?: number } = { userId, value };
                
                // If checking current streak, include current value
                if (checkCurrent && currentFieldPath) {
                    const currentValue = typeof data[currentFieldPath] === 'number' ? data[currentFieldPath] : null;
                    if (currentValue !== null) {
                        entry.currentValue = currentValue;
                    }
                }
                
                entries.push(entry);
            });

            // Sort by value descending
            entries.sort((a, b) => b.value - a.value);

            // Get top 10
            const top10 = entries.slice(0, 10);

            // Find requester's entry if not in top 10
            let requesterEntry: LeaderboardEntryV2 | null = null;
            const requesterIndex = entries.findIndex(e => e.userId === requesterId);
            if (requesterIndex >= 10 && requesterId !== "guest/unauthenticated") {
                const entry = entries[requesterIndex];
                requesterEntry = {
                    userId: entry.userId,
                    username: '', // Will be filled below
                    value: entry.value,
                    rank: requesterIndex + 1,
                    isCurrent: checkCurrent && entry.currentValue !== undefined ? entry.currentValue === entry.value : undefined
                };
            }

            // Fetch usernames for top 10 + requester
            const userIdsToFetch = [...top10.map(e => e.userId)];
            if (requesterEntry) {
                userIdsToFetch.push(requesterEntry.userId);
            }

            const userDisplayNames = new Map<string, string>();
            
            try {
                for (let i = 0; i < userIdsToFetch.length; i += 100) {
                    const chunk = userIdsToFetch.slice(i, i + 100);
                    const userRecords = await admin.auth().getUsers(
                        chunk.map(uid => ({ uid }))
                    );
                    
                    userRecords.users.forEach(user => {
                        userDisplayNames.set(
                            user.uid,
                            user.displayName || `User_${user.uid.substring(0, 6)}`
                        );
                    });
                    
                    userRecords.notFound.forEach(userIdentifier => {
                        if ('uid' in userIdentifier) {
                            const uid = userIdentifier.uid;
                            userDisplayNames.set(uid, `User_${uid.substring(0, 6)}`);
                        }
                    });
                }
            } catch (authError) {
                logger.error("getGlobalLeaderboardV2: Error fetching user display names:", authError);
            }

            // Build final leaderboard entries
            const leaderboard: LeaderboardEntryV2[] = top10.map((entry, index) => ({
                userId: entry.userId,
                username: userDisplayNames.get(entry.userId) || `User_${entry.userId.substring(0, 6)}`,
                value: entry.value,
                rank: index + 1,
                isCurrent: checkCurrent && entry.currentValue !== undefined ? entry.currentValue === entry.value : undefined
            }));

            // Update requester entry username if exists
            if (requesterEntry) {
                requesterEntry.username = userDisplayNames.get(requesterEntry.userId) || `User_${requesterEntry.userId.substring(0, 6)}`;
            }

            logger.info(`getGlobalLeaderboardV2: Returning ${leaderboard.length} entries with requester: ${!!requesterEntry}`);

            return {
                success: true,
                leaderboard,
                requesterEntry: requesterEntry || undefined
            };
        } catch (e) {
            logger.error('getGlobalLeaderboardV2: error building leaderboard', e);
            throw new HttpsError('internal', 'Failed to fetch leaderboard');
        }
    }
);

// --- New: Send Daily Puzzle Reminder Notifications ---

/**
 * Scheduled Cloud Function to send daily puzzle reminder notifications
 * Runs every hour at :30 past the hour (e.g., 12:30, 1:30, 2:30, etc.)
 * Sends notifications to users at 8:30 PM in their timezone if they haven't played today's puzzle
 */
export const sendDailyPuzzleReminders = onSchedule(
    {
        schedule: "30 * * * *", // Every hour at :30
        timeZone: "UTC",
        memory: "512MiB",
        timeoutSeconds: 540, // 9 minutes (max for scheduled functions)
    },
    async (event) => {
        logger.info("sendDailyPuzzleReminders: Starting execution");

        let sentCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        let dailyPlayersCount = 0;

        try {
            // Step 1: Calculate today's puzzle ID and count unique players
            const nowUtc = DateTime.utc();
            const todayPuzzleId = nowUtc.toFormat("yyyy-MM-dd");
            const yesterdayPuzzleId = nowUtc.minus({ days: 1 }).toFormat("yyyy-MM-dd");

            logger.info(`sendDailyPuzzleReminders: Today's puzzle ID: ${todayPuzzleId}`);

            // Query all three difficulties to get unique players who played today
            const dailyScoresRef = db.collection("dailyScoresV2").doc(todayPuzzleId);
            const dailyScoresSnap = await dailyScoresRef.get();

            const uniquePlayerIds = new Set<string>();

            if (dailyScoresSnap.exists) {
                const data = dailyScoresSnap.data();

                // Collect user IDs from all difficulties
                for (const difficulty of ["easy", "medium", "hard"]) {
                    const diffData = data?.[difficulty];
                    if (diffData && typeof diffData === "object") {
                        Object.keys(diffData).forEach(userId => uniquePlayerIds.add(userId));
                    }
                }
            }

            dailyPlayersCount = uniquePlayerIds.size;
            logger.info(`sendDailyPuzzleReminders: ${dailyPlayersCount} unique players have played today's puzzle`);

            // Step 2 & 3: Get all users with FCM tokens and timezones, filter for 8:30 PM local time
            // Note: Firestore only allows one inequality filter per query, so we filter for fcmToken
            // and then filter for timezone in code
            const usersSnapshot = await db.collection("users")
                .where("fcmToken", "!=", null)
                .get();

            logger.info(`sendDailyPuzzleReminders: Found ${usersSnapshot.size} users with FCM tokens`);

            // Step 2.5: Deduplicate users by FCM token - prioritize non-anonymous accounts
            // This prevents sending duplicate notifications when a device has both an anonymous and authenticated account
            interface UserInfo {
                userId: string;
                fcmToken: string;
                timezone: string;
                isAnonymous: boolean;
            }

            const tokenToUsersMap = new Map<string, UserInfo[]>();

            // First pass: Group users by FCM token and check if they're anonymous
            for (const userDoc of usersSnapshot.docs) {
                const userId = userDoc.id;
                const userData = userDoc.data();
                const fcmToken = userData.fcmToken;
                const timezone = userData.timezone;

                // Validate required fields
                if (!fcmToken || !timezone) {
                    skippedCount++;
                    continue;
                }

                try {
                    // Check if user is anonymous via Firebase Auth
                    const authUser = await admin.auth().getUser(userId);
                    const isAnonymous = authUser.providerData.length === 0; // Anonymous users have no providers

                    const userInfo: UserInfo = {
                        userId,
                        fcmToken,
                        timezone,
                        isAnonymous
                    };

                    if (!tokenToUsersMap.has(fcmToken)) {
                        tokenToUsersMap.set(fcmToken, []);
                    }
                    tokenToUsersMap.get(fcmToken)!.push(userInfo);
                } catch (authError) {
                    logger.warn(`sendDailyPuzzleReminders: Failed to fetch auth info for user ${userId}:`, authError);
                    skippedCount++;
                }
            }

            // Second pass: Select one user per FCM token (prefer non-anonymous)
            const usersToNotify: UserInfo[] = [];

            for (const [fcmToken, users] of tokenToUsersMap.entries()) {
                // Find non-anonymous user if exists
                const nonAnonymousUser = users.find(u => !u.isAnonymous);
                
                if (nonAnonymousUser) {
                    usersToNotify.push(nonAnonymousUser);
                    if (users.length > 1) {
                        logger.info(`sendDailyPuzzleReminders: Token ${fcmToken.substring(0, 10)}... has ${users.length} accounts, prioritizing non-anonymous user ${nonAnonymousUser.userId}`);
                    }
                } else {
                    // All users are anonymous, pick the first one
                    usersToNotify.push(users[0]);
                }
            }

            logger.info(`sendDailyPuzzleReminders: After deduplication, ${usersToNotify.length} users to potentially notify`);

            const targetHour = 20; // 8 PM
            const targetMinute = 30; // 30 minutes

            // Process each deduplicated user
            for (const userInfo of usersToNotify) {
                const { userId, fcmToken, timezone } = userInfo;

                try {
                    // Calculate user's local time
                    const userLocalTime = nowUtc.setZone(timezone);

                    // Check if it's 8:30 PM in user's timezone
                    if (userLocalTime.hour !== targetHour || userLocalTime.minute !== targetMinute) {
                        continue; // Not the right time for this user
                    }

                    logger.info(`sendDailyPuzzleReminders: User ${userId} is at 8:30 PM in ${timezone}`);

                    // Step 3: Check if user has already played today
                    if (uniquePlayerIds.has(userId)) {
                        logger.info(`sendDailyPuzzleReminders: User ${userId} already played today, skipping`);
                        skippedCount++;
                        continue;
                    }

                    // Step 4: Determine notification message based on streak status
                    const userHistoryRef = db.collection("userPuzzleHistory").doc(userId);
                    const levelAgnosticRef = userHistoryRef.collection("leaderboard").doc("levelAgnostic");
                    const levelAgnosticSnap = await levelAgnosticRef.get();

                    let notificationTitle: string;
                    let notificationBody: string;

                    if (levelAgnosticSnap.exists) {
                        const laData = levelAgnosticSnap.data();
                        const lastCompletedDate = laData?.lastPuzzleCompletedDate;
                        const currentStreak = typeof laData?.currentPuzzleCompletedStreak === "number"
                            ? laData.currentPuzzleCompletedStreak
                            : 0;

                        // Case A: User played yesterday (streak is active)
                        if (lastCompletedDate === yesterdayPuzzleId) {
                            notificationTitle = "Don't lose your streak!";
                            notificationBody = `Don't forget to solve today's ColorLock! You're in danger of losing your ${currentStreak} day streak!`;
                            logger.info(`sendDailyPuzzleReminders: User ${userId} has active ${currentStreak} day streak`);
                        } else {
                            // Case B: User didn't play yesterday (no active streak)
                            notificationTitle = "ColorLock Daily Puzzle";
                            notificationBody = `It looks like you haven't completed today's ColorLock. Join the ${dailyPlayersCount} players who have solved today's puzzle!`;
                            logger.info(`sendDailyPuzzleReminders: User ${userId} has no active streak`);
                        }
                    } else {
                        // No history, treat as Case B
                        notificationTitle = "ColorLock Daily Puzzle";
                        notificationBody = `It looks like you haven't completed today's ColorLock. Join the ${dailyPlayersCount} players who have solved today's puzzle!`;
                        logger.info(`sendDailyPuzzleReminders: User ${userId} has no puzzle history`);
                    }

                    // Step 5: Send FCM notification
                    const message = {
                        token: fcmToken,
                        notification: {
                            title: notificationTitle,
                            body: notificationBody,
                        },
                        data: {
                            screen: "daily_puzzle",
                            puzzleId: todayPuzzleId,
                        },
                        android: {
                            priority: "high" as const,
                        },
                        apns: {
                            headers: {
                                "apns-priority": "10",
                            },
                        },
                    };

                    await admin.messaging().send(message);
                    sentCount++;
                    logger.info(`sendDailyPuzzleReminders: Notification sent successfully to user ${userId}`);

                } catch (userError) {
                    errorCount++;
                    logger.error(`sendDailyPuzzleReminders: Error processing user ${userId}:`, userError);
                    // Continue processing other users
                }
            }

            const summary = {
                sent: sentCount,
                skipped: skippedCount,
                errors: errorCount,
                dailyPlayers: dailyPlayersCount,
            };

            logger.info(`sendDailyPuzzleReminders: Execution complete`, summary);

        } catch (error) {
            logger.error("sendDailyPuzzleReminders: Fatal error during execution:", error);
            logger.error("sendDailyPuzzleReminders: Summary at failure:", {
                sent: sentCount,
                skipped: skippedCount,
                errors: errorCount,
                dailyPlayers: dailyPlayersCount,
            });
        }
    }
);
