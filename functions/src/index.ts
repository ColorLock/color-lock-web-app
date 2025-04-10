import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

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
      const configPath = path.resolve(__dirname, '../.runtimeconfig.json');
      const configFile = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configFile);
    } catch (error) {
      return {
        security: {
          allowed_origins: "https://colorlock.xyz,https://colorlock.netlify.app,http://localhost:3000,http://127.0.0.1:3000"
        }
      };
    }
  }
}

// Get configuration
const config = getConfig();
const ALLOWED_ORIGINS = config.security.allowed_origins.split(',');

/**
 * Validate a Firebase Auth token
 */
async function validateAuthToken(token: string): Promise<admin.auth.DecodedIdToken | null> {
  if (!token) {
    logger.warn('No token provided');
    return null;
  }
  
  try {
    // Verify the token using Firebase Auth
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Check token is not expired
    const currentTime = Math.floor(Date.now() / 1000);
    if ((decodedToken.exp || 0) < currentTime) {
      logger.warn('Token has expired');
      return null;
    }
    
    // Additional validation can be added here if needed
    
    return decodedToken;
  } catch (error) {
    logger.error('Error validating auth token:', error);
    return null;
  }
}

/**
 * Determine if a request is authorized via auth token (for both prod and local dev)
 */
async function isAuthorizedRequest(request: functions.https.Request): Promise<admin.auth.DecodedIdToken | null> {
  const authHeader = request.headers.authorization || '';
  
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    return await validateAuthToken(token);
  }
  
  // Allow special header for emulator testing without full auth
  if (process.env.FUNCTIONS_EMULATOR === 'true' && request.headers['x-emulator-user-id']) {
      const userId = request.headers['x-emulator-user-id'] as string;
      logger.warn(`Emulator bypass: Using user ID from header: ${userId}`);
      // Return a mock DecodedIdToken for emulator testing
      return { uid: userId } as admin.auth.DecodedIdToken;
  }
  
  return null;
}

/**
 * Validate request origin and authentication
 */
async function validateOriginAndAuth(request: functions.https.Request): Promise<[boolean, string]> {
  // Get the request origin
  const requestOrigin = request.headers.origin || '';
  
  // Origin validation
  const originValid = ALLOWED_ORIGINS.includes(requestOrigin);
  
  // Local dev validation with service account
  const isLocalhost = requestOrigin.startsWith('http://localhost:') || 
                      requestOrigin.startsWith('http://127.0.0.1:');
  let isAuthorizedLocal = false;
  
  // Allow localhost in development/emulator environment
  if (isLocalhost && process.env.FUNCTIONS_EMULATOR === 'true') {
      logger.info(`Allowing request from emulator origin: ${requestOrigin}`);
      return [true, requestOrigin];
  }
  
  // Return validation result with appropriate origin for CORS
  if (originValid || isAuthorizedLocal) {
    return [true, originValid ? requestOrigin : ALLOWED_ORIGINS[0]];
  }
  
  logger.warn(`Invalid origin detected: ${requestOrigin}. Allowed: ${ALLOWED_ORIGINS.join(', ')}`);
  return [false, ALLOWED_ORIGINS[0]]; // Return a default allowed origin for CORS headers even on failure
}

/**
 * Create and return proper CORS headers
 */
