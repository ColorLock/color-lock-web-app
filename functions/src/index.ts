import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger as v2Logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { calculateEloScore, calculateAggregateEloStats  } from "./eloUtils";
import { LeaderboardEntry, GameStatistics, defaultStats } from "../../src/types/stats";
import { DifficultyLevel } from "../../src/types/settings";

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


// --- NEW: Get Global Leaderboard Function --- 
export const getGlobalLeaderboard = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(), // Use the utility function for App Check enforcement
    },
    async (request) => {
        logger.info("--- Execution started for getGlobalLeaderboard ---");
        logger.info("[getGlobalLeaderboard] Request Auth:", request.auth ? { uid: request.auth.uid, token: request.auth.token } : null);
        logger.info("[getGlobalLeaderboard] Request App Check:", request.app ? { appId: request.app.appId } : null);
        
        const requesterId = request.auth?.uid || "guest/unauthenticated";
        const isAppCheckVerified = !!request.app;
        logger.info(`v2/getGlobalLeaderboard invoked by: ${requesterId}, App Check verified: ${isAppCheckVerified}`);

        // App Check verification is handled by getAppCheckConfig

        try {
            logger.info("[getGlobalLeaderboard] Attempting to fetch userStats collection");
            const snapshot = await db.collection("userStats").get();
            logger.info(`[getGlobalLeaderboard] Retrieved ${snapshot.size} documents from userStats collection`);
            
            const leaderboard: LeaderboardEntry[] = [];

            snapshot.forEach(doc => {
                const userId = doc.id;
                // Read data directly from the root
                const stats = doc.data() as GameStatistics | undefined;

                if (stats) {
                    // TODO: Fetch real username if available
                    const username = `User_${userId.substring(0, 6)}`;

                    // Cast stats to a type that includes the new fields
                    const typedStats = stats as GameStatistics; // Use the updated type

                    leaderboard.push({
                        userId: userId,
                        username: username,
                        totalWins: typedStats.totalWins || 0,
                        totalMovesUsed: typedStats.totalMovesUsed || 0,
                        // Read new, fallback to old, then default to 0
                        longestTieBotStreak: typedStats.longestTieBotStreak ?? 0,
                        currentTieBotStreak: typedStats.currentTieBotStreak ?? 0,
                        tieBotStreakDate: typedStats.tieBotStreakDate ?? null,
                        // Read the separated puzzle completed streak fields
                        longestPuzzleCompletedStreak: typedStats.longestPuzzleCompletedStreak ?? 0,
                        currentPuzzleCompletedStreak: typedStats.currentPuzzleCompletedStreak ?? 0,
                        puzzleCompletedStreakDate: typedStats.puzzleCompletedStreakDate ?? null, // Add this
                        currentFirstTryStreak: typedStats.currentFirstTryStreak || 0,
                        longestFirstTryStreak: typedStats.longestFirstTryStreak || 0,
                        // Use the aggregate fields stored at the root
                        eloScoreAvg: typedStats.eloScoreAvg !== undefined ? typedStats.eloScoreAvg : null,
                        eloScoreTotal: typedStats.eloScoreTotal !== undefined ? typedStats.eloScoreTotal : null,
                        eloScoreAvgLast30: typedStats.eloScoreAvgLast30 !== undefined ? typedStats.eloScoreAvgLast30 : null,
                        eloScoreTotalLast30: typedStats.eloScoreTotalLast30 !== undefined ? typedStats.eloScoreTotalLast30 : null,
                    });
                } else {
                    logger.warn(`Missing stats data for user ID: ${userId} during leaderboard fetch.`);
                }
            });
            logger.info(`Fetched ${leaderboard.length} entries for global leaderboard.`);
            logger.info("[getGlobalLeaderboard] Returning successful response");
            return { success: true, leaderboard: leaderboard };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`[getGlobalLeaderboard] Error fetching global leaderboard:`, errorMessage, error);
            throw new HttpsError("internal", "An internal error occurred while fetching the leaderboard.");
        }
    }
);


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

// --- Interfaces for Stats ---
// (Keep these as they are)
interface UserStatsUpdateRequest {
  eventType: string;
  puzzleId?: string;
  userScore?: number;
  algoScore?: number;
  movesUsedInGame?: number;
  hintsUsedInGame?: number;
  isFirstTryOfDay?: boolean;
  attemptNumberToday?: number;
}

interface DailyScoresStatsRequest {
  puzzleId: string;
}

interface UpdateUserStatsPayload {
  eventType: "firstMove" | "hint" | "win" | "loss" | "tryAgain" | "reconcileAbandonedMoves";
  puzzleId: string; // YYYY-MM-DD date string
  userScore?: number;
  algoScore?: number;
  movesUsedInGame?: number;
  hintsUsedInGame?: number;
  isFirstTryOfDay?: boolean;
  attemptNumberToday?: number;
  movesToAdd?: number;
  difficultyLevel?: DifficultyLevel;
}

interface UserStatsSuccessResult {
  success: true;
  updatedStats: Record<string, unknown>;
}

interface UserStatsErrorResult {
  success: false;
  error: string;
}

type UserStatsResult = UserStatsSuccessResult | UserStatsErrorResult;

