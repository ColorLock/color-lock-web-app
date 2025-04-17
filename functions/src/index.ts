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
      // Fallback for local testing if runtimeconfig doesn't exist
      logger.warn("Failed to load runtime config, using default allowed origins.");
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
  let decodedToken: admin.auth.DecodedIdToken | null = null;

  // 1. Check X-Forwarded-Authorization header first (coming from API Gateway)
  const forwardedAuthHeader = request.headers["x-forwarded-authorization"] as string || "";
  if (forwardedAuthHeader.startsWith("Bearer ")) {
    const userToken = forwardedAuthHeader.split("Bearer ")[1];
    try {
      decodedToken = await admin.auth().verifyIdToken(userToken);
      logger.info(`User ID from X-Forwarded-Authorization: ${decodedToken.uid}`);
      return decodedToken;
    } catch (error) {
      logger.warn("Failed to verify token from X-Forwarded-Authorization:", error);
    }
  }

  // 2. Check standard Authorization header (for direct emulator calls or other scenarios)
  const authHeader = request.headers.authorization || "";
  if (!decodedToken && authHeader.startsWith("Bearer ")) {
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
  if (!decodedToken && process.env.FUNCTIONS_EMULATOR === "true" && request.headers["x-emulator-user-id"]) {
    const userId = request.headers["x-emulator-user-id"] as string;
    logger.warn(`Emulator bypass: Using user ID from header: ${userId}`);
    // Return a mock DecodedIdToken for emulator testing
    // Ensure it has at least the 'uid' property
    return { uid: userId } as admin.auth.DecodedIdToken;
  }

  return null; // Return null if no valid auth method found
}

/**
 * Validate request origin
 */
async function validateOrigin(request: functions.https.Request): Promise<[boolean, string]> {
  const requestOrigin = request.headers.origin || "";
  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
  const isLocalhost = requestOrigin.startsWith("http://localhost:") || requestOrigin.startsWith("http://127.0.0.1:");

  if (ALLOWED_ORIGINS.includes(requestOrigin)) {
    return [true, requestOrigin];
  }

  if (isEmulator && isLocalhost) {
    logger.info(`Allowing request from emulator origin: ${requestOrigin}`);
    // Return the specific localhost origin for CORS header
    return [true, requestOrigin];
  }

  logger.warn(`Invalid origin detected: ${requestOrigin}. Allowed: ${ALLOWED_ORIGINS.join(", ")}`);
  // Return a default allowed origin for CORS headers even on failure,
  // but the request handler should still reject the request.
  return [false, ALLOWED_ORIGINS[0]];
}

/**
 * Firebase Cloud Function to fetch a puzzle by date (HTTPS Request)
 */
export const fetchPuzzle = functions.https.onRequest(async (request, response) => {
  // Origin validation is handled by API Gateway in production
  // For emulators, we might still need CORS headers if calling directly
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    const [, origin] = await validateOrigin(request);
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Emulator-User-Id");
    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }
  }

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
    const requestJson = request.body;
    if (!requestJson || !requestJson.date) {
      response.status(400).send({ success: false, error: "Date parameter is required" });
      return;
    }

    const date = requestJson.date;
    logger.info(`Attempting to fetch puzzle for date: ${date} for user: ${decodedToken.uid}`);

    const puzzleRef = db.collection("puzzles").doc(date);
    const puzzleSnap = await puzzleRef.get();

    if (puzzleSnap.exists) {
      logger.info("Puzzle found in Firestore");
      const puzzleData = puzzleSnap.data();

      if (!puzzleData || typeof puzzleData.algoScore !== "number" || !puzzleData.targetColor || !Array.isArray(puzzleData.states) || puzzleData.states.length === 0) {
        logger.error(`Invalid puzzle data found for date: ${date}`, puzzleData);
        response.status(500).send({ success: false, error: "Invalid puzzle data format found." });
        return;
      }

      response.status(200).send({ success: true, data: puzzleData });
    } else {
      logger.info(`No puzzle found for date: ${date}`);
      response.status(404).send({ success: false, error: `Puzzle not found for date: ${date}` });
    }
  } catch (error) {
    logger.error(`Error in fetchPuzzle for date ${request.body?.date}:`, error);
    response.status(500).send({ success: false, error: "Internal server error fetching puzzle" });
  }
});

