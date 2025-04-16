import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// Initialize Firebase app
admin.initializeApp();

// Initialize Firestore client
const db = admin.firestore();

// Configure logging
const logger = functions.logger;

// Get config from environment
function getConfig() {
  try {
    return functions.config();
  } catch (error) {
    try {
      const configPath = path.resolve(__dirname, "../.runtimeconfig.json");
      const configFile = fs.readFileSync(configPath, "utf8");
      return JSON.parse(configFile);
    } catch (error) {
      return {
        security: {
          allowed_origins: "https://colorlock.xyz,https://colorlock.netlify.app,http://localhost:3000,http://127.0.0.1:3000",
        },
      };
    }
  }
}

// Get configuration
const config = getConfig();
const ALLOWED_ORIGINS = config.security.allowed_origins.split(",");

/**
 * Validate a Firebase Auth token
 */
async function validateAuthToken(token: string): Promise<admin.auth.DecodedIdToken | null> {
  if (!token) {
    logger.warn("No token provided");
    return null;
  }

  try {
    // Verify the token using Firebase Auth
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Check token is not expired
    const currentTime = Math.floor(Date.now() / 1000);
    if ((decodedToken.exp || 0) < currentTime) {
      logger.warn("Token has expired");
      return null;
    }

    // Additional validation can be added here if needed

    return decodedToken;
  } catch (error) {
    logger.error("Error validating auth token:", error);
    return null;
  }
}

/**
 * Determine if a request is authorized via auth token (for both prod and local dev)
 */
async function isAuthorizedRequest(request: functions.https.Request): Promise<admin.auth.DecodedIdToken | null> {
  let userId: string | null = null;
  let decodedToken: admin.auth.DecodedIdToken | null = null;

  // 1. Check X-Forwarded-Authorization header first (coming from API Gateway)
  const forwardedAuthHeader = request.headers["x-forwarded-authorization"] as string || "";
  if (forwardedAuthHeader.startsWith("Bearer ")) {
    const userToken = forwardedAuthHeader.split("Bearer ")[1];
    try {
      decodedToken = await admin.auth().verifyIdToken(userToken);
      userId = decodedToken.uid;
      logger.info(`User ID from X-Forwarded-Authorization: ${userId}`);
      return decodedToken;
    } catch (error) {
      logger.warn("Failed to verify token from X-Forwarded-Authorization:", error);
      // Continue to try other auth methods
    }
  }

  // 2. Check standard Authorization header (for direct emulator calls or other scenarios)
  const authHeader = request.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.split("Bearer ")[1];
    try {
      decodedToken = await validateAuthToken(token);
      if (decodedToken) {
        logger.info(`User ID from Authorization header: ${decodedToken.uid}`);
        return decodedToken;
      }
    } catch (error) {
      logger.warn("Failed to verify token from Authorization header:", error);
    }
  }

  // 3. Allow special header for emulator testing without full auth
  if (process.env.FUNCTIONS_EMULATOR === "true" && request.headers["x-emulator-user-id"]) {
    const userId = request.headers["x-emulator-user-id"] as string;
    logger.warn(`Emulator bypass: Using user ID from header: ${userId}`);
    // Return a mock DecodedIdToken for emulator testing
    return {uid: userId} as admin.auth.DecodedIdToken;
  }

  return null;
}

/**
 * Validate request origin and authentication
 */
async function validateOriginAndAuth(request: functions.https.Request): Promise<[boolean, string]> {
  // Get the request origin
  const requestOrigin = request.headers.origin || "";

  // Origin validation
  const originValid = ALLOWED_ORIGINS.includes(requestOrigin);

  // Local dev validation with service account
  const isLocalhost = requestOrigin.startsWith("http://localhost:") ||
                      requestOrigin.startsWith("http://127.0.0.1:");
  const isAuthorizedLocal = false;

  // Allow localhost in development/emulator environment
  if (isLocalhost && process.env.FUNCTIONS_EMULATOR === "true") {
    logger.info(`Allowing request from emulator origin: ${requestOrigin}`);
    return [true, requestOrigin];
  }

  // Return validation result with appropriate origin for CORS
  if (originValid || isAuthorizedLocal) {
    return [true, originValid ? requestOrigin : ALLOWED_ORIGINS[0]];
  }

  logger.warn(`Invalid origin detected: ${requestOrigin}. Allowed: ${ALLOWED_ORIGINS.join(", ")}`);
  return [false, ALLOWED_ORIGINS[0]]; // Return a default allowed origin for CORS headers even on failure
}

/**
 * Create and return proper CORS headers
 */
