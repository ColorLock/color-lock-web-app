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
            
            // Create a map to store user display names
            const userDisplayNames = new Map<string, string>();
            
            // First, collect all the user IDs we need to fetch
            const userIds: string[] = [];
            snapshot.forEach(doc => {
                userIds.push(doc.id);
            });
            
            // Batch fetch user profiles to get display names (in chunks of 100)
            logger.info(`[getGlobalLeaderboard] Fetching display names for ${userIds.length} users`);
            try {
                // Process in chunks of 100 (Firebase Auth getUsers limit)
                for (let i = 0; i < userIds.length; i += 100) {
                    const chunk = userIds.slice(i, i + 100);
                    const userRecords = await admin.auth().getUsers(
                        chunk.map(uid => ({ uid }))
                    );
                    
                    // Store display names in our map
                    userRecords.users.forEach(user => {
                        // Use display name if available, otherwise use a portion of UID
                        userDisplayNames.set(
                            user.uid, 
                            user.displayName || `User_${user.uid.substring(0, 6)}`
                        );
                    });
                    
                    // Handle users not found (might be deleted)
                    userRecords.notFound.forEach(userIdentifier => {
                        // Fix: Check if the identifier is a UidIdentifier
                        if ('uid' in userIdentifier) {
                            const uid = userIdentifier.uid;
                            userDisplayNames.set(uid, `User_${uid.substring(0, 6)}`);
                        }
                    });
                }
                logger.info(`[getGlobalLeaderboard] Successfully fetched display names for ${userDisplayNames.size} users`);
            } catch (authError) {
                logger.error("[getGlobalLeaderboard] Error fetching user display names:", authError);
                // Continue with generated names if auth lookup fails
            }

            snapshot.forEach(doc => {
                const userId = doc.id;
                // Read data directly from the root
                const stats = doc.data() as GameStatistics | undefined;

                if (stats) {
                    // Get display name from our map, or fall back to generated name
                    const username = userDisplayNames.get(userId) || `User_${userId.substring(0, 6)}`;

                    // Cast stats to a type that includes the new fields
                    const typedStats = stats as GameStatistics; // Use the updated type

                    const countCollection = (v: Array<string> | Record<string, unknown>) => {
                        if (Array.isArray(v)) return v.length;
                        if (v && typeof v === 'object') return Object.keys(v as Record<string, unknown>).length;
                        return 0;
                        };
                        
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
                        botsBeaten: countCollection(typedStats.goalBeatenDays),
                        botsAchieved: countCollection(typedStats.goalAchievedDays),
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

function normalizeDifficulty(d: RecordPuzzlePayload["difficulty"]): DifficultyLevel {
    const val = typeof d === "string" ? d.toLowerCase() : d;
    if (val === DifficultyLevel.Easy || val === "easy") return DifficultyLevel.Easy;
    if (val === DifficultyLevel.Medium || val === "medium") return DifficultyLevel.Medium;
    return DifficultyLevel.Hard;
}

function isDayAfter(prevDateStr: string | null | undefined, currentDateStr: string): boolean {
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

async function getLowestDailyScore(puzzleId: string): Promise<number | null> {
    const scoresSnap = await db.collection("dailyScores").doc(puzzleId).collection("scores").get();
    if (scoresSnap.empty) return null;
    let minScore: number | null = null;
    scoresSnap.forEach(doc => {
        const data = doc.data();
        const s = typeof data?.score === "number" ? data.score : null;
        if (s !== null && !isNaN(s)) {
            if (minScore === null || s < minScore) minScore = s;
        }
    });
    return minScore;
}

async function getLowestHardDailyScore(puzzleId: string): Promise<number | null> {
    const scoresSnap = await db.collection("dailyScores").doc(puzzleId).collection("scores").get();
    if (scoresSnap.empty) return null;
    let minScore: number | null = null;
    scoresSnap.forEach(doc => {
        const data = doc.data();
        const s = typeof data?.score === "number" ? data.score : null;
        const level = data?.difficultyLevel;
        if (s !== null && !isNaN(s) && level === DifficultyLevel.Hard) {
            if (minScore === null || s < minScore) minScore = s;
        }
    });
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
        const qualifiesVsBot = moves < botMoves;
        let firstToBeatBot = false;
        if (difficulty === DifficultyLevel.Hard) {
            const lowestExisting = await getLowestHardDailyScore(puzzleId); // null => no hard scores yet
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
                            firstTry,
                            eloScore: elo,
                            attemptToTieBot,
                            attemptToBeatBot,
                        };
                        newDiffObj.firstToBeatBot = difficulty === DifficultyLevel.Hard ? firstToBeatBot : false;
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
                    // Mirror to V2 immediately and queue for stats recompute
                    try {
                        const v2DocRef = db.collection("dailyScoresV2").doc(puzzleId);
                        // Write nested map using proper merge semantics (no dot-path in set)
                        tx.set(v2DocRef, { [diffKey]: { [userId]: null } }, { merge: true });
                        v2Writes.push({ diffKey, moves: moves });
                    } catch (e) {
                        logger.warn("Failed mirroring per-difficulty daily score (v2) on loss init", { puzzleId, difficulty: diffKey, userId }, e);
                    }
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
            if (isDayAfter(prevLastCompletedDate, puzzleId)) {
                currentStreak = prevCurrentStreak + 1;
            } else {
                currentStreak = 1;
            }
            const longestStreak = Math.max(prevLongestStreak, currentStreak);

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

        // Lastly, update dailyScores with best score for user
        try {
            const scoreRef = db.collection("dailyScores").doc(puzzleId).collection("scores").doc(userId);
            const scoreSnap = await scoreRef.get();
            const currentScore = scoreSnap.exists ? scoreSnap.data()?.score : undefined;
            if (typeof currentScore !== 'number' || moves < currentScore) {
                await scoreRef.set({ score: moves, difficultyLevel: difficulty }, { merge: true });
            }
        } catch (e) {
            logger.error("Failed to update dailyScores for user", userId, "puzzle", puzzleId, e);
        }

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
    await ref.set({ [diffKey]: { [userId]: moves }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
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

    const statsRef = db.collection("dailyScoresV2").doc(puzzleId).collection("stats").doc(diffKey);
    await statsRef.set({
        lowestScore: lowestScore ?? null,
        totalPlayers,
        playersWithLowestScore,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

// --- New: Get User Daily Stats ---
export const getUserDailyStats = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        if (!request.auth) {
            logger.error("getUserDailyStats: unauthenticated call");
            throw new HttpsError("unauthenticated", "Authentication required.");
        }
        const requesterId = request.auth.uid;
        const { userId, puzzleId, difficulty } = request.data || {};

        if (!userId || !puzzleId || !difficulty) {
            throw new HttpsError("invalid-argument", "userId, puzzleId, and difficulty are required.");
        }
        if (userId !== requesterId) {
            throw new HttpsError("permission-denied", "Cannot access another user's stats.");
        }

        // Normalize difficulty to enum value used in docs
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

            const puzzleData = puzzleSnap.exists ? (puzzleSnap.data() || {}) : {} as Record<string, unknown>;
            const laData = laSnap.exists ? (laSnap.data() || {}) : {} as Record<string, unknown>;
            const dData = diffSnap.exists ? (diffSnap.data() || {}) : {} as Record<string, unknown>;

            const perDifficulty = (puzzleData as any)[normalizedDifficulty] || {};

            const result = {
                // From puzzles/<puzzleId>.<difficulty>
                eloScore: typeof perDifficulty.eloScore === 'number' ? perDifficulty.eloScore : (typeof perDifficulty.elo === 'number' ? perDifficulty.elo : null),
                totalAttempts: typeof (puzzleData as any).totalAttempts === 'number' ? (puzzleData as any).totalAttempts : null,
                attemptToBeatBot: typeof perDifficulty.attemptToBeatBot === 'number' ? perDifficulty.attemptToBeatBot : null,
                attemptToTieBot: typeof perDifficulty.attemptToTieBot === 'number' ? perDifficulty.attemptToTieBot : null,

                // From leaderboard/levelAgnostic
                moves: typeof (laData as any).moves === 'number' ? (laData as any).moves : null,
                currentPuzzleCompletedStreak: typeof (laData as any).currentPuzzleCompletedStreak === 'number' ? (laData as any).currentPuzzleCompletedStreak : null,
                puzzleAttempts: typeof (laData as any).puzzleAttempts === 'number' ? (laData as any).puzzleAttempts : null,
                puzzlesSolved: typeof (laData as any).puzzleSolved === 'number' ? (laData as any).puzzleSolved : (typeof (laData as any).puzzlesSolved === 'number' ? (laData as any).puzzlesSolved : null),

                // From leaderboard/<difficulty>
                currentFirstTryStreak: typeof (dData as any).currentFirstTryStreak === 'number' ? (dData as any).currentFirstTryStreak : null,
                currentTieBotStreak: typeof (dData as any).currentTieBotStreak === 'number' ? (dData as any).currentTieBotStreak : null,
            };

            return { success: true, stats: result };
        } catch (e) {
            logger.error("getUserDailyStats: error fetching stats", e);
            throw new HttpsError("internal", "Failed to fetch daily stats.");
        }
    }
);

// --- New: Get Global Leaderboard (Level-agnostic + Difficulty segment) ---
export const getLeaderboard = onCall(
    {
        memory: "256MiB",
        timeoutSeconds: 60,
        ...getAppCheckConfig(),
    },
    async (request) => {
        // Optional auth for public leaderboard; if present, log
        const uid = request.auth?.uid || "guest/unauthenticated";
        logger.info(`getLeaderboard invoked by: ${uid}`);

        const requestedDifficulty = request.data?.difficulty as (DifficultyLevel | "easy" | "medium" | "hard" | undefined);
        const normalizedDifficulty = requestedDifficulty ? normalizeDifficulty(requestedDifficulty) : undefined;

        try {
            // Fetch all level-agnostic leaderboard docs across users
            const laSnap = await db.collectionGroup("leaderboard")
                .where(admin.firestore.FieldPath.documentId(), "==", "levelAgnostic")
                .get();

            // If difficulty requested, fetch that difficulty docs across users
            let diffSnap: FirebaseFirestore.QuerySnapshot | null = null;
            if (normalizedDifficulty) {
                diffSnap = await db.collectionGroup("leaderboard")
                    .where(admin.firestore.FieldPath.documentId(), "==", normalizedDifficulty)
                    .get();
            }

            // Helper to extract userId from a collection group doc path: userPuzzleHistory/{uid}/leaderboard/{docId}
            const getUserIdFromDoc = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                const parent = doc.ref.parent; // leaderboard
                const userDoc = parent.parent; // userPuzzleHistory/{uid}
                return userDoc ? userDoc.id : undefined;
            };

            // Assemble level-agnostic arrays per stat
            type Entry = { userId: string; value: number };
            const laEntriesAllTime: Entry[] = [];
            const laEntriesLast30: Entry[] = [];
            const laEntriesLast7: Entry[] = [];
            const laEntriesLongestStreak: Entry[] = [];
            const laEntriesCurrentStreak: Entry[] = [];

            laSnap.forEach(doc => {
                const userId = getUserIdFromDoc(doc);
                if (!userId) return;
                const data = doc.data() as any;
                const pushIfNum = (arr: Entry[], v: any) => {
                    if (typeof v === 'number' && !isNaN(v)) arr.push({ userId, value: v });
                };
                pushIfNum(laEntriesAllTime, data.eloScoreAllTime);
                pushIfNum(laEntriesLast30, data.eloScoreLast30);
                pushIfNum(laEntriesLast7, data.eloScoreLast7);
                pushIfNum(laEntriesLongestStreak, data.longestPuzzleCompletedStreak);
                pushIfNum(laEntriesCurrentStreak, data.currentPuzzleCompletedStreak);
            });

            const desc = (a: Entry, b: Entry) => b.value - a.value;
            laEntriesAllTime.sort(desc);
            laEntriesLast30.sort(desc);
            laEntriesLast7.sort(desc);
            laEntriesLongestStreak.sort(desc);
            laEntriesCurrentStreak.sort(desc);

            // Assemble difficulty arrays per stat (only if requested)
            let difficultyResult: any = null;
            if (diffSnap && normalizedDifficulty) {
                const ftCurrent: Entry[] = [];
                const tieCurrent: Entry[] = [];
                const ftLongest: Entry[] = [];
                const tieLongest: Entry[] = [];
                const goalsAchieved: Entry[] = [];
                const goalsBeaten: Entry[] = [];

                diffSnap.forEach(doc => {
                    const userId = getUserIdFromDoc(doc);
                    if (!userId) return;
                    const data = doc.data() as any;
                    const pushIfNum = (arr: Entry[], v: any) => {
                        if (typeof v === 'number' && !isNaN(v)) arr.push({ userId, value: v });
                    };
                    pushIfNum(ftCurrent, data.currentFirstTryStreak);
                    pushIfNum(tieCurrent, data.currentTieBotStreak);
                    pushIfNum(ftLongest, data.longestFirstTryStreak);
                    pushIfNum(tieLongest, data.longestTieBotStreak);
                    pushIfNum(goalsAchieved, data.goalsAchieved);
                    pushIfNum(goalsBeaten, data.goalsBeaten);
                });

                ftCurrent.sort(desc);
                tieCurrent.sort(desc);
                ftLongest.sort(desc);
                tieLongest.sort(desc);
                goalsAchieved.sort(desc);
                goalsBeaten.sort(desc);

                difficultyResult = {
                    difficulty: normalizedDifficulty,
                    currentFirstTryStreak: ftCurrent,
                    currentTieBotStreak: tieCurrent,
                    longestFirstTryStreak: ftLongest,
                    longestTieBotStreak: tieLongest,
                    goalsAchieved,
                    goalsBeaten,
                };
            }

            return {
                success: true,
                leaderboard: {
                    levelAgnostic: {
                        eloScoreAllTime: laEntriesAllTime,
                        eloScoreLast30: laEntriesLast30,
                        eloScoreLast7: laEntriesLast7,
                        longestPuzzleCompletedStreak: laEntriesLongestStreak,
                        currentPuzzleCompletedStreak: laEntriesCurrentStreak,
                    },
                    difficulty: difficultyResult,
                },
            };
        } catch (e) {
            logger.error('getLeaderboard: error building leaderboard', e);
            throw new HttpsError('internal', 'Failed to fetch leaderboard');
        }
    }
);