// --- Interfaces for Stats ---
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
}

interface UserStatsSuccessResult {
  success: true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatedStats: any;
}

interface UserStatsErrorResult {
  success: false;
  error: string;
}

type UserStatsResult = UserStatsSuccessResult | UserStatsErrorResult;

/**
 * Helper function for updating daily scores
 */
async function updateDailyScore(userId: string, puzzleId: string, score: number): Promise<void> {
  const scoreDocRef = db.collection("dailyScores").doc(puzzleId).collection("scores").doc(userId);
  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(scoreDocRef);
      if (!snapshot.exists) {
        transaction.set(scoreDocRef, { score });
        logger.info(`Created new score document for user ${userId} with score ${score}`);
      } else {
        const currentScore = snapshot.data()?.score;
        if (typeof currentScore !== "number" || score < currentScore) {
          transaction.update(scoreDocRef, { score });
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
 * Process user stats update (Core Logic)
 */
async function processUserStatsUpdate(userId: string, data: UpdateUserStatsPayload): Promise<UserStatsResult> {
  const { eventType, puzzleId } = data;

  if (!["firstMove", "hint", "win", "loss", "tryAgain", "reconcileAbandonedMoves"].includes(eventType)) {
    logger.error(`Invalid eventType: ${eventType}`);
    return { success: false, error: "Invalid eventType." };
  }
  if (!puzzleId) {
    logger.error("Missing puzzleId in payload");
    return { success: false, error: "puzzleId is required" };
  }

  logger.info(`Processing ${eventType} event for user ${userId} on puzzle ${puzzleId}`);
  const userStatsRef = db.collection("userStats").doc(userId);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(userStatsRef);
      const stats = doc.exists ? doc.data() || {} : { /* Default stats structure */
        totalGamesPlayed: 0, totalWins: 0, totalMovesUsed: 0, totalHintsUsed: 0,
        currentStreak: 0, longestStreak: 0, lastStreakDate: null,
        firstTryStreak: 0, longestFirstTryStreak: 0, lastFirstTryStreakDate: null,
        playedDays: [], goalAchievedDays: [], winsPerDay: {}, bestScoresByDay: {},
        hintUsageByDay: {}, attemptsPerDay: {}, attemptsToAchieveBotScore: {},
      };

      // Ensure nested objects/arrays exist
      stats.playedDays = stats.playedDays || [];
      stats.goalAchievedDays = stats.goalAchievedDays || [];
      stats.winsPerDay = stats.winsPerDay || {};
      stats.bestScoresByDay = stats.bestScoresByDay || {};
      stats.hintUsageByDay = stats.hintUsageByDay || {};
      stats.attemptsPerDay = stats.attemptsPerDay || {};
      stats.attemptsToAchieveBotScore = stats.attemptsToAchieveBotScore || {};

      // --- Event Processing Logic ---
      if (eventType === "firstMove") {
        stats.attemptsPerDay[puzzleId] = (stats.attemptsPerDay[puzzleId] || 0) + 1;
        if (!stats.playedDays.includes(puzzleId)) {
          stats.playedDays = [...stats.playedDays, puzzleId];
          stats.totalGamesPlayed = (stats.totalGamesPlayed || 0) + 1;
        }
        if (stats.hintUsageByDay[puzzleId] === undefined) {
          stats.hintUsageByDay[puzzleId] = 0;
        }
      } else if (eventType === "hint") {
        const hintsToAdd = data.hintsUsedInGame || 1;
        stats.totalHintsUsed = (stats.totalHintsUsed || 0) + hintsToAdd;
        stats.hintUsageByDay[puzzleId] = (stats.hintUsageByDay[puzzleId] || 0) + hintsToAdd;
      } else if (eventType === "win") {
        const { userScore, algoScore, movesUsedInGame, isFirstTryOfDay } = data;
        if (userScore === undefined || algoScore === undefined || movesUsedInGame === undefined || isFirstTryOfDay === undefined) {
          throw new Error("Missing required win event data");
        }
        stats.totalWins = (stats.totalWins || 0) + 1;
        stats.totalMovesUsed = (stats.totalMovesUsed || 0) + movesUsedInGame;
        stats.winsPerDay[puzzleId] = (stats.winsPerDay[puzzleId] || 0) + 1;

        const goalMet = userScore <= algoScore;
        const firstTimeMeetingGoal = !stats.goalAchievedDays.includes(puzzleId);

        if (goalMet) {
          if (firstTimeMeetingGoal) {
            stats.goalAchievedDays = [...stats.goalAchievedDays, puzzleId];
            // Update regular streak
            const today = new Date();
            const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split("T")[0];
            if (stats.lastStreakDate === yesterdayStr) {
              stats.currentStreak = (stats.currentStreak || 0) + 1;
            } else if (stats.lastStreakDate !== puzzleId) {
              stats.currentStreak = 1;
            }
            if (stats.currentStreak > (stats.longestStreak || 0)) {
              stats.longestStreak = stats.currentStreak;
            }
            stats.lastStreakDate = puzzleId;
          }
          // Update first try streak
          if (isFirstTryOfDay) {
            const today = new Date();
            const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split("T")[0];
            if (stats.lastFirstTryStreakDate === yesterdayStr) {
              stats.firstTryStreak = (stats.firstTryStreak || 0) + 1;
            } else if (stats.lastFirstTryStreakDate !== puzzleId) {
              stats.firstTryStreak = 1;
            }
            if (stats.firstTryStreak > (stats.longestFirstTryStreak || 0)) {
              stats.longestFirstTryStreak = stats.firstTryStreak;
            }
            stats.lastFirstTryStreakDate = puzzleId;
          } else {
            stats.firstTryStreak = 0;
          }
        } else {
          stats.firstTryStreak = 0; // Reset if goal not met
        }

        // Update best score and attemptsToAchieveBotScore
        if (!stats.bestScoresByDay[puzzleId] || userScore < stats.bestScoresByDay[puzzleId]) {
          stats.bestScoresByDay[puzzleId] = userScore;
          if (goalMet && userScore === algoScore) {
            stats.attemptsToAchieveBotScore[puzzleId] = stats.attemptsPerDay[puzzleId] || 1;
          }
          // Update daily scores leaderboard
          await updateDailyScore(userId, puzzleId, userScore);
        }
      } else if (eventType === "loss" || eventType === "tryAgain") {
        const movesToAdd = data.movesUsedInGame || 0;
        if (movesToAdd > 0) {
          stats.totalMovesUsed = (stats.totalMovesUsed || 0) + movesToAdd;
        }
      } else if (eventType === "reconcileAbandonedMoves") {
        const movesToAdd = data.movesToAdd || 0;
        if (movesToAdd > 0) {
          stats.totalMovesUsed = (stats.totalMovesUsed || 0) + movesToAdd;
        }
      }
      // --- End Event Processing ---

      transaction.set(userStatsRef, stats, { merge: true });
      logger.info(`Successfully updated stats for user ${userId} after ${eventType} event.`);
      return { success: true as const, updatedStats: stats };
    });
    return result;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error running transaction for user ${userId} on event ${eventType}:`, error);
    return { success: false, error: `Failed to update user stats: ${errorMessage}` };
  }
}

// --- HTTP Request Functions (Keep these) ---

/**
 * HTTP function to update user stats (Called by API Gateway)
 */
export const updateUserStatsHttp = functions.https.onRequest(async (req, res) => {
  // Origin validation is handled by API Gateway in production
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    const [, origin] = await validateOrigin(req);
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Emulator-User-Id");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
  }

  if (req.method !== "POST") {
    res.status(405).send({ success: false, error: "Method Not Allowed" });
    return;
  }

  const decodedToken = await isAuthorizedRequest(req);
  if (!decodedToken) {
    res.status(401).send({ success: false, error: "Unauthorized" });
    return;
  }

  try {
    const userId = decodedToken.uid;
    const data = req.body as UpdateUserStatsPayload;
    if (!data || !data.eventType || !data.puzzleId) {
      res.status(400).send({ success: false, error: "Missing required fields" });
      return;
    }
    logger.info(`HTTP updateUserStats called with eventType: ${data.eventType} for user: ${userId}`);
    const result = await processUserStatsUpdate(userId, data);
    if (result.success) {
      res.status(200).send(result);
    } else {
      res.status(500).send(result);
    }
  } catch (error: any) {
    logger.error("HTTP updateUserStats error:", error);
    res.status(500).send({ success: false, error: error.message || "Internal Server Error" });
  }
});

/**
 * HTTP function to get user stats (Called by API Gateway)
 */
export const getUserStatsHttp = functions.https.onRequest(async (req, res) => {
  // Origin validation is handled by API Gateway in production
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    const [, origin] = await validateOrigin(req);
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS"); // Allow POST
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Emulator-User-Id");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
  }

  if (req.method !== "POST") { // Expect POST based on frontend
    res.status(405).send({ success: false, error: "Method Not Allowed" });
    return;
  }

  const decodedToken = await isAuthorizedRequest(req);
  if (!decodedToken) {
    res.status(401).send({ success: false, error: "Unauthorized" });
    return;
  }

  try {
    const userId = decodedToken.uid;
    const userStatsRef = db.collection("userStats").doc(userId);
    const docSnap = await userStatsRef.get();
    let statsToSend;
    if (docSnap.exists) {
      logger.info(`HTTP: Fetched stats for user ${userId}`);
      statsToSend = docSnap.data();
    } else {
      logger.info(`HTTP: No stats found for user ${userId}, returning default`);
      statsToSend = { /* Default stats structure */
        attemptsPerDay: {}, bestScoresByDay: {}, currentStreak: 0, goalAchievedDays: [],
        hintUsageByDay: {}, lastStreakDate: null, longestStreak: 0, playedDays: [],
        totalGamesPlayed: 0, totalHintsUsed: 0, totalMovesUsed: 0, totalWins: 0,
        winsPerDay: {}, firstTryStreak: 0, longestFirstTryStreak: 0,
        lastFirstTryStreakDate: null, attemptsToAchieveBotScore: {},
      };
    }
    res.status(200).json({ success: true, stats: statsToSend });
  } catch (error: any) {
    logger.error(`HTTP: Error fetching stats for user ${decodedToken.uid || "unknown"}:`, error);
    res.status(500).json({ success: false, error: error.message || "Internal Server Error" });
  }
});

/**
 * HTTP function to get daily scores stats (Called by API Gateway)
 */
export const getDailyScoresStatsHttp = functions.https.onRequest(async (req, res) => {
  // Origin validation is handled by API Gateway in production
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    const [, origin] = await validateOrigin(req);
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Emulator-User-Id");
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
  }

  if (req.method !== "POST") {
    res.status(405).send({ success: false, error: "Method Not Allowed" });
    return;
  }

  const decodedToken = await isAuthorizedRequest(req);
  if (!decodedToken) {
    // Allow unauthenticated access *only* for this specific function if needed,
    // otherwise enforce authentication like others. For now, let's enforce it.
    res.status(401).send({ success: false, error: "Unauthorized" });
    return;
  }

  try {
    const data = req.body as DailyScoresStatsRequest;
    const puzzleId = data.puzzleId;
    if (!puzzleId) {
      res.status(400).send({ success: false, error: "puzzleId is required" });
      return;
    }

    logger.info(`HTTP getDailyScoresStats called with puzzleId: ${puzzleId}`);
    const scoresRef = db.collection("dailyScores").doc(puzzleId).collection("scores");
    const scoresSnapshot = await scoresRef.get();

    if (scoresSnapshot.empty) {
      res.status(200).send({
        success: true,
        stats: { lowestScore: null, averageScore: null, totalPlayers: 0, playersWithLowestScore: 0 },
      });
      return;
    }

    const allScores: number[] = [];
    scoresSnapshot.forEach((doc) => {
      const scoreData = doc.data();
      if (scoreData && typeof scoreData.score === "number") {
        allScores.push(scoreData.score);
      }
    });

    if (allScores.length === 0) {
      res.status(200).send({
        success: true,
        stats: { lowestScore: null, averageScore: null, totalPlayers: 0, playersWithLowestScore: 0 },
      });
      return;
    }

    const lowestScore = Math.min(...allScores);
    const averageScore = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
    const totalPlayers = allScores.length;
    const playersWithLowestScore = allScores.filter((score) => score === lowestScore).length;

    res.status(200).send({
      success: true,
      stats: { lowestScore, averageScore, totalPlayers, playersWithLowestScore },
    });
  } catch (error: any) {
    logger.error("HTTP getDailyScoresStats error:", error);
    res.status(500).send({ success: false, error: error.message || "Internal Server Error" });
  }
});