function setCorsHeaders(origin: string, requestMethod = "GET"): Record<string, string> {
  // Ensure origin is one of the allowed ones, or the first allowed one as default
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  if (requestMethod === "OPTIONS") {
    return {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Emulator-User-Id", // Allow custom header
      "Access-Control-Max-Age": "3600",
    };
  } else {
    return {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Content-Type": "application/json",
    };
  }
}

/**
 * Firebase Cloud Function to fetch a puzzle by date
 */
export const fetchPuzzle = functions.https.onRequest(async (request, response) => {
  // Validate origin and authentication
  const [isValid, origin] = await validateOriginAndAuth(request);
  if (!isValid) {
    // Return 403 Forbidden if request is not from allowed origin or authorized local
    response.status(403).send({
      success: false,
      error: "Forbidden: Invalid origin",
    });
    return;
  }

  // CORS is now handled by API Gateway - removing OPTIONS handling and CORS headers
  
  // Validate authorization
  const decodedToken = await isAuthorizedRequest(request);
  if (!decodedToken) {
    response.status(401).send({
      success: false,
      error: "Unauthorized: Valid Firebase Auth token or emulator header required",
    });
    return;
  }

  try {
    // Extract the date from the request data
    const requestJson = request.body;
    if (!requestJson || !requestJson.date) {
      response.status(400).send({
        success: false,
        error: "Date parameter is required",
      });
      return;
    }

    const date = requestJson.date;
    logger.info(`Attempting to fetch puzzle for date: ${date} for user: ${decodedToken.uid}`);

    // Fetch the puzzle document
    const puzzleRef = db.collection("puzzles").doc(date);
    const puzzleSnap = await puzzleRef.get();

    if (puzzleSnap.exists) {
      logger.info("Puzzle found in Firestore");
      const puzzleData = puzzleSnap.data();

      // Detailed data validation with specific field checks
      if (!puzzleData || typeof puzzleData.algoScore !== "number" || !puzzleData.targetColor || !Array.isArray(puzzleData.states) || puzzleData.states.length === 0) {
        logger.error(`Invalid puzzle data found for date: ${date}`, puzzleData);
        response.status(500).send({
          success: false,
          error: "Invalid puzzle data format found.",
        });
        return;
      }

      response.status(200).send({
        success: true,
        data: puzzleData,
      });
    } else {
      logger.info(`No puzzle found for date: ${date}`);
      response.status(404).send({
        success: false,
        error: `Puzzle not found for date: ${date}`,
      });
    }
  } catch (error) {
    logger.error(`Error in fetchPuzzle for date ${request.body?.date}:`, error);
    response.status(500).send({
      success: false,
      error: "Internal server error fetching puzzle",
    });
  }
});

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