// --- updateDailyScore function (Updated to track firstToBeatBot) ---
async function updateDailyScore(userId: string, puzzleId: string, score: number, difficultyLevel?: DifficultyLevel): Promise<admin.firestore.DocumentData | null> {
    const scoreDocRef = db.collection("dailyScores").doc(puzzleId).collection("scores").doc(userId);
    try {
        // First, get the algoScore from the puzzle document
        const puzzleRef = db.collection("puzzles").doc(puzzleId);
        const puzzleSnap = await puzzleRef.get();
        
        if (!puzzleSnap.exists) {
            logger.error(`Puzzle ${puzzleId} not found when updating daily score`);
            throw new Error(`Puzzle ${puzzleId} not found`);
        }
        
        const puzzleData = puzzleSnap.data();
        const algoScore = puzzleData?.algoScore;
        
        if (typeof algoScore !== "number") {
            logger.error(`Invalid algoScore for puzzle ${puzzleId}`);
            throw new Error(`Invalid algoScore for puzzle ${puzzleId}`);
        }
        
        // Get all current scores to determine if this is the lowest
        const scoresRef = db.collection("dailyScores").doc(puzzleId).collection("scores");
        const scoresSnapshot = await scoresRef.get();
        
        let currentLowestScore: number | null = null;
        
        if (!scoresSnapshot.empty) {
            const allScores: number[] = [];
            scoresSnapshot.forEach((doc) => {
                // Skip the current user's document since we're updating it
                if (doc.id !== userId) {
                    const scoreData = doc.data();
                    if (scoreData && typeof scoreData.score === "number" && !isNaN(scoreData.score)) {
                        allScores.push(scoreData.score);
                    }
                }
            });
            
            if (allScores.length > 0) {
                currentLowestScore = Math.min(...allScores);
            }
        }
        
        // Determine if this score beats both the current lowest and the algorithm
        // AND the user is playing on Hard difficulty
        const isFirstToBeatBot = 
            score < algoScore && 
            (currentLowestScore === null || score < currentLowestScore) &&
            difficultyLevel === DifficultyLevel.Hard;
        
        if (score < algoScore && (currentLowestScore === null || score < currentLowestScore)) {
            if (difficultyLevel === DifficultyLevel.Hard) {
                logger.info(`User ${userId} qualifies for first-to-beat-bot on Hard difficulty with score ${score}`);
            } else {
                logger.info(`User ${userId} beat the bot first but not on Hard difficulty (${difficultyLevel}). Not setting firstToBeatBot flag.`);
            }
        }
        
        let updatedDocData: admin.firestore.DocumentData | null = null;
        
        await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(scoreDocRef);
            if (!snapshot.exists) {
                // Create new score document with firstToBeatBot flag if applicable
                const newData = {
                    score,
                    difficultyLevel, // Store difficulty level in the document
                    ...(isFirstToBeatBot && { firstToBeatBot: true })
                };
                transaction.set(scoreDocRef, newData);
                updatedDocData = newData;
                logger.info(`Created new score document for user ${userId} with score ${score}${isFirstToBeatBot ? ' (first to beat bot)' : ''}`);
            } else {
                const currentScore = snapshot.data()?.score;
                if (typeof currentScore !== "number" || score < currentScore) {
                    // Update score and set firstToBeatBot flag if applicable
                    const updateData = {
                        score,
                        difficultyLevel, // Store difficulty level in the document
                        ...(isFirstToBeatBot && { firstToBeatBot: true })
                    };
                    transaction.update(scoreDocRef, updateData);
                    updatedDocData = { ...snapshot.data(), ...updateData };
                    logger.info(`Updated score for user ${userId} from ${currentScore} to ${score}${isFirstToBeatBot ? ' (first to beat bot)' : ''}`);
                } else {
                    updatedDocData = snapshot.data() || null;
                    logger.info(`Kept existing better score ${currentScore} for user ${userId} (new score: ${score})`);
                }
            }
        });
        
        logger.info(`Successfully updated daily score for user ${userId}`);
        return updatedDocData;
    } catch (error) {
        logger.error("Error updating daily score:", error);
        throw error; // Re-throw to be caught by the main function handler
    }
}
// --- End updateDailyScore ---