function setCorsHeaders(origin: string, requestMethod: string = 'GET'): Record<string, string> {
  // Ensure origin is one of the allowed ones, or the first allowed one as default
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  if (requestMethod === 'OPTIONS') {
    return {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Emulator-User-Id', // Allow custom header
      'Access-Control-Max-Age': '3600'
    };
  } else {
    return {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Content-Type': 'application/json'
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
    response.status(403).set(setCorsHeaders(origin)).send({
      success: false,
      error: "Forbidden: Invalid origin"
    });
    return;
  }
  
  // Set CORS headers for the preflight request
  if (request.method === 'OPTIONS') {
    response.status(204).set(setCorsHeaders(origin, 'OPTIONS')).end();
    return;
  }
  
  // Set CORS headers for the main request
  response.set(setCorsHeaders(origin));
  
  // Validate authorization
  const decodedToken = await isAuthorizedRequest(request);
  if (!decodedToken) {
    response.status(401).send({
      success: false,
      error: "Unauthorized: Valid Firebase Auth token or emulator header required"
    });
    return;
  }
  
  try {
    // Extract the date from the request data
    const requestJson = request.body;
    if (!requestJson || !requestJson.date) {
      response.status(400).send({
        success: false,
        error: "Date parameter is required"
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
      if (!puzzleData || typeof puzzleData.algoScore !== 'number' || !puzzleData.targetColor || !Array.isArray(puzzleData.states) || puzzleData.states.length === 0) {
        logger.error(`Invalid puzzle data found for date: ${date}`, puzzleData);
        response.status(500).send({
          success: false,
          error: "Invalid puzzle data format found."
        });
        return;
      }
      
      response.status(200).send({
        success: true,
        data: puzzleData
      });
    } else {
      logger.info(`No puzzle found for date: ${date}`);
      response.status(404).send({
        success: false,
        error: `Puzzle not found for date: ${date}`
      });
    }
  } catch (error) {
    logger.error(`Error in fetchPuzzle for date ${request.body?.date}:`, error);
    response.status(500).send({
      success: false,
      error: 'Internal server error fetching puzzle'
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
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- Interface for the updateUserStats payload ---
interface UpdateUserStatsPayload {
  eventType: 'firstMove' | 'hint' | 'win' | 'loss' | 'tryAgain' | 'reconcileAbandonedMoves';
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

// --- REFACTORED: updateUserStats Function ---
export const updateUserStats = functions.https.onCall(async (request) => {
  console.log('--- updateUserStats START ---');
  try {
    const requestData = request.data;
    logger.info('[updateUserStats] Raw requestData:', JSON.stringify(requestData || null));
    
    let userId: string;
    const auth = request.auth;
    
    // Check for auth
    if (auth?.uid) {
      // Standard case: Auth context and UID are present
      userId = auth.uid;
      logger.info(`[updateUserStats] Auth context present. User ID: ${userId}`);
    } else {
      // Auth context or UID is missing
      logger.warn("[updateUserStats] Auth context or UID is missing.");
      // Check if running in the emulator
      if (process.env.FUNCTIONS_EMULATOR === 'true') {
        logger.warn("[updateUserStats] Running in emulator and auth context/UID missing. Using placeholder UID for guest user.");
        // Assign a placeholder UID specifically for emulator testing with anonymous users
        userId = 'emulator-guest-user-' + Date.now(); // Or a fixed one like 'emulator-guest' if you prefer
        logger.info(`[updateUserStats] Assigned placeholder User ID: ${userId}`);
      } else {
        // Not in emulator, and auth/UID is missing - this is a real error
        logger.error("[updateUserStats] FATAL: auth.uid is missing outside emulator!");
        throw new functions.https.HttpsError('unauthenticated', 'User ID (uid) is required and missing.');
      }
    }

    // Now userId is guaranteed to be set (either real or placeholder in emulator)
    logger.info(`[updateUserStats] Processing for effective User ID: ${userId}`);

    const data = requestData as unknown as UpdateUserStatsPayload;
    const today = getServersideLocalDateString(); // Use server's local date

    logger.info(`[updateUserStats] Processing eventType: ${data.eventType}, puzzleId: ${data.puzzleId}`);

    // 2. Input Validation (use 'data' directly now)
    if (!data.eventType || !data.puzzleId) {
       logger.error("Missing eventType or puzzleId in request", data);
       throw new functions.https.HttpsError('invalid-argument', 'eventType and puzzleId are required.');
    }
    if (data.puzzleId !== today && ['firstMove', 'hint', 'win', 'loss', 'tryAgain'].includes(data.eventType)) {
        logger.warn(`Received event for a past puzzleId (${data.puzzleId}) while today is ${today}. Processing anyway.`);
        // Allow processing for past dates if necessary, but log it.
    }

    const dateKey = data.puzzleId; // Use the date from the payload for map keys
    const userStatsRef = db.collection('userStats').doc(userId); // Use the determined userId
    logger.info(`[updateUserStats] Starting Firestore transaction for document: userStats/${userId}`);

    // 3. Firestore Transaction
    const updatedStats = await db.runTransaction(async (transaction) => {
      logger.info(`[updateUserStats] Transaction started`);
      const userStatsSnap = await transaction.get(userStatsRef);
      let statsData: Record<string, any>; // Use Record<string, any> for flexibility

      // Initialize stats if document doesn't exist
      if (!userStatsSnap.exists) {
        logger.info(`[updateUserStats] Initializing stats for new user: ${userId}`);
        statsData = {
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
          // Add any other fields from your type definition with default values
        };
      } else {
        statsData = userStatsSnap.data() as Record<string, any>;
        // Ensure all necessary maps/arrays exist to prevent runtime errors
        statsData.attemptsPerDay = statsData.attemptsPerDay || {};
        statsData.bestScoresByDay = statsData.bestScoresByDay || {};
        statsData.goalAchievedDays = statsData.goalAchievedDays || [];
        statsData.hintUsageByDay = statsData.hintUsageByDay || {};
        statsData.playedDays = statsData.playedDays || [];
        statsData.winsPerDay = statsData.winsPerDay || {};
        statsData.attemptsToAchieveBotScore = statsData.attemptsToAchieveBotScore || {};
        // Initialize potentially missing fields from older schemas
        statsData.currentStreak = statsData.currentStreak ?? 0;
        statsData.longestStreak = statsData.longestStreak ?? 0;
        statsData.totalGamesPlayed = statsData.totalGamesPlayed ?? 0;
        statsData.totalHintsUsed = statsData.totalHintsUsed ?? 0;
        statsData.totalMovesUsed = statsData.totalMovesUsed ?? 0;
        statsData.totalWins = statsData.totalWins ?? 0;
        statsData.firstTryStreak = statsData.firstTryStreak ?? 0;
        statsData.longestFirstTryStreak = statsData.longestFirstTryStreak ?? 0;
        statsData.lastStreakDate = statsData.lastStreakDate ?? null;
        statsData.lastFirstTryStreakDate = statsData.lastFirstTryStreakDate ?? null;
      }

      let gameAlreadyCountedToday = false; // Flag to prevent double counting games/attempts per event

      // 4. Update Stats Based on Event Type
      logger.info(`[updateUserStats] Processing eventType: ${data.eventType} for dateKey: ${dateKey}`);
      
      switch (data.eventType) {
        case 'firstMove':
          if (!statsData.playedDays.includes(dateKey)) {
            statsData.playedDays.push(dateKey);
            // Initialize attempts for the day if it's the first time playing today
             statsData.attemptsPerDay[dateKey] = 0;
             logger.info(`[updateUserStats] First move of the day recorded for ${dateKey}`);
          } else {
             logger.info(`[updateUserStats] User already played today, first move event ignored`);
          }
          // Increment attemptsPerDay here when the user makes their first move of an attempt
          statsData.attemptsPerDay[dateKey] = (statsData.attemptsPerDay[dateKey] || 0) + 1;
          logger.info(`[updateUserStats] Attempt started. attemptsPerDay[${dateKey}] incremented to ${statsData.attemptsPerDay[dateKey]}`);
          
          // Increment totalGamesPlayed when user makes first move of a new attempt
          statsData.totalGamesPlayed = (statsData.totalGamesPlayed || 0) + 1;
          logger.info(`[updateUserStats] First move of attempt recorded. totalGamesPlayed incremented to ${statsData.totalGamesPlayed}`);
          
          // Don't increment totalMovesUsed here, wait for win/loss/tryAgain or hint
          break;

        case 'hint':
          // Increment hints used for the day and total
          const hintsToAdd = data.hintsUsedInGame === undefined ? 1 : data.hintsUsedInGame; // Default to 1 if not provided
          statsData.hintUsageByDay[dateKey] = (statsData.hintUsageByDay[dateKey] || 0) + hintsToAdd;
          statsData.totalHintsUsed = (statsData.totalHintsUsed || 0) + hintsToAdd;
          logger.info(`[updateUserStats] Hint event processed. Added ${hintsToAdd} hint(s). totalHintsUsed: ${statsData.totalHintsUsed}, hintUsageByDay[${dateKey}]: ${statsData.hintUsageByDay[dateKey]}. Moves NOT incremented here.`);
          break;

        case 'win':
        case 'loss':
        case 'tryAgain':
          // These events signify the end of an attempt or game session
          logger.info(`[updateUserStats] Processing end-of-attempt event: ${data.eventType}`);

          // Ensure required fields exist for 'win'
          if (data.eventType === 'win' && (data.userScore === undefined || data.algoScore === undefined || data.isFirstTryOfDay === undefined || data.attemptNumberToday === undefined)) {
            logger.error("Missing required data for 'win' event", data);
            throw new functions.https.HttpsError('invalid-argument', 'Missing score/attempt data for win event.');
          }

          // Increment total moves used *by the amount reported from the client for this attempt*
          statsData.totalMovesUsed = (statsData.totalMovesUsed || 0) + (data.movesUsedInGame || 0);
          logger.info(`[updateUserStats] Added ${data.movesUsedInGame || 0} moves, totalMovesUsed now: ${statsData.totalMovesUsed}`);

          // *** DO NOT INCREMENT HINTS HERE ***
          // Hint counts are handled *only* by the 'hint' event to prevent double counting,
          // especially with autocomplete scenarios. The data.hintsUsedInGame from the client
          // for win/loss/tryAgain events is ignored for hint counting purposes.

          // DO NOT increment attemptsPerDay here anymore - moved to firstMove event
          
          // DO NOT increment totalGamesPlayed here anymore - moved to firstMove event
          
          if (!statsData.playedDays.includes(dateKey)) {
            statsData.playedDays.push(dateKey);
            logger.info(`[updateUserStats] Added ${dateKey} to playedDays list`);
          }

          // Handle Win-Specific Logic
          if (data.eventType === 'win') {
            const userScore = data.userScore!;
            const algoScore = data.algoScore!;
            logger.info(`[updateUserStats] Processing win event with userScore: ${userScore}, algoScore: ${algoScore}`);

            // Update best score for the day
            if (statsData.bestScoresByDay[dateKey] === undefined || userScore < statsData.bestScoresByDay[dateKey]) {
              statsData.bestScoresByDay[dateKey] = userScore;
              logger.info(`[updateUserStats] New best score for ${dateKey}: ${userScore}`);
            }

            // Check if goal achieved
            if (userScore <= algoScore) {
              statsData.totalWins = (statsData.totalWins || 0) + 1;
              statsData.winsPerDay[dateKey] = (statsData.winsPerDay[dateKey] || 0) + 1;
              if (!statsData.goalAchievedDays.includes(dateKey)) {
                statsData.goalAchievedDays.push(dateKey);
                logger.info(`[updateUserStats] Goal achieved for ${dateKey}, totalWins now: ${statsData.totalWins}`);
              }

              // --- Streak Calculation ---
              const yesterday = new Date(dateKey); // Use puzzle date for calculation
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().split('T')[0];

              if (statsData.lastStreakDate === yesterdayStr) {
                statsData.currentStreak = (statsData.currentStreak || 0) + 1; // Continue streak
                logger.info(`[updateUserStats] Continued streak: ${statsData.currentStreak}`);
              } else if (statsData.lastStreakDate !== dateKey) {
                statsData.currentStreak = 1; // Start new streak
                logger.info(`[updateUserStats] Started new streak`);
              } // If lastStreakDate === dateKey, streak already updated today, do nothing.
              statsData.lastStreakDate = dateKey;
              statsData.longestStreak = Math.max(statsData.longestStreak || 0, statsData.currentStreak);
              // --- End Streak ---

              // --- Set AttemptsToAchieveBotScore (ONLY ONCE per day) ---
              // Check if it hasn't been set for this day yet
              if (statsData.attemptsToAchieveBotScore[dateKey] === undefined) {
                // Use the current attempt count FOR THE DAY from the backend state
                // Default to 1 if attemptsPerDay somehow isn't set yet (shouldn't happen with firstMove logic)
                const attemptsToday = statsData.attemptsPerDay[dateKey] || 1;
                statsData.attemptsToAchieveBotScore[dateKey] = attemptsToday;
                logger.info(`[updateUserStats] Goal achieved for the first time today (${dateKey}). Setting attemptsToAchieveBotScore to ${attemptsToday} (from attemptsPerDay)`);
              } else {
                logger.info(`[updateUserStats] Goal achieved again for ${dateKey}, attemptsToAchieveBotScore already set to ${statsData.attemptsToAchieveBotScore[dateKey]}.`);
              }

              // --- First Try Streak (Still needs client data: data.isFirstTryOfDay) ---
              if (data.isFirstTryOfDay) {
                 // Calculate first try streak
                 if (statsData.lastFirstTryStreakDate === yesterdayStr) {
                    statsData.firstTryStreak = (statsData.firstTryStreak || 0) + 1;
                    logger.info(`[updateUserStats] Continued first try streak: ${statsData.firstTryStreak}`);
                 } else if (statsData.lastFirstTryStreakDate !== dateKey) {
                    statsData.firstTryStreak = 1;
                    logger.info(`[updateUserStats] Started new first try streak`);
                 } // If lastFirstTryStreakDate === dateKey, already updated today.
                 statsData.lastFirstTryStreakDate = dateKey;
                 statsData.longestFirstTryStreak = Math.max(statsData.longestFirstTryStreak || 0, statsData.firstTryStreak);
              } else {
                 // If it wasn't the first try but was a win, reset the first try streak *if* the last date wasn't today
                 if (statsData.lastFirstTryStreakDate !== dateKey) {
                    statsData.firstTryStreak = 0;
                    logger.info(`[updateUserStats] Reset first try streak (not first attempt)`);
                 }
              }
              // --- End First Try ---
            } else {
              // Win event, but score > algoScore (Goal NOT achieved)
              // Reset streaks if the last streak date wasn't today
               if (statsData.lastStreakDate !== dateKey) {
                   statsData.currentStreak = 0;
                   logger.info(`[updateUserStats] Reset current streak (win but didn't achieve goal)`);
               }
               if (statsData.lastFirstTryStreakDate !== dateKey) {
                   statsData.firstTryStreak = 0;
                   logger.info(`[updateUserStats] Reset first try streak (win but didn't achieve goal)`);
               }
            }
          } else {
            // Loss or TryAgain event - reset streaks if applicable
             if (statsData.lastStreakDate !== dateKey) {
                 statsData.currentStreak = 0;
                 logger.info(`[updateUserStats] Reset current streak (loss/tryAgain)`);
             }
             if (statsData.lastFirstTryStreakDate !== dateKey) {
                 statsData.firstTryStreak = 0;
                 logger.info(`[updateUserStats] Reset first try streak (loss/tryAgain)`);
             }
          }
          break;

        case 'reconcileAbandonedMoves':
          const movesToAdd = data.movesToAdd || 0;
          if (movesToAdd > 0) {
            statsData.totalMovesUsed = (statsData.totalMovesUsed || 0) + movesToAdd;
            // Ensure day is marked as played if somehow the firstMove failed before
            if (!statsData.playedDays.includes(dateKey)) {
              statsData.playedDays.push(dateKey);
              logger.info(`[updateUserStats] Added ${dateKey} to playedDays list (triggered by reconcile)`);
            }
            logger.info(`[updateUserStats] Reconciled ${movesToAdd} abandoned moves for ${dateKey}. totalMovesUsed: ${statsData.totalMovesUsed}`);
          } else {
            logger.warn(`[updateUserStats] Received reconcile event with 0 movesToAdd for ${dateKey}. Ignoring.`);
          }
          // DO NOT increment totalGamesPlayed or attemptsPerDay here
          break;

        default:
          logger.warn(`Unknown eventType received: ${data.eventType}`);
          break;
      }

      // 5. Update Firestore Document in Transaction
      logger.info(`[updateUserStats] Updating Firestore document for user ${userId}`);
      if (userStatsSnap.exists) {
        transaction.update(userStatsRef, statsData);
        logger.info(`[updateUserStats] Updated existing stats document`);
      } else {
        transaction.set(userStatsRef, statsData);
        logger.info(`[updateUserStats] Created new stats document`);
      }

      return statsData; // Return the updated stats
    });
    
    // 6. Update Daily Score (outside transaction, but after success)
    if (data.eventType === 'win' && data.userScore !== undefined) {
        try {
            logger.info(`[updateUserStats] Updating daily score for user ${userId} on puzzle ${data.puzzleId} with score ${data.userScore}`);
            await updateDailyScore(userId, data.puzzleId, data.userScore);
            logger.info(`[updateUserStats] Successfully updated daily score for user ${userId} on puzzle ${data.puzzleId}`);
        } catch (scoreError) {
            logger.error(`[updateUserStats] Failed to update daily score for user ${userId} on puzzle ${data.puzzleId}`, scoreError);
            // Don't fail the whole function, but log the error.
        }
    }

    logger.info(`[updateUserStats] Successfully processed event ${data.eventType} for user ${userId}`);
    return { success: true, updatedStats }; // Return the updated stats

  } catch (error: any) {
    logger.error('[updateUserStats] !!! UNHANDLED ERROR IN FUNCTION BODY !!!', {
         message: error.message,
         code: error.code,
         details: error.details,
         stack: error.stack?.substring(0, 500)
    });
    throw new functions.https.HttpsError(
         'internal',
         `Internal function error: ${error.message || 'Unknown error'}`
    );
  } finally {
      console.log('--- updateUserStats END ---');
  }
});

// --- NEW: Function to fetch user stats ---
export const getUserStats = functions.https.onCall(async (data, context) => {
    const authContext = context as any;
    if (!authContext?.auth) {
        // Allowing emulator calls without full auth for local testing
        if (process.env.FUNCTIONS_EMULATOR !== 'true') {
            logger.error("Unauthenticated call to getUserStats outside emulator.");
            throw new functions.https.HttpsError(
                'unauthenticated',
                'The function must be called while authenticated.'
            );
        }
        logger.warn("Emulator: getUserStats called without auth context.");
        if (!authContext?.auth?.uid) {
            logger.error("Emulator Error: No UID provided in auth context for getUserStats.");
            throw new functions.https.HttpsError('invalid-argument', 'User ID is required.');
        }
    }

    const userId = authContext.auth.uid;
    const userStatsRef = db.collection('userStats').doc(userId);

    try {
        const docSnap = await userStatsRef.get();
        if (docSnap.exists) {
            logger.info(`Fetched stats for user ${userId}`);
            return { success: true, stats: docSnap.data() };
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
                }
            };
        }
    } catch (error: any) {
        logger.error(`Error fetching stats for user ${userId}:`, error);
        throw new functions.https.HttpsError(
            'internal',
            `Error fetching user stats: ${error.message || 'Unknown error'}`
        );
    }
});

// Add HTTP endpoint for getUserStats that handles CORS
export const getUserStatsHttp = functions.https.onRequest(async (req, res) => {
    // Validate origin and get CORS headers
    const [isValid, origin] = await validateOriginAndAuth(req);
    if (!isValid) {
        res.status(403).set(setCorsHeaders(origin)).send({ success: false, error: "Forbidden: Invalid origin" });
        return;
    }
    if (req.method === 'OPTIONS') {
        res.status(204).set(setCorsHeaders(origin, 'OPTIONS')).end();
        return;
    }
    res.set(setCorsHeaders(origin)); // Set CORS for the main request

    if (req.method !== 'POST') { // Typically stats requests might be GET, but POST is fine if you expect a body later
        res.status(405).send({ success: false, error: 'Method Not Allowed' });
        return;
    }

    let userId: string | null = null;
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

    try {
        // 1. Try verifying Auth token from header
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            try {
                const decodedToken = await admin.auth().verifyIdToken(idToken);
                userId = decodedToken.uid;
                logger.info(`HTTP: User identified via Auth token: ${userId}`);
            } catch (tokenError: any) {
                logger.warn(`HTTP: Auth token verification failed: ${tokenError.message}. Checking emulator header.`);
                // Token invalid or expired, proceed to check emulator header
            }
        } else {
             logger.info(`HTTP: No Authorization header found. Checking emulator header.`);
        }

        // 2. If no user from token AND in emulator, check emulator header
        if (!userId && isEmulator && req.headers['x-emulator-user-id']) {
            userId = req.headers['x-emulator-user-id'] as string;
            logger.warn(`HTTP: Emulator bypass: Using user ID from header: ${userId}`);
        }

        // 3. If still no userId, handle error
        if (!userId) {
            logger.error("HTTP: Could not determine User ID from token or emulator header.");
            // Send 401 Unauthorized if no user could be identified
            res.status(401).send({ success: false, error: 'Unauthorized: User ID could not be determined.' });
            return;
        }

        // 4. Fetch user stats using the determined userId
        const userStatsRef = db.collection('userStats').doc(userId);
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
        res.status(200).json({ success: true, stats: statsToSend });

    } catch (error: any) {
        logger.error(`HTTP: Error fetching stats for user ${userId || 'unknown'}:`, error);
        res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    }
});

/**
 * Helper function for updating daily scores
 */
async function updateDailyScore(userId: string, puzzleId: string, score: number): Promise<void> {
  const scoreDocRef = db.collection('dailyScores').doc(puzzleId).collection('scores').doc(userId);
  
  try {
    // Use transactions to handle concurrent updates safely
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(scoreDocRef);
      
      if (!snapshot.exists) {
        // Create a new score document for this user
        transaction.set(scoreDocRef, { score });
        logger.info(`Created new score document for user ${userId} with score ${score}`);
      } else {
        // Only update if the new score is better (lower)
        const currentScore = snapshot.data()?.score;
        if (typeof currentScore !== 'number' || score < currentScore) {
          transaction.update(scoreDocRef, { score });
          logger.info(`Updated score for user ${userId} from ${currentScore} to ${score}`);
        } else {
          logger.info(`Kept existing better score ${currentScore} for user ${userId} (new score: ${score})`);
        }
      }
    });
    
    logger.info(`Successfully updated daily score for user ${userId}`);
  } catch (error) {
    logger.error('Error updating daily score:', error);
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
      'invalid-argument',
      'puzzleId is required'
    );
  }
  
  logger.info(`getDailyScoresStats called with puzzleId: ${puzzleId}`);
  
  try {
    // Access the scores subcollection
    const scoresRef = db.collection('dailyScores').doc(puzzleId).collection('scores');
    const scoresSnapshot = await scoresRef.get();
    
    logger.info(`Found ${scoresSnapshot.size} documents in scores subcollection`);
    
    if (scoresSnapshot.empty) {
      logger.warn('No scores found in subcollection');
      
      // Return empty stats
      return {
        success: true,
        stats: {
          lowestScore: null,
          averageScore: null,
          totalPlayers: 0,
          playersWithLowestScore: 0
        }
      };
    }
    
    // Extract scores from documents
    const allScores: number[] = [];
    const invalidDocs: string[] = [];
    
    scoresSnapshot.forEach(doc => {
      const scoreData = doc.data();
      
      if (scoreData && typeof scoreData.score === 'number') {
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
      logger.warn('No valid scores extracted, returning null stats');
      return {
        success: true,
        stats: {
          lowestScore: null,
          averageScore: null,
          totalPlayers: 0,
          playersWithLowestScore: 0
        }
      };
    }
    
    // Calculate stats
    const lowestScore = Math.min(...allScores);
    const averageScore = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
    const totalPlayers = allScores.length;
    const playersWithLowestScore = allScores.filter(score => score === lowestScore).length;
    
    logger.info('Stats calculated:', {
      lowestScore,
      averageScore,
      totalPlayers,
      playersWithLowestScore
    });
    
    return {
      success: true,
      stats: {
        lowestScore,
        averageScore,
        totalPlayers,
        playersWithLowestScore
      }
    };
  } catch (error) {
    logger.error('Error getting daily scores:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Error getting daily scores: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});