import * as admin from "firebase-admin";
import { logger as v2Logger } from "firebase-functions/v2";
import { LeaderboardEntry, GameStatistics } from "../../src/types/stats"; // Adjust path if needed based on your structure

const logger = v2Logger;

/**
 * Performs the global leaderboard calculation and updates Firestore.
 * @param db Firestore Admin SDK instance.
 */
export async function performGlobalLeaderboardCalculation(db: admin.firestore.Firestore): Promise<{ processedCount: number, committedCount: number }> {
    logger.info("Starting global leaderboard calculation via Admin SDK...");
    const usersSnapshot = await db.collection("userStats").get();
    const leaderboardData: { [userId: string]: LeaderboardEntry } = {};
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0); // Normalize to start of the day

    let processedCount = 0;
    const userPromises = usersSnapshot.docs.map(async (doc) => {
        const userId = doc.id;
        const userDocData = doc.data() as GameStatistics | undefined;
        const stats = userDocData?.allTimeStats;

        if (!stats) {
            logger.warn(`No allTimeStats data found for user ${userId}. Skipping.`);
            return;
        }

        // --- Calculate Elo Stats ---
        let eloTotal = 0;
        let eloCount = 0;
        let eloTotalLast30 = 0;
        let eloCountLast30 = 0;
        const eloScoresByDay = stats.eloScoreByDay || {};

        for (const dateStr in eloScoresByDay) {
            const score = eloScoresByDay[dateStr];
            if (typeof score === 'number' && !isNaN(score)) {
                eloTotal += score;
                eloCount++;

                try {
                    const parts = dateStr.split('-');
                    if (parts.length === 3) {
                         const scoreDate = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
                         if (!isNaN(scoreDate.getTime()) && scoreDate >= thirtyDaysAgo) {
                             eloTotalLast30 += score;
                             eloCountLast30++;
                         }
                    } else {
                        logger.warn(`Invalid date format '${dateStr}' for user ${userId}`);
                    }
                } catch (e) {
                    logger.warn(`Could not parse date string '${dateStr}' for user ${userId}`, e);
                }
            }
        }

        const eloAvg = eloCount > 0 ? eloTotal / eloCount : null;
        const eloAvgLast30 = eloCountLast30 > 0 ? eloTotalLast30 / eloCountLast30 : null;

        // --- Get Username (Placeholder - Improve this later) ---
        // TODO: Fetch username from user profile or add to userStats
        const username = `User_${userId.substring(0, 6)}`;

        // --- Assemble Leaderboard Entry ---
        leaderboardData[userId] = {
            userId: userId,
            username: username,
            totalWins: stats.totalWins || 0,
            totalMovesUsed: stats.totalMovesUsed || 0,
            longestPuzzleCompletedStreak: stats.longestPuzzleCompletedStreak || 0,
            currentPuzzleCompletedStreak: stats.currentPuzzleCompletedStreak || 0,
            currentFirstTryStreak: stats.currentFirstTryStreak || 0,
            longestFirstTryStreak: stats.longestFirstTryStreak || 0,
            eloScoreAvg: eloAvg !== null ? Math.round(eloAvg) : null,
            eloScoreTotal: eloTotal,
            eloScoreAvgLast30: eloAvgLast30 !== null ? Math.round(eloAvgLast30) : null,
            eloScoreTotalLast30: eloTotalLast30,
        };
        processedCount++;
    });

    await Promise.all(userPromises);
    logger.info(`Processed stats for ${processedCount} users.`);

    // --- Write to globalLeaderboard collection ---
    logger.info(`Writing ${Object.keys(leaderboardData).length} entries to globalLeaderboard...`);
    const leaderboardEntries = Object.values(leaderboardData);
    const batchSize = 490; // Firestore batch limit is 500
    let committedCount = 0;

    for (let i = 0; i < leaderboardEntries.length; i += batchSize) {
        const batch = db.batch();
        const chunk = leaderboardEntries.slice(i, i + batchSize);
        logger.info(`Preparing batch ${Math.floor(i / batchSize) + 1} with ${chunk.length} entries.`);
        chunk.forEach(entry => {
            const userRef = db.collection("globalLeaderboard").doc(entry.userId);
            batch.set(userRef, entry, { merge: true });
        });

        try {
            await batch.commit();
            committedCount += chunk.length;
            logger.info(`Committed batch ${Math.floor(i / batchSize) + 1} (${chunk.length} entries). Total committed: ${committedCount}`);
        } catch (error) {
            logger.error(`Error committing batch ${Math.floor(i / batchSize) + 1}:`, error);
            // Decide on error handling: stop, retry, or log and continue?
            throw new Error(`Failed to commit batch ${Math.floor(i / batchSize) + 1}.`);
        }
    }

    logger.info(`Global leaderboard calculation finished. Committed ${committedCount} total entries.`);
    return { processedCount, committedCount };
} 