// --- processUserStatsUpdate function (Refactored Streak Logic) ---
async function processUserStatsUpdate(userId: string, data: UpdateUserStatsPayload): Promise<UserStatsResult> {
    const {eventType, puzzleId} = data;

    logger.info(`[DATA] Processing stats update for user ${userId} with data:`, JSON.stringify(data));

    if (!["firstMove", "hint", "win", "loss", "tryAgain", "reconcileAbandonedMoves"].includes(eventType)) {
        logger.error(`Invalid eventType: ${eventType}`);
        throw new HttpsError("invalid-argument", "Invalid eventType.");
    }
    if (!puzzleId) {
        logger.error("Missing puzzleId in payload");
        throw new HttpsError("invalid-argument", "puzzleId is required.");
    }

    logger.info(`Processing ${eventType} event for user ${userId} on puzzle ${puzzleId}`);
    const userStatsRef = db.collection("userStats").doc(userId);

    try {
        const result = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(userStatsRef);
            logger.info(`[DATA] Retrieved document exists: ${doc.exists}, ID: ${doc.id}`);

            // Use defaultStats for initialization
            const stats = doc.exists ? (doc.data() as GameStatistics) : {} as Partial<GameStatistics>;
            const typedStats: GameStatistics = {
                ...defaultStats,
                ...stats,
                bestScoresByDayDifficulty: stats.bestScoresByDayDifficulty || {}
            };

            logger.info(`[DATA] Initial stats state (merged): ${JSON.stringify({
                lastPlayedIsoDate: typedStats.lastPlayedIsoDate,
                totalWins: typedStats.totalWins,
                totalGamesPlayed: typedStats.totalGamesPlayed,
                totalMovesUsed: typedStats.totalMovesUsed,
                totalHintsUsed: typedStats.totalHintsUsed,
                currentTieBotStreak: typedStats.currentTieBotStreak,
                longestTieBotStreak: typedStats.longestTieBotStreak,
                currentPuzzleCompletedStreak: typedStats.currentPuzzleCompletedStreak,
                longestPuzzleCompletedStreak: typedStats.longestPuzzleCompletedStreak,
                currentFirstTryStreak: typedStats.currentFirstTryStreak,
                longestFirstTryStreak: typedStats.longestFirstTryStreak,
                tieBotStreakDate: typedStats.tieBotStreakDate,
                puzzleCompletedStreakDate: typedStats.puzzleCompletedStreakDate,
                bestScoresByDayDifficulty: typedStats.bestScoresByDayDifficulty
            })}`);


            // --- Event Processing Logic ---
            const today = new Date(puzzleId); // Use today's date from puzzleId
            const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split("T")[0];

            if (eventType === "firstMove") {
                logger.info(`[DATA] firstMove - Before update: attempts=${typedStats.attemptsPerDay[puzzleId] || 0}, totalGamesPlayed=${typedStats.totalGamesPlayed || 0}`);
                typedStats.attemptsPerDay[puzzleId] = (typedStats.attemptsPerDay[puzzleId] || 0) + 1;
                if (!typedStats.playedDays.includes(puzzleId)) {
                    typedStats.playedDays.push(puzzleId); // Use push for arrays
                    // Only increment totalGamesPlayed on the very first attempt of the first time playing this day
                    if (typedStats.attemptsPerDay[puzzleId] === 1) {
                         typedStats.totalGamesPlayed = (typedStats.totalGamesPlayed || 0) + 1;
                    }
                }
                 // Initialize hint fields if they don't exist for the day
                 if (typedStats.hintUsageByDay[puzzleId] === undefined) {
                     typedStats.hintUsageByDay[puzzleId] = 0;
                 }
                 if (typedStats.attemptWhenHintUsed[puzzleId] === undefined) {
                     typedStats.attemptWhenHintUsed[puzzleId] = null;
                 }

                 // --- Check for broken win streak on first move of a new day ---
                 if (typedStats.puzzleCompletedStreakDate) {
                    try {
                        const lastWinDate = new Date(typedStats.puzzleCompletedStreakDate);
                        const todayDate = new Date(puzzleId);
                         // Calculate days difference (using UTC to avoid timezone issues)
                        const utcLastWin = Date.UTC(lastWinDate.getUTCFullYear(), lastWinDate.getUTCMonth(), lastWinDate.getUTCDate());
                        const utcToday = Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate());
                        const diffTime = utcToday - utcLastWin;
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays > 1) {
                            logger.info(`[DATA] Win streak broken due to skipped day(s). Last win: ${typedStats.puzzleCompletedStreakDate}, Today: ${puzzleId}, Diff: ${diffDays} days.`);
                            typedStats.currentPuzzleCompletedStreak = 0;
                            typedStats.puzzleCompletedStreakDate = null; // Reset date as streak is broken
                        }
                    } catch (dateError) {
                         logger.error(`[DATA] Error checking skipped days for win streak:`, dateError);
                         // Optionally reset streak as a safety measure if date parsing fails
                         // typedStats.currentPuzzleCompletedStreak = 0;
                         // typedStats.puzzleCompletedStreakDate = null;
                    }
                 }
                 // --- End check for broken win streak ---

                logger.info(`[DATA] firstMove - After update: attempts=${typedStats.attemptsPerDay[puzzleId]}, totalGamesPlayed=${typedStats.totalGamesPlayed}, playedDays.length=${typedStats.playedDays.length}`);

            } else if (eventType === "hint") {
                 logger.info(`[DATA] hint - Before update: totalHintsUsed=${typedStats.totalHintsUsed || 0}, hintUsageByDay[${puzzleId}]=${typedStats.hintUsageByDay[puzzleId] || 0}`);
                 const hintsToAdd = data.hintsUsedInGame || 1;
                 typedStats.totalHintsUsed = (typedStats.totalHintsUsed || 0) + hintsToAdd;
                 typedStats.hintUsageByDay[puzzleId] = (typedStats.hintUsageByDay[puzzleId] || 0) + hintsToAdd;
                 // Record attempt number when first hint is used
                 if (typedStats.attemptWhenHintUsed[puzzleId] === null) {
                     const attemptNumber = data.attemptNumberToday;
                     if (attemptNumber !== undefined && attemptNumber >= 1) {
                         typedStats.attemptWhenHintUsed[puzzleId] = attemptNumber;
                         logger.info(`Recorded first hint used on attempt ${attemptNumber} for puzzle ${puzzleId}`);
                     } else {
                         logger.warn(`Hint event received for ${puzzleId} without valid attemptNumberToday. Cannot record attemptWhenHintUsed.`);
                     }
                 }
                 logger.info(`[DATA] hint - After update: totalHintsUsed=${typedStats.totalHintsUsed}, hintUsageByDay[${puzzleId}]=${typedStats.hintUsageByDay[puzzleId]}, attemptWhenHintUsed[${puzzleId}]=${typedStats.attemptWhenHintUsed[puzzleId]}`);

            } else if (eventType === "win") {
                const {userScore, algoScore, movesUsedInGame, isFirstTryOfDay, attemptNumberToday, difficultyLevel} = data;
                if (userScore === undefined || algoScore === undefined || movesUsedInGame === undefined || isFirstTryOfDay === undefined || attemptNumberToday === undefined) {
                    throw new HttpsError("invalid-argument", "Missing required win event data (userScore, algoScore, movesUsedInGame, isFirstTryOfDay, attemptNumberToday).");
                }

                logger.info(`[DATA] win - Before update: totalWins=${typedStats.totalWins || 0}, totalMovesUsed=${typedStats.totalMovesUsed || 0}, winsPerDay[${puzzleId}]=${typedStats.winsPerDay[puzzleId] || 0}, currentTieBotStreak=${typedStats.currentTieBotStreak || 0}, currentPuzzleCompletedStreak=${typedStats.currentPuzzleCompletedStreak || 0}, currentFirstTryStreak=${typedStats.currentFirstTryStreak || 0}`);

                typedStats.totalWins = (typedStats.totalWins || 0) + 1;
                typedStats.totalMovesUsed = (typedStats.totalMovesUsed || 0) + movesUsedInGame;
                typedStats.winsPerDay[puzzleId] = (typedStats.winsPerDay[puzzleId] || 0) + 1;

                // --- Record attempt to win ---
                // Only record the *first* successful win attempt for the day
                if (typedStats.attemptsToWinByDay[puzzleId] === undefined) {
                    typedStats.attemptsToWinByDay[puzzleId] = attemptNumberToday;
                    logger.info(`Recorded first win on attempt ${attemptNumberToday} for puzzle ${puzzleId}`);
                }
                // --- End record attempt to win ---

                const goalMet = userScore <= algoScore;
                const goalBeaten = userScore < algoScore;
                const firstTimeMeetingGoal = !typedStats.goalAchievedDays.includes(puzzleId);
                const firstTimeBeatingGoal = !typedStats.goalBeatenDays.includes(puzzleId);

                logger.info(`[DATA] win - Goal metrics: goalMet=${goalMet}, goalBeaten=${goalBeaten}, firstTimeMeetingGoal=${firstTimeMeetingGoal}, firstTimeBeatingGoal=${firstTimeBeatingGoal}, userScore=${userScore}, algoScore=${algoScore}`);

                // --- Refined Tie/Beat Bot Streak Logic ---
                if (goalMet) {
                    if (firstTimeMeetingGoal) {
                        typedStats.goalAchievedDays.push(puzzleId); // Use push
                    }
                    // Ensure today's attempt is recorded before checking streaks
                    typedStats.attemptsToAchieveBotScore[puzzleId] = typedStats.attemptsPerDay[puzzleId] || 1;

                    const yesterdayGoalMet = typedStats.attemptsToAchieveBotScore?.[yesterdayStr] !== undefined;
                    logger.info(`[DATA] win (Tie/Beat Streak) - Check: yesterday=${yesterdayStr}, yesterdayGoalMet=${yesterdayGoalMet}, currentTieBotStreakDate=${typedStats.tieBotStreakDate}`);

                    if (yesterdayGoalMet) {
                        // Streak continued or started yesterday
                        typedStats.currentTieBotStreak = (typedStats.currentTieBotStreak || 0) + 1; // Simple increment if yesterday was met
                        logger.info(`[DATA] win (Tie/Beat Streak) - Continued streak. New length: ${typedStats.currentTieBotStreak}`);
                    } else {
                        // Streak broken or first day meeting goal
                        logger.info(`[DATA] win (Tie/Beat Streak) - Streak broken or started today (${puzzleId}). Setting streak to 1.`);
                        typedStats.currentTieBotStreak = 1;
                    }
                     // Always update the date on a goal met day
                    typedStats.tieBotStreakDate = puzzleId;
                } else {
                    // Goal not met today, break the streak
                    logger.info(`[DATA] win (Tie/Beat Streak) - Goal not met today (${puzzleId}). Resetting streak.`);
                    typedStats.currentTieBotStreak = 0;
                    typedStats.tieBotStreakDate = null;
                }
                // Update longest streak
                const previousLongestTie = typedStats.longestTieBotStreak ?? 0;
                typedStats.longestTieBotStreak = Math.max(previousLongestTie, typedStats.currentTieBotStreak);
                if (typedStats.longestTieBotStreak > previousLongestTie) {
                    logger.info(`[DATA] win (Tie/Beat Streak) - New longest: ${typedStats.longestTieBotStreak} (was ${previousLongestTie})`);
                }
                // --- End Refined Tie/Beat Bot Streak Logic ---

                // --- NEW: Separated Win Streak Logic ---
                // Check if yesterday was won (based on attemptsToWinByDay)
                const yesterdayWon = typedStats.attemptsToWinByDay?.[yesterdayStr] !== undefined && typedStats.attemptsToWinByDay?.[yesterdayStr] >= 1;
                logger.info(`[DATA] win (Win Streak) - Check: yesterday=${yesterdayStr}, yesterdayWon=${yesterdayWon}, currentPuzzleCompletedStreakDate=${typedStats.puzzleCompletedStreakDate}`);

                // Check for skipped days *before* incrementing
                let streakBrokenBySkip = false;
                if (typedStats.puzzleCompletedStreakDate) {
                    try {
                        const lastWinDate = new Date(typedStats.puzzleCompletedStreakDate);
                        const todayDate = new Date(puzzleId);
                        const utcLastWin = Date.UTC(lastWinDate.getUTCFullYear(), lastWinDate.getUTCMonth(), lastWinDate.getUTCDate());
                        const utcToday = Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate());
                        const diffTime = utcToday - utcLastWin;
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                        if (diffDays > 1) {
                            logger.info(`[DATA] win (Win Streak) - Streak broken due to skipped day(s). Last win: ${typedStats.puzzleCompletedStreakDate}, Today: ${puzzleId}, Diff: ${diffDays} days.`);
                            typedStats.currentPuzzleCompletedStreak = 0; // Reset before potentially starting new one
                            streakBrokenBySkip = true;
                        }
                    } catch (dateError) {
                        logger.error(`[DATA] win (Win Streak) - Error checking skipped days:`, dateError);
                    }
                }

                if (yesterdayWon && !streakBrokenBySkip) {
                    // Streak continued or started yesterday
                    typedStats.currentPuzzleCompletedStreak = (typedStats.currentPuzzleCompletedStreak || 0) + 1;
                    logger.info(`[DATA] win (Win Streak) - Continued streak. New length: ${typedStats.currentPuzzleCompletedStreak}`);
                } else {
                    // Streak broken or first day winning
                    logger.info(`[DATA] win (Win Streak) - Streak broken or started today (${puzzleId}). Setting streak to 1.`);
                    typedStats.currentPuzzleCompletedStreak = 1;
                }
                // Always update the date on a win day
                typedStats.puzzleCompletedStreakDate = puzzleId;

                // Update longest streak
                const previousLongestWin = typedStats.longestPuzzleCompletedStreak || 0;
                typedStats.longestPuzzleCompletedStreak = Math.max(previousLongestWin, typedStats.currentPuzzleCompletedStreak);
                if (typedStats.longestPuzzleCompletedStreak > previousLongestWin) {
                    logger.info(`[DATA] win (Win Streak) - New longest: ${typedStats.longestPuzzleCompletedStreak} (was ${previousLongestWin})`);
                }
                // --- End Separated Win Streak Logic ---

                // --- First Try Streak Logic (Unchanged - Based on isFirstTryOfDay) ---
                if (isFirstTryOfDay) {
                    logger.info(`[DATA] win (First Try Streak) - Check: firstTryStreakDate=${typedStats.firstTryStreakDate}, yesterdayStr=${yesterdayStr}`);
                    if (typedStats.firstTryStreakDate === yesterdayStr) {
                        typedStats.currentFirstTryStreak = (typedStats.currentFirstTryStreak || 0) + 1;
                        logger.info(`[DATA] win (First Try Streak) - Incremented to ${typedStats.currentFirstTryStreak}`);
                    } else if (typedStats.firstTryStreakDate !== puzzleId) {
                        typedStats.currentFirstTryStreak = 1;
                        logger.info(`[DATA] win (First Try Streak) - Started/Reset to 1`);
                    }
                    typedStats.firstTryStreakDate = puzzleId; // Always update date on first try win
                    const previousLongestFirstTry = typedStats.longestFirstTryStreak || 0;
                    typedStats.longestFirstTryStreak = Math.max(previousLongestFirstTry, typedStats.currentFirstTryStreak);
                     if (typedStats.longestFirstTryStreak > previousLongestFirstTry) {
                        logger.info(`[DATA] win (First Try Streak) - New longest: ${typedStats.longestFirstTryStreak} (was ${previousLongestFirstTry})`);
                    }
                } else {
                     logger.info(`[DATA] win (First Try Streak) - Not first try of day (${puzzleId}). Resetting current streak.`);
                     typedStats.currentFirstTryStreak = 0;
                }
                // --- End First Try Streak Logic ---


                // --- Calculate and store Elo score when new best score is achieved ---
                if (!typedStats.eloScoreByDay) {
                    typedStats.eloScoreByDay = {};
                }
                // --- Update Best Score & Attempts (Modified attemptsToBeatBotScore) ---
                const daysBestEloScore = typedStats.eloScoreByDay[puzzleId];
                
                // Get the daily score document and check first-to-beat-bot status
                const dailyScoreData = await updateDailyScore(userId, puzzleId, userScore, difficultyLevel);
                
                // Check if user is first to beat bot from the returned document
                const isFirstToBeatBot = dailyScoreData?.firstToBeatBot === true;
                if (isFirstToBeatBot) {
                    logger.info(`[DATA] win - User ${userId} is the first to beat bot for ${puzzleId} on Hard difficulty. Will add bonus to Elo score.`);
                }
                
                // Calculate Elo score with new best score and first-to-beat-bot status
                const puzzleData = { algoScore };
                const gameEloScore = calculateEloScore(typedStats, puzzleData, puzzleId, userScore, isFirstToBeatBot, difficultyLevel);
                
                if (daysBestEloScore === undefined || daysBestEloScore < gameEloScore) {
                    typedStats.eloScoreByDay[puzzleId] = gameEloScore;
                    logger.info(`[DATA] win - Calculated and stored Elo score ${gameEloScore} for ${puzzleId} with new best score ${userScore}${isFirstToBeatBot ? ' (including first-to-beat-bot bonus)' : ''}`);
                    const oldBestScore = typedStats.bestScoresByDay[puzzleId];
                    typedStats.bestScoresByDay[puzzleId] = userScore;

                    // *** UPDATED: Store difficulty level alongside best score ***
                    if (difficultyLevel) {
                        // Ensure the map exists before trying to assign to it
                        if (!typedStats.bestScoresByDayDifficulty) {
                            typedStats.bestScoresByDayDifficulty = {};
                        }
                        typedStats.bestScoresByDayDifficulty[puzzleId] = difficultyLevel;
                        logger.info(`[DATA] win - New best score for ${puzzleId}: ${userScore} on ${difficultyLevel} difficulty (was ${oldBestScore || 'undefined'})`);
                    } else {
                        // Log a warning if difficulty level is missing, but still update the score
                        logger.warn(`[DATA] win - Difficulty level missing in payload for puzzle ${puzzleId} when updating best score. Score updated, but difficulty not recorded.`);
                        // Optionally, remove the old difficulty if it existed and the map exists
                        if (typedStats.bestScoresByDayDifficulty && typedStats.bestScoresByDayDifficulty[puzzleId] !== undefined) {
                            delete typedStats.bestScoresByDayDifficulty[puzzleId];
                         }
                        logger.info(`[DATA] win - New best score for ${puzzleId}: ${userScore} (difficulty not provided) (was ${oldBestScore || 'undefined'})`);
                    }
                    // *** END UPDATE ***
                    
                    // --- Calculate Elo aggregates for the current user ---
                    // Use the standardized Elo stats calculation function from leaderboardUtils
                    const eloStats = calculateAggregateEloStats(typedStats.eloScoreByDay);
                    
                    // Store the calculated aggregates directly on the user stats
                    typedStats.eloScoreAvg = eloStats.eloScoreAvg;
                    typedStats.eloScoreTotal = eloStats.eloScoreTotal;
                    typedStats.eloScoreAvgLast30 = eloStats.eloScoreAvgLast30;
                    typedStats.eloScoreTotalLast30 = eloStats.eloScoreTotalLast30;
                    
                    logger.info(`[DATA] win - Updated Elo aggregates: avg=${typedStats.eloScoreAvg}, total=${typedStats.eloScoreTotal}, avgLast30=${typedStats.eloScoreAvgLast30}, totalLast30=${typedStats.eloScoreTotalLast30}`);
                    // --- End Calculate Elo aggregates ---
                }

                if (goalBeaten) {
                    if (firstTimeBeatingGoal) {
                        typedStats.goalBeatenDays.push(puzzleId); // Use push
                        logger.info(`[DATA] win - First time beating goal for ${puzzleId}`);
                    }
                    // Mimic attemptsToAchieveBotScore: Set the attempt number directly when goal is beaten
                    const oldAttemptsToBeat = typedStats.attemptsToBeatBotScore[puzzleId];
                    typedStats.attemptsToBeatBotScore[puzzleId] = typedStats.attemptsPerDay[puzzleId] || 1; // Direct assignment
                    logger.info(`[DATA] win - Updated attemptsToBeatBotScore for ${puzzleId} to attempt: ${typedStats.attemptsToBeatBotScore[puzzleId]} (was ${oldAttemptsToBeat || 'undefined'})`);
                }
                // --- End Update Best Score & Attempts ---

                logger.info(`[DATA] win - After update: totalWins=${typedStats.totalWins}, totalMovesUsed=${typedStats.totalMovesUsed}, winsPerDay[${puzzleId}]=${typedStats.winsPerDay[puzzleId]}, currentTieBotStreak=${typedStats.currentTieBotStreak || 0}, currentPuzzleCompletedStreak=${typedStats.currentPuzzleCompletedStreak || 0}, currentFirstTryStreak=${typedStats.currentFirstTryStreak || 0}`);

            } else if (eventType === "loss") {
                 logger.info(`[DATA] ${eventType} - Before update: currentTieBotStreak=${typedStats.currentTieBotStreak || 0}, currentPuzzleCompletedStreak=${typedStats.currentPuzzleCompletedStreak || 0}, currentFirstTryStreak=${typedStats.currentFirstTryStreak || 0}, totalMovesUsed=${typedStats.totalMovesUsed || 0}`);

                 // Reset streaks on loss
                 typedStats.currentTieBotStreak = 0;
                 typedStats.tieBotStreakDate = null;
                 typedStats.currentPuzzleCompletedStreak = 0; // Reset win streak
                 typedStats.puzzleCompletedStreakDate = null; // Reset win streak date
                 typedStats.currentFirstTryStreak = 0; // Reset first try streak

                 const movesToAdd = data.movesUsedInGame || 0;
                 if (movesToAdd > 0) {
                     typedStats.totalMovesUsed = (typedStats.totalMovesUsed || 0) + movesToAdd;
                 }
                 logger.info(`[DATA] ${eventType} - After update: Streaks reset, totalMovesUsed=${typedStats.totalMovesUsed}`);

            } else if (eventType === "tryAgain") {
                logger.info(`[DATA] ${eventType} - Before update: totalMovesUsed=${typedStats.totalMovesUsed || 0}`);
                // Only update total moves. Do NOT reset streaks here. Streaks depend on win/loss/skipped days.
                const movesToAdd = data.movesUsedInGame || 0;
                if (movesToAdd > 0) {
                    typedStats.totalMovesUsed = (typedStats.totalMovesUsed || 0) + movesToAdd;
                }
                logger.info(`[DATA] ${eventType} - After update: totalMovesUsed=${typedStats.totalMovesUsed}. Streaks NOT reset.`);

            } else if (eventType === "reconcileAbandonedMoves") {
                 logger.info(`[DATA] reconcileAbandonedMoves - Before update: totalMovesUsed=${typedStats.totalMovesUsed || 0}`);
                 const movesToAdd = data.movesToAdd || 0;
                 if (movesToAdd > 0) {
                     typedStats.totalMovesUsed = (typedStats.totalMovesUsed || 0) + movesToAdd;
                 }
                 logger.info(`[DATA] reconcileAbandonedMoves - After update: totalMovesUsed=${typedStats.totalMovesUsed}`);
            }
            // --- End Event Processing ---

            // Update last played date
            typedStats.lastPlayedIsoDate = puzzleId;

            // Log final state before committing
            logger.info(`[DATA] Final stats state: ${JSON.stringify({
                lastPlayedIsoDate: typedStats.lastPlayedIsoDate,
                totalWins: typedStats.totalWins,
                totalGamesPlayed: typedStats.totalGamesPlayed,
                totalMovesUsed: typedStats.totalMovesUsed,
                totalHintsUsed: typedStats.totalHintsUsed,
                currentTieBotStreak: typedStats.currentTieBotStreak,
                longestTieBotStreak: typedStats.longestTieBotStreak,
                currentPuzzleCompletedStreak: typedStats.currentPuzzleCompletedStreak,
                longestPuzzleCompletedStreak: typedStats.longestPuzzleCompletedStreak,
                currentFirstTryStreak: typedStats.currentFirstTryStreak,
                longestFirstTryStreak: typedStats.longestFirstTryStreak,
                tieBotStreakDate: typedStats.tieBotStreakDate,
                puzzleCompletedStreakDate: typedStats.puzzleCompletedStreakDate,
                playedDaysCount: typedStats.playedDays.length,
                goalAchievedDaysCount: typedStats.goalAchievedDays.length,
                goalBeatenDaysCount: typedStats.goalBeatenDays.length,
                bestScoresByDayDifficulty: typedStats.bestScoresByDayDifficulty
            })}`);

            // Set or update the document in the transaction
            transaction.set(userStatsRef, typedStats, { merge: true }); // Use merge: true to ensure we don't overwrite fields unintentionally

            logger.info(`Successfully prepared update for user ${userId} after ${eventType} event.`);
            return {success: true as const, updatedStats: typedStats as unknown as Record<string, unknown>};
        });
        return result;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error running transaction for user ${userId} on event ${eventType}:`, error);
        // Throw a generic error, HttpsError should be thrown by the caller (onCall function)
        throw new Error(`Failed to update user stats: ${errorMessage}`);
    }
}
// --- End processUserStatsUpdate ---

/**
 * v2 Callable function to update user stats
 */
export const updateUserStats = onCall(
    {
        // Runtime options
        memory: "256MiB",
        timeoutSeconds: 60,
        // App Check options
        ...getAppCheckConfig(), // Use helper to determine App Check enforcement
    },
    async (request) => {
        // Authentication check (v2 automatically requires auth for onCall unless specified otherwise)
        if (!request.auth) {
            logger.error("v2/updateUserStats: User is not authenticated.");
            throw new HttpsError("unauthenticated", "Authentication is required to update stats.");
        }
        const userId = request.auth.uid;
        logger.info(`v2/updateUserStats invoked by user: ${userId}, App Check verified: ${!!request.app}`);

        // Validate Input Data
        const payload = request.data as UpdateUserStatsPayload; // Cast data
        if (!payload || !payload.eventType || !payload.puzzleId) {
            logger.error("v2/updateUserStats: Missing required fields.", payload);
            throw new HttpsError("invalid-argument", "Missing required fields (eventType, puzzleId).");
        }

        logger.info(`v2: Callable updateUserStats called with eventType: ${payload.eventType} for puzzle: ${payload.puzzleId}`);

        // Function Logic (call helper)
        try {
            const result = await processUserStatsUpdate(userId, payload);
            return result; // Return the success/error object directly
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`v2: Error processing user stats update for ${userId}:`, error);
            // Throw HttpsError for internal issues
            throw new HttpsError("internal", `Internal server error updating stats: ${errorMessage}`);
        }
    }
);

/**
 * v2 Callable function to get user stats
 */
export const getUserStats = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        if (!request.auth) {
            logger.error("v2/getUserStats: User is not authenticated.");
            throw new HttpsError("unauthenticated", "Authentication is required to get stats.");
        }
        const userId = request.auth.uid;
        logger.info(`v2/getUserStats invoked by user: ${userId}, App Check verified: ${!!request.app}`);

        try {
            const userStatsRef = db.collection("userStats").doc(userId);
            const docSnap = await userStatsRef.get();
            let statsToSend: GameStatistics; // Use the interface

            if (docSnap.exists) {
                logger.info(`v2: Fetched stats for user ${userId}`);
                // Ensure the fetched data conforms to GameStatistics, merging with defaults for missing fields
                const fetchedData = docSnap.data() || {};
                statsToSend = { ...defaultStats, ...fetchedData }; // Use flat defaultStats
            } else {
                logger.info(`v2: No stats found for user ${userId}, returning default`);
                statsToSend = { ...defaultStats }; // Use flat defaultStats
            }

            return {success: true, stats: statsToSend};
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`v2: Error in getUserStats for ${userId}:`, errorMessage);
            throw new HttpsError("internal", `Internal error fetching user stats: ${errorMessage}`);
        }
    }
);

/**
 * v2 Callable function to get daily scores stats
 */
export const getDailyScoresStats = onCall(
    {
        // Runtime options
        memory: "256MiB",
        timeoutSeconds: 60,
        // App Check options
        ...getAppCheckConfig(), // Use helper to determine App Check enforcement
    },
    async (request) => {
        // Authentication (Optional check, as guests might call this)
        const userId = request.auth?.uid || "guest/unauthenticated";
        logger.info(`v2/getDailyScoresStats invoked by user: ${userId}, App Check verified: ${!!request.app}`);

        // Validate Input Data
        const puzzleId = request.data?.puzzleId;
        if (!puzzleId) {
            logger.error("v2/getDailyScoresStats: Missing 'puzzleId'.");
            throw new HttpsError("invalid-argument", "puzzleId is required.");
        }
        logger.info(`v2: Callable getDailyScoresStats called with puzzleId: ${puzzleId}`);

        // Function Logic
        try {
            const scoresRef = db.collection("dailyScores").doc(puzzleId).collection("scores");
            const scoresSnapshot = await scoresRef.get();

            const defaultStats = {lowestScore: null, averageScore: null, totalPlayers: 0, playersWithLowestScore: 0};

            if (scoresSnapshot.empty) {
                logger.info(`v2: No scores found for puzzle ${puzzleId}. Returning default stats.`);
                return {success: true, stats: defaultStats};
            }

            // Keep track of scores by difficulty
            const hardDifficultyScores: number[] = [];
            const allAdjustedScores: number[] = []; // Scores with difficulty handicap applied
            const totalPlayers = scoresSnapshot.size;
            
            scoresSnapshot.forEach((doc) => {
                const scoreData = doc.data();
                if (scoreData && typeof scoreData.score === "number" && !isNaN(scoreData.score)) {
                    let adjustedScore = scoreData.score;
                    
                    // Apply difficulty handicaps for averageScore calculation
                    if (scoreData.difficultyLevel === DifficultyLevel.Easy) {
                        adjustedScore += 3; // +3 handicap for Easy
                    } else if (scoreData.difficultyLevel === DifficultyLevel.Medium) {
                        adjustedScore += 1; // +1 handicap for Medium
                    }
                    
                    // Add to allAdjustedScores with handicap applied
                    allAdjustedScores.push(adjustedScore);
                    
                    // Only add to hardDifficultyScores if difficulty is Hard
                    // (for lowestScore and playersWithLowestScore calculation)
                    if (scoreData.difficultyLevel === DifficultyLevel.Hard) {
                        hardDifficultyScores.push(scoreData.score); // Original score, no handicap
                    }
                } else {
                    logger.warn(`v2: Invalid score data found in doc ${doc.id} for puzzle ${puzzleId}:`, scoreData);
                }
            });

            // Calculate averageScore using ALL scores with handicaps applied
            const averageScore = allAdjustedScores.length > 0 
                ? allAdjustedScores.reduce((sum, score) => sum + score, 0) / allAdjustedScores.length 
                : null;

            // For lowestScore and playersWithLowestScore, only use Hard difficulty scores
            let lowestScore: number | null = null;
            let playersWithLowestScore = 0;
            
            if (hardDifficultyScores.length > 0) {
                lowestScore = Math.min(...hardDifficultyScores);
                playersWithLowestScore = hardDifficultyScores.filter(score => score === lowestScore).length;
            }

            logger.info(
                `v2: Calculated stats for puzzle ${puzzleId}:`,
                {
                    lowestScore, 
                    averageScore, 
                    totalPlayers,
                    hardDifficultyPlayers: hardDifficultyScores.length,
                    playersWithLowestScore
                }
            );
            
            return {
                success: true,
                stats: {lowestScore, averageScore, totalPlayers, playersWithLowestScore},
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`v2: Error fetching daily scores stats for ${puzzleId}:`, errorMessage);
            throw new HttpsError("internal", `Error fetching daily scores stats: ${errorMessage}`);
        }
    }
);