// --- Helper to get local date string (YYYY-MM-DD) on the server ---
function getServersideLocalDateString(): string {
  // Use server's local time. Adjust timezone if necessary for consistency.
  // For Cloud Functions, this defaults to UTC unless configured otherwise.
  // Consider setting the function's timezone explicitly if needed:
  // https://firebase.google.com/docs/functions/manage-functions#set_timezone
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// --- Interface for the updateUserStats payload ---
interface UpdateUserStatsPayload {
  eventType: "firstMove" | "hint" | "win" | "loss" | "tryAgain" | "reconcileAbandonedMoves";
  puzzleId: string; // YYYY-MM-DD date string
  // Optional fields depending on eventType
  userScore?: number;
  algoScore?: number;
  movesUsedInGame?: number;
  hintsUsedInGame?: number;
  isFirstTryOfDay?: boolean;
  attemptNumberToday?: number; // Frontend tracks this attempt number for the specific day
  movesToAdd?: number; // For reconcileAbandonedMoves event
}

// Type interface for processUserStatsUpdate return value
interface UserStatsSuccessResult {
  success: true;
  updatedStats: any; // Using any here but ideally would be a more specific type
}

interface UserStatsErrorResult {
  success: false;
  error: string;
}

type UserStatsResult = UserStatsSuccessResult | UserStatsErrorResult;

/**
 * Process user stats update for both callable and HTTP functions
 */
async function processUserStatsUpdate(userId: string, data: UpdateUserStatsPayload): Promise<UserStatsResult> {
  const { eventType, puzzleId } = data;

  // Validate the event type
  if (!["firstMove", "hint", "win", "loss", "tryAgain", "reconcileAbandonedMoves"].includes(eventType)) {
    logger.error(`Invalid eventType: ${eventType}`);
    return {
      success: false,
      error: "Invalid eventType. Must be one of: firstMove, hint, win, loss, tryAgain, reconcileAbandonedMoves",
    };
  }

  if (!puzzleId) {
    logger.error("Missing puzzleId in payload");
    return { success: false, error: "puzzleId is required" };
  }

  logger.info(`Processing ${eventType} event for user ${userId} on puzzle ${puzzleId}`);

  // Reference to user's stats document
  const userStatsRef = db.collection("userStats").doc(userId);

  try {
    // Use a transaction to ensure atomic updates
    const result = await db.runTransaction(async (transaction) => {
      // Get current user stats
      const doc = await transaction.get(userStatsRef);

      // Create base stats if document doesn't exist
      const stats = doc.exists ? doc.data() || {} : {
        totalGamesPlayed: 0,
        totalWins: 0,
        totalMovesUsed: 0,
        totalHintsUsed: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastStreakDate: null,
        firstTryStreak: 0,
        longestFirstTryStreak: 0,
        lastFirstTryStreakDate: null,
        playedDays: [],
        goalAchievedDays: [],
        winsPerDay: {},
        bestScoresByDay: {},
        hintUsageByDay: {},
        attemptsPerDay: {},
        attemptsToAchieveBotScore: {},
      };

      // Ensure nested objects/arrays exist
      stats.playedDays = stats.playedDays || [];
      stats.goalAchievedDays = stats.goalAchievedDays || [];
      stats.winsPerDay = stats.winsPerDay || {};
      stats.bestScoresByDay = stats.bestScoresByDay || {};
      stats.hintUsageByDay = stats.hintUsageByDay || {};
      stats.attemptsPerDay = stats.attemptsPerDay || {};
      stats.attemptsToAchieveBotScore = stats.attemptsToAchieveBotScore || {};

      // Process based on event type
      if (eventType === "firstMove") {
        // --- attemptsPerDay LOGIC ---
        // Increment attemptsPerDay ONLY on the first move of any attempt.
        stats.attemptsPerDay[puzzleId] = (stats.attemptsPerDay[puzzleId] || 0) + 1;
        logger.info(`Incremented attemptsPerDay for ${puzzleId} to ${stats.attemptsPerDay[puzzleId]}`);

        // Track total games played (only increment if it's the first attempt *ever* for this puzzleId)
        if (!stats.playedDays.includes(puzzleId)) {
          stats.playedDays = [...stats.playedDays, puzzleId];
          stats.totalGamesPlayed = (stats.totalGamesPlayed || 0) + 1;
          logger.info(`Added ${puzzleId} to playedDays. Incremented totalGamesPlayed to ${stats.totalGamesPlayed}`);
        }

        // Initialize hint usage for this puzzle if not exist
        if (stats.hintUsageByDay[puzzleId] === undefined) {
          stats.hintUsageByDay[puzzleId] = 0;
          logger.info(`Initialized hintUsageByDay for ${puzzleId} to 0`);
        }
      } else if (eventType === "hint") {
        // Logic for hint usage
        const hintsToAdd = data.hintsUsedInGame || 1; // Default to 1 if not specified
        stats.totalHintsUsed = (stats.totalHintsUsed || 0) + hintsToAdd;
        stats.hintUsageByDay[puzzleId] = (stats.hintUsageByDay[puzzleId] || 0) + hintsToAdd;
        logger.info(`Incremented totalHintsUsed by ${hintsToAdd}. hintUsageByDay for ${puzzleId} is now ${stats.hintUsageByDay[puzzleId]}`);

      } else if (eventType === "win") {
        // Logic for win event
        const { userScore, algoScore, movesUsedInGame, isFirstTryOfDay } = data;

        if (userScore === undefined || algoScore === undefined ||
            movesUsedInGame === undefined || isFirstTryOfDay === undefined) {
          logger.error("Missing required win event data", data);
          // Return error within transaction to abort it
          throw new Error("Missing required win event data: userScore, algoScore, movesUsedInGame, isFirstTryOfDay");
        }

        // --- Core Win Stats ---
        stats.totalWins = (stats.totalWins || 0) + 1;
        stats.totalMovesUsed = (stats.totalMovesUsed || 0) + movesUsedInGame;
        logger.info(`Incremented totalWins to ${stats.totalWins}. Added ${movesUsedInGame} moves, totalMovesUsed is now ${stats.totalMovesUsed}`);

        // Update wins per day
        stats.winsPerDay[puzzleId] = (stats.winsPerDay[puzzleId] || 0) + 1;
        logger.info(`Incremented winsPerDay for ${puzzleId} to ${stats.winsPerDay[puzzleId]}`);

        // --- Goal Achieved & Streaks (Conditional) ---
        const goalMet = userScore <= algoScore;
        logger.info(`Goal Met (userScore <= algoScore): ${goalMet} (${userScore} <= ${algoScore})`);

        // Track if this is the first time *meeting the goal* for this puzzle
        const firstTimeMeetingGoal = !stats.goalAchievedDays.includes(puzzleId);

        if (goalMet) {
          // --- goalAchievedDays LOGIC ---
          if (firstTimeMeetingGoal) {
            stats.goalAchievedDays = [...stats.goalAchievedDays, puzzleId];
            logger.info(`Added ${puzzleId} to goalAchievedDays.`);

            // --- Regular Streak Logic (only update on first goal achievement per day) ---
            const today = new Date(); // Use server time
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split("T")[0];

            if (stats.lastStreakDate === yesterdayStr) {
              stats.currentStreak = (stats.currentStreak || 0) + 1;
              logger.info(`Continued streak. Current streak: ${stats.currentStreak}`);
            } else if (stats.lastStreakDate !== puzzleId) {
              // Don't reset if winning again on the same day
              stats.currentStreak = 1;
              logger.info("Started new streak. Current streak: 1");
            }
            if (stats.currentStreak > (stats.longestStreak || 0)) {
              stats.longestStreak = stats.currentStreak;
              logger.info(`New longest streak: ${stats.longestStreak}`);
            }
            stats.lastStreakDate = puzzleId; // Update last date only when goal is met
          } else {
            logger.info(`Goal met, but ${puzzleId} already in goalAchievedDays. Regular streak not updated.`);
          }

          // --- firstTryStreak LOGIC ---
          if (isFirstTryOfDay) { // Use flag from client
            // Calculate yesterday based on server time
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split("T")[0];

            if (stats.lastFirstTryStreakDate === yesterdayStr) {
              stats.firstTryStreak = (stats.firstTryStreak || 0) + 1;
              logger.info(`Continued first try streak. Current: ${stats.firstTryStreak}`);
            } else if (stats.lastFirstTryStreakDate !== puzzleId) {
              // Don't reset if winning again on the same day (though unlikely for first try)
              stats.firstTryStreak = 1;
              logger.info("Started new first try streak. Current: 1");
            }

            if (stats.firstTryStreak > (stats.longestFirstTryStreak || 0)) {
              stats.longestFirstTryStreak = stats.firstTryStreak;
              logger.info(`New longest first try streak: ${stats.longestFirstTryStreak}`);
            }
            stats.lastFirstTryStreakDate = puzzleId; // Update last date only on successful first try goal met
          } else {
            // If it's a win, goal met, but NOT the first try, reset the first try streak
            stats.firstTryStreak = 0;
            logger.info("Win was not first try, resetting firstTryStreak to 0.");
          }
        } else {
          // If goal was NOT met on this win, reset the first try streak
          stats.firstTryStreak = 0;
          logger.info("Goal not met on win, resetting firstTryStreak to 0.");
        }

        // --- Best Score Logic ---
        // Update best score if better or not set
        if (!stats.bestScoresByDay[puzzleId] || userScore < stats.bestScoresByDay[puzzleId]) {
          stats.bestScoresByDay[puzzleId] = userScore;
          logger.info(`Updated bestScoresByDay for ${puzzleId} to ${userScore}`);

          // --- attemptsToAchieveBotScore LOGIC ---
          // If score equals algo score, record the number of attempts *at that moment*
          if (goalMet && userScore === algoScore) {
            // Use the current attemptsPerDay count for this puzzle
            const attemptsWhenGoalMet = stats.attemptsPerDay[puzzleId] || 1; // Fallback to 1 if somehow not set
            stats.attemptsToAchieveBotScore[puzzleId] = attemptsWhenGoalMet;
            logger.info(`Recorded attemptsToAchieveBotScore for ${puzzleId} as ${attemptsWhenGoalMet}`);
          }

          // Update the daily scores collection for leaderboards
          // This should happen regardless of goalMet, just based on best score update
          await updateDailyScore(userId, puzzleId, userScore);
        }

      } else if (eventType === "loss") {
        // --- attemptsPerDay LOGIC ---
        // *No increment here* - handled by firstMove of the next attempt
        logger.info(`Loss event recorded for ${puzzleId}. attemptsPerDay not incremented here.`);

        // Add moves used in the lost game
        const movesInLostGame = data.movesUsedInGame || 0;
        stats.totalMovesUsed = (stats.totalMovesUsed || 0) + movesInLostGame;
        logger.info(`Added ${movesInLostGame} moves from lost game. totalMovesUsed is now ${stats.totalMovesUsed}`);

      } else if (eventType === "tryAgain") {
        // --- attemptsPerDay LOGIC ---
        // *No increment here* - handled by firstMove of the next attempt
        logger.info(`TryAgain event recorded for ${puzzleId}. attemptsPerDay not incremented here.`);

        // Add moves used in the abandoned/failed game (if any sent)
        const movesInFailedAttempt = data.movesUsedInGame || 0;
        if (movesInFailedAttempt > 0) {
          stats.totalMovesUsed = (stats.totalMovesUsed || 0) + movesInFailedAttempt;
          logger.info(`Added ${movesInFailedAttempt} moves from failed/abandoned attempt. totalMovesUsed is now ${stats.totalMovesUsed}`);
        } else {
          logger.info("No moves added for TryAgain event (movesUsedInGame was 0 or undefined).");
        }

      } else if (eventType === "reconcileAbandonedMoves") {
        // Add moves to the total that were abandoned
        const movesToAdd = data.movesToAdd || 0;
        if (movesToAdd > 0) {
          stats.totalMovesUsed = (stats.totalMovesUsed || 0) + movesToAdd;
          logger.info(`Reconciled ${movesToAdd} abandoned moves. totalMovesUsed is now ${stats.totalMovesUsed}`);
        } else {
          logger.info("No moves added for reconcileAbandonedMoves event (movesToAdd was 0 or undefined).");
        }
      }

      // Write the updated stats back to Firestore
      transaction.set(userStatsRef, stats, { merge: true });

      logger.info(`Successfully updated stats for user ${userId} after ${eventType} event.`);

      // Return the updated stats object which the caller can use
      return {
        success: true as const,
        updatedStats: stats,
      };
    });

    return result; // Return the result of the transaction
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error running transaction for user ${userId} on event ${eventType}:`, error);
    return {
      success: false,
      error: `Failed to update user stats: ${errorMessage}`,
    };
  }
}

// --- NEW: Function to fetch user stats ---
export const getUserStats = functions.https.onCall(async (data, context) => {
  const authContext = context as any;
  if (!authContext?.auth) {
    // Allowing emulator calls without full auth for local testing
    if (process.env.FUNCTIONS_EMULATOR !== "true") {
      logger.error("Unauthenticated call to getUserStats outside emulator.");
      throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }
    logger.warn("Emulator: getUserStats called without auth context.");
    if (!authContext?.auth?.uid) {
      logger.error("Emulator Error: No UID provided in auth context for getUserStats.");
      throw new functions.https.HttpsError("invalid-argument", "User ID is required.");
    }
  }

  const userId = authContext.auth.uid;
  const userStatsRef = db.collection("userStats").doc(userId);

  try {
    const docSnap = await userStatsRef.get();
    if (docSnap.exists) {
      logger.info(`Fetched stats for user ${userId}`);
      return {success: true, stats: docSnap.data()};
    } else {
      logger.info(`No stats document found for user ${userId}, returning default structure.`);
      // Return a default structure matching GameStatistics['allTimeStats']
      return {
        success: true,
        stats: {
          attemptsPerDay: {},
          bestScoresByDay: {},
          currentStreak: 0,
          goalAchievedDays: [],
          hintUsageByDay: {},
          lastStreakDate: null,
          longestStreak: 0,
          playedDays: [],
          totalGamesPlayed: 0,
          totalHintsUsed: 0,
          totalMovesUsed: 0,
          totalWins: 0,
          winsPerDay: {},
          firstTryStreak: 0,
          longestFirstTryStreak: 0,
          lastFirstTryStreakDate: null,
          attemptsToAchieveBotScore: {},
        },
      };
    }
  } catch (error: any) {
    logger.error(`Error fetching stats for user ${userId}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      `Error fetching user stats: ${error.message || "Unknown error"}`
    );
  }
});

// Add HTTP endpoint for getUserStats that handles CORS
export const getUserStatsHttp = functions.https.onRequest(async (req, res) => {
  // Validate origin and get CORS headers
  const [isValid, origin] = await validateOriginAndAuth(req);
  if (!isValid) {
    res.status(403).send({success: false, error: "Forbidden: Invalid origin"});
    return;
  }
  
  // CORS is now handled by API Gateway - removing OPTIONS handling and CORS headers

  if (req.method !== "POST") { // Typically stats requests might be GET, but POST is fine if you expect a body later
    res.status(405).send({success: false, error: "Method Not Allowed"});
    return;
  }

  let userId: string | null = null;
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

  try {
    // 1. Try verifying Auth token from header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1];
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        userId = decodedToken.uid;
        logger.info(`HTTP: User identified via Auth token: ${userId}`);
      } catch (tokenError: any) {
        logger.warn(`HTTP: Auth token verification failed: ${tokenError.message}. Checking emulator header.`);
        // Token invalid or expired, proceed to check emulator header
      }
    } else {
      logger.info("HTTP: No Authorization header found. Checking emulator header.");
    }

    // 2. If no user from token AND in emulator, check emulator header
    if (!userId && isEmulator && req.headers["x-emulator-user-id"]) {
      userId = req.headers["x-emulator-user-id"] as string;
      logger.warn(`HTTP: Emulator bypass: Using user ID from header: ${userId}`);
    }

    // 3. If still no userId, handle error
    if (!userId) {
      logger.error("HTTP: Could not determine User ID from token or emulator header.");
      // Send 401 Unauthorized if no user could be identified
      res.status(401).send({success: false, error: "Unauthorized: User ID could not be determined."});
      return;
    }

    // 4. Fetch user stats using the determined userId
    const userStatsRef = db.collection("userStats").doc(userId);
    const docSnap = await userStatsRef.get();

    let statsToSend;
    if (docSnap.exists) {
      logger.info(`HTTP: Fetched stats for user ${userId}`);
      statsToSend = docSnap.data();
    } else {
      logger.info(`HTTP: No stats found for user ${userId}, returning default`);
      // Return the default structure matching GameStatistics['allTimeStats']
      statsToSend = {
        attemptsPerDay: {}, bestScoresByDay: {}, currentStreak: 0, goalAchievedDays: [],
        hintUsageByDay: {}, lastStreakDate: null, longestStreak: 0, playedDays: [],
        totalGamesPlayed: 0, totalHintsUsed: 0, totalMovesUsed: 0, totalWins: 0,
        winsPerDay: {}, firstTryStreak: 0, longestFirstTryStreak: 0,
        lastFirstTryStreakDate: null, attemptsToAchieveBotScore: {},
      };
    }
    res.status(200).json({success: true, stats: statsToSend});
  } catch (error: any) {
    logger.error(`HTTP: Error fetching stats for user ${userId || "unknown"}:`, error);
    res.status(500).json({success: false, error: error.message || "Internal Server Error"});
  }
});

/**
 * Helper function for updating daily scores
 */
async function updateDailyScore(userId: string, puzzleId: string, score: number): Promise<void> {
  const scoreDocRef = db.collection("dailyScores").doc(puzzleId).collection("scores").doc(userId);

  try {
    // Use transactions to handle concurrent updates safely
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(scoreDocRef);

      if (!snapshot.exists) {
        // Create a new score document for this user
        transaction.set(scoreDocRef, {score});
        logger.info(`Created new score document for user ${userId} with score ${score}`);
      } else {
        // Only update if the new score is better (lower)
        const currentScore = snapshot.data()?.score;
        if (typeof currentScore !== "number" || score < currentScore) {
          transaction.update(scoreDocRef, {score});
          logger.info(`Updated score for user ${userId} from ${currentScore} to ${score}`);
        } else {
          logger.info(`Kept existing better score ${currentScore} for user ${userId} (new score: ${score})`);
        }
      }
    });

    logger.info(`Successfully updated daily score for user ${userId}`);
  } catch (error) {
    logger.error("Error updating daily score:", error);
    throw error;
  }
}

/**
 * Function to get low score and average scores for a puzzle
 */
export const getDailyScoresStats = functions.https.onCall(async (request) => {
  const data = request.data as DailyScoresStatsRequest;
  const puzzleId = data.puzzleId;

  if (!puzzleId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "puzzleId is required"
    );
  }

  logger.info(`getDailyScoresStats called with puzzleId: ${puzzleId}`);

  try {
    // Access the scores subcollection
    const scoresRef = db.collection("dailyScores").doc(puzzleId).collection("scores");
    const scoresSnapshot = await scoresRef.get();

    logger.info(`Found ${scoresSnapshot.size} documents in scores subcollection`);

    if (scoresSnapshot.empty) {
      logger.warn("No scores found in subcollection");

      // Return empty stats
      return {
        success: true,
        stats: {
          lowestScore: null,
          averageScore: null,
          totalPlayers: 0,
          playersWithLowestScore: 0,
        },
      };
    }

    // Extract scores from documents
    const allScores: number[] = [];
    const invalidDocs: string[] = [];

    scoresSnapshot.forEach((doc) => {
      const scoreData = doc.data();

      if (scoreData && typeof scoreData.score === "number") {
        allScores.push(scoreData.score);
      } else {
        invalidDocs.push(doc.id);
        logger.warn(`Invalid score data for document ${doc.id}:`, JSON.stringify(scoreData));
      }
    });

    if (invalidDocs.length > 0) {
      logger.warn(`Found ${invalidDocs.length} documents with invalid score data`);
    }

    logger.info(`Extracted ${allScores.length} valid scores`);

    if (allScores.length === 0) {
      logger.warn("No valid scores extracted, returning null stats");
      return {
        success: true,
        stats: {
          lowestScore: null,
          averageScore: null,
          totalPlayers: 0,
          playersWithLowestScore: 0,
        },
      };
    }

    // Calculate stats
    const lowestScore = Math.min(...allScores);
    const averageScore = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
    const totalPlayers = allScores.length;
    const playersWithLowestScore = allScores.filter((score) => score === lowestScore).length;

    logger.info("Stats calculated:", {
      lowestScore,
      averageScore,
      totalPlayers,
      playersWithLowestScore,
    });

    return {
      success: true,
      stats: {
        lowestScore,
        averageScore,
        totalPlayers,
        playersWithLowestScore,
      },
    };
  } catch (error) {
    logger.error("Error getting daily scores:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Error getting daily scores: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
});

// Create HTTP versions of callable functions for API Gateway

export const updateUserStatsHttp = functions.https.onRequest(async (req, res) => {
  // Validate origin and get CORS headers
  const [isValid, origin] = await validateOriginAndAuth(req);
  if (!isValid) {
    res.status(403).send({success: false, error: "Forbidden: Invalid origin"});
    return;
  }
  
  // CORS is now handled by API Gateway - removing OPTIONS handling and CORS headers

  if (req.method !== "POST") {
    res.status(405).send({success: false, error: "Method Not Allowed"});
    return;
  }

  // Validate authorization
  const decodedToken = await isAuthorizedRequest(req);
  if (!decodedToken) {
    res.status(401).send({
      success: false,
      error: "Unauthorized: Valid Firebase Auth token or emulator header required",
    });
    return;
  }

  try {
    const userId = decodedToken.uid;
    const data = req.body as UpdateUserStatsPayload;

    // Validate required fields
    if (!data || !data.eventType || !data.puzzleId) {
      res.status(400).send({
        success: false,
        error: "Missing required fields: eventType and puzzleId",
      });
      return;
    }

    logger.info(`HTTP updateUserStats called with eventType: ${data.eventType} for user: ${userId}`);

    // Process the update using the same logic as the callable function
    const result = await processUserStatsUpdate(userId, data); // Call the updated function

    // Return success response (or error if result.success is false)
    if (result.success) {
      res.status(200).send(result);
    } else {
      res.status(500).send(result); // Send 500 on internal processing error
    }
  } catch (error: any) {
    logger.error("HTTP updateUserStats error:", error);
    res.status(500).send({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
});

export const getDailyScoresStatsHttp = functions.https.onRequest(async (req, res) => {
  // Validate origin and get CORS headers
  const [isValid, origin] = await validateOriginAndAuth(req);
  if (!isValid) {
    res.status(403).send({success: false, error: "Forbidden: Invalid origin"});
    return;
  }
  
  // CORS is now handled by API Gateway - removing OPTIONS handling and CORS headers

  if (req.method !== "POST") {
    res.status(405).send({success: false, error: "Method Not Allowed"});
    return;
  }

  // Validate authorization
  const decodedToken = await isAuthorizedRequest(req);
  if (!decodedToken) {
    res.status(401).send({
      success: false,
      error: "Unauthorized: Valid Firebase Auth token required",
    });
    return;
  }

  try {
    const data = req.body as DailyScoresStatsRequest;
    const puzzleId = data.puzzleId;

    if (!puzzleId) {
      res.status(400).send({
        success: false,
        error: "puzzleId is required",
      });
      return;
    }

    logger.info(`HTTP getDailyScoresStats called with puzzleId: ${puzzleId}`);

    // Access the scores subcollection
    const scoresRef = db.collection("dailyScores").doc(puzzleId).collection("scores");
    const scoresSnapshot = await scoresRef.get();

    logger.info(`Found ${scoresSnapshot.size} documents in scores subcollection`);

    if (scoresSnapshot.empty) {
      logger.warn("No scores found in subcollection");
      // Return empty stats
      res.status(200).send({
        success: true,
        stats: {
          lowestScore: null,
          averageScore: null,
          totalPlayers: 0,
          playersWithLowestScore: 0,
        },
      });
      return;
    }

    // Extract scores from documents
    const allScores: number[] = [];
    const invalidDocs: string[] = [];

    scoresSnapshot.forEach((doc) => {
      const scoreData = doc.data();
      if (scoreData && typeof scoreData.score === "number") {
        allScores.push(scoreData.score);
      } else {
        invalidDocs.push(doc.id);
        logger.warn(`Invalid score data for document ${doc.id}:`, JSON.stringify(scoreData));
      }
    });

    if (invalidDocs.length > 0) {
      logger.warn(`Found ${invalidDocs.length} documents with invalid score data`);
    }

    logger.info(`Extracted ${allScores.length} valid scores`);

    if (allScores.length === 0) {
      logger.warn("No valid scores extracted, returning null stats");
      res.status(200).send({
        success: true,
        stats: {
          lowestScore: null,
          averageScore: null,
          totalPlayers: 0,
          playersWithLowestScore: 0,
        },
      });
      return;
    }

    // Calculate stats
    const lowestScore = Math.min(...allScores);
    const averageScore = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
    const totalPlayers = allScores.length;
    const playersWithLowestScore = allScores.filter((score) => score === lowestScore).length;

    logger.info("Stats calculated:", {
      lowestScore,
      averageScore,
      totalPlayers,
      playersWithLowestScore,
    });

    // Return response
    res.status(200).send({
      success: true,
      stats: {
        lowestScore,
        averageScore,
        totalPlayers,
        playersWithLowestScore,
      },
    });
  } catch (error: any) {
    logger.error("HTTP getDailyScoresStats error:", error);
    res.status(500).send({
      success: false,
      error: error.message || "Internal Server Error",
    });
  }
});

// Fix indentation and quotes in the updateUserStats function
export const updateUserStats = functions.https.onCall(async (request) => {
  console.log("--- updateUserStats START ---");
  try {
    const requestData = request.data;
    logger.info("[updateUserStats] Raw requestData:", JSON.stringify(requestData || null));

    let userId: string;
    const auth = request.auth;

    if (auth?.uid) {
      userId = auth.uid;
      logger.info(`[updateUserStats] Auth context present. User ID: ${userId}`);
    } else {
      logger.warn("[updateUserStats] Auth context or UID is missing.");
      if (process.env.FUNCTIONS_EMULATOR === "true") {
        logger.warn("[updateUserStats] Running in emulator and auth context/UID missing. Using placeholder UID for guest user.");
        userId = "emulator-guest-user-" + Date.now();
        logger.info(`[updateUserStats] Assigned placeholder User ID: ${userId}`);
      } else {
        logger.error("[updateUserStats] FATAL: auth.uid is missing outside emulator!");
        throw new functions.https.HttpsError("unauthenticated", "User ID (uid) is required and missing.");
      }
    }

    const data = requestData as unknown as UpdateUserStatsPayload;

    // Validate required fields more robustly
    if (!data || !data.eventType || !data.puzzleId) {
      logger.error("[updateUserStats] Invalid payload structure. Missing eventType or puzzleId.", data);
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields: eventType and puzzleId");
    }

    logger.info(`[updateUserStats] Calling processUserStatsUpdate for user ${userId}`);
    const result = await processUserStatsUpdate(userId, data); // Call the updated function

    if (!result.success) {
      logger.error(`[updateUserStats] Processing failed: ${result.error}`);
      // Throw HttpsError for callable functions
      throw new functions.https.HttpsError("internal", result.error || "Unknown error during stats processing");
    }

    logger.info(`[updateUserStats] Successfully processed event ${data.eventType} for user ${userId}`);
    // Return the result object which includes { success: true, updatedStats: stats }
    return result;
  } catch (error: any) {
    // Catch HttpsError specifically if thrown
    if (error instanceof functions.https.HttpsError) {
      logger.error(`[updateUserStats] HttpsError: ${error.code} - ${error.message}`, error.details);
      throw error; // Re-throw HttpsError
    }
    // Catch other errors
    logger.error("[updateUserStats] !!! UNHANDLED ERROR IN FUNCTION BODY !!!", {
      message: error.message,
      stack: error.stack?.substring(0, 500),
    });
    throw new functions.https.HttpsError(
      "internal",
      `Internal function error: ${error.message || "Unknown error"}`
    );
  } finally {
    console.log("--- updateUserStats END ---");
  }
});
