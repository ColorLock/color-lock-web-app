/**
 * Integration tests for leaderboard cloud functions
 * Tests getGlobalLeaderboardV2, getPersonalStats, getWinModalStats, getDailyScoresV2Stats
 */

import * as admin from 'firebase-admin';
import { DifficultyLevel } from '../../../src/types/settings';
import { HttpsError } from 'firebase-functions/v2/https';

// Mock firebase-admin
jest.mock('firebase-admin', () => {
  const actualAdmin = jest.requireActual('firebase-admin');
  return {
    ...actualAdmin,
    initializeApp: jest.fn(),
    firestore: jest.fn(),
    auth: jest.fn(),
  };
});

// Mock the logger
jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import after mocking
import { 
  getGlobalLeaderboardV2, 
  getPersonalStats, 
  getWinModalStats, 
  getDailyScoresV2Stats 
} from '../index';

describe('Leaderboard Integration Tests', () => {
  const userId = 'test-user-123';
  const puzzleId = '2025-01-15';

  let mockFirestore: any;
  let mockAuth: any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getGlobalLeaderboardV2', () => {
    beforeEach(() => {
      const mockDocs = [
        {
          id: 'levelAgnostic',
          ref: {
            parent: {
              parent: { id: 'user1' },
            },
          },
          data: () => ({
            eloScoreLast7: 500,
            eloScoreLast30: 1500,
            eloScoreAllTime: 5000,
            currentPuzzleCompletedStreak: 5,
            longestPuzzleCompletedStreak: 10,
          }),
        },
        {
          id: 'levelAgnostic',
          ref: {
            parent: {
              parent: { id: 'user2' },
            },
          },
          data: () => ({
            eloScoreLast7: 800,
            eloScoreLast30: 2000,
            eloScoreAllTime: 8000,
            currentPuzzleCompletedStreak: 3,
            longestPuzzleCompletedStreak: 7,
          }),
        },
        {
          id: 'hard',
          ref: {
            parent: {
              parent: { id: 'user1' },
            },
          },
          data: () => ({
            goalsAchieved: 50,
            goalsBeaten: 30,
            longestFirstTryStreak: 5,
            currentFirstTryStreak: 5,
            longestTieBotStreak: 10,
            currentTieBotStreak: 8,
          }),
        },
      ];

      const mockCollectionGroup = {
        get: jest.fn().mockResolvedValue({
          forEach: (callback: any) => mockDocs.forEach(callback),
        }),
      };

      mockAuth = {
        getUsers: jest.fn().mockResolvedValue({
          users: [
            { uid: 'user1', displayName: 'User One' },
            { uid: 'user2', displayName: 'User Two' },
          ],
          notFound: [],
        }),
      };

      mockFirestore = {
        collectionGroup: jest.fn(() => mockCollectionGroup),
      };

      (admin.firestore as unknown as jest.Mock).mockReturnValue(mockFirestore);
      (admin.auth as unknown as jest.Mock).mockReturnValue(mockAuth);
    });

    it('should return score leaderboard for last7 subcategory', async () => {
      const mockRequest = {
        data: {
          category: 'score',
          subcategory: 'last7',
        },
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (getGlobalLeaderboardV2 as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.leaderboard).toBeDefined();
      expect(result.leaderboard.length).toBeGreaterThan(0);
      expect(result.leaderboard[0].value).toBeGreaterThan(0);
    });

    it('should return goals leaderboard for beaten subcategory', async () => {
      const mockRequest = {
        data: {
          category: 'goals',
          subcategory: 'beaten',
          difficulty: DifficultyLevel.Hard,
        },
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (getGlobalLeaderboardV2 as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.leaderboard).toBeDefined();
    });

    it('should throw error when difficulty is missing for goals category', async () => {
      const mockRequest = {
        data: {
          category: 'goals',
          subcategory: 'beaten',
        },
        auth: { uid: userId },
        app: undefined,
      };

      await expect((getGlobalLeaderboardV2 as any).run(mockRequest)).rejects.toThrow('invalid-argument');
    });

    it('should throw error when difficulty is missing for streaks category', async () => {
      const mockRequest = {
        data: {
          category: 'streaks',
          subcategory: 'firstTry',
        },
        auth: { uid: userId },
        app: undefined,
      };

      await expect((getGlobalLeaderboardV2 as any).run(mockRequest)).rejects.toThrow('invalid-argument');
    });

    it('should include isCurrent flag for streak leaderboards', async () => {
      const mockRequest = {
        data: {
          category: 'streaks',
          subcategory: 'firstTry',
          difficulty: DifficultyLevel.Hard,
        },
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (getGlobalLeaderboardV2 as any).run(mockRequest);

      expect(result.success).toBe(true);
      if (result.leaderboard.length > 0) {
        expect(result.leaderboard[0]).toHaveProperty('isCurrent');
      }
    });
  });

  describe('getPersonalStats', () => {
    beforeEach(() => {
      const mockGet = jest.fn()
        .mockResolvedValueOnce({ // puzzleSnap
          exists: true,
          data: () => ({
            totalAttempts: 3,
            hard: {
              moves: 8,
              eloScore: 800,
              attemptToTieBot: 2,
              attemptToBeatBot: 1,
            },
          }),
        })
        .mockResolvedValueOnce({ // laSnap
          exists: true,
          data: () => ({
            eloScoreByDay: { [puzzleId]: 800 },
            currentPuzzleCompletedStreak: 5,
            puzzleAttempts: 50,
            puzzleSolved: 40,
            moves: 500,
          }),
        })
        .mockResolvedValueOnce({ // diffSnap
          exists: true,
          data: () => ({
            currentTieBotStreak: 3,
            currentFirstTryStreak: 2,
          }),
        });

      mockFirestore = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: mockGet,
              })),
            })),
            get: mockGet,
          })),
        })),
      };

      (admin.firestore as unknown as jest.Mock).mockReturnValue(mockFirestore);
    });

    it('should return personal stats for a user', async () => {
      const mockRequest = {
        data: {
          puzzleId: puzzleId,
          difficulty: DifficultyLevel.Hard,
        },
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (getPersonalStats as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats.today).toBeDefined();
      expect(result.stats.allTime).toBeDefined();
      expect(result.stats.difficulty).toBe(DifficultyLevel.Hard);
    });

    it('should throw error for unauthenticated user', async () => {
      const mockRequest = {
        data: {
          puzzleId: puzzleId,
          difficulty: DifficultyLevel.Hard,
        },
        auth: null,
        app: undefined,
      };

      await expect((getPersonalStats as any).run(mockRequest)).rejects.toThrow('unauthenticated');
    });

    it('should throw error for missing puzzleId', async () => {
      const mockRequest = {
        data: {
          difficulty: DifficultyLevel.Hard,
        },
        auth: { uid: userId },
        app: undefined,
      };

      await expect((getPersonalStats as any).run(mockRequest)).rejects.toThrow('invalid-argument');
    });
  });

  describe('getWinModalStats', () => {
    beforeEach(() => {
      const mockGet = jest.fn()
        .mockResolvedValueOnce({ // puzzleSnap
          exists: true,
          data: () => ({
            totalAttempts: 3,
          }),
        })
        .mockResolvedValueOnce({ // laSnap
          exists: true,
          data: () => ({
            currentPuzzleCompletedStreak: 7,
          }),
        })
        .mockResolvedValueOnce({ // diffSnap
          exists: true,
          data: () => ({
            currentTieBotStreak: 3,
            currentFirstTryStreak: 2,
          }),
        });

      mockFirestore = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: mockGet,
              })),
            })),
            get: mockGet,
          })),
        })),
      };

      (admin.firestore as unknown as jest.Mock).mockReturnValue(mockFirestore);
    });

    it('should return win modal stats', async () => {
      const mockRequest = {
        data: {
          puzzleId: puzzleId,
          difficulty: DifficultyLevel.Hard,
        },
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (getWinModalStats as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats.totalAttempts).toBe(3);
      expect(result.stats.currentPuzzleCompletedStreak).toBe(7);
      expect(result.stats.currentTieBotStreak).toBe(3);
      expect(result.stats.currentFirstTryStreak).toBe(2);
      expect(result.stats.difficulty).toBe(DifficultyLevel.Hard);
    });

    it('should throw error for unauthenticated user', async () => {
      const mockRequest = {
        data: {
          puzzleId: puzzleId,
          difficulty: DifficultyLevel.Hard,
        },
        auth: null,
        app: undefined,
      };

      await expect((getWinModalStats as any).run(mockRequest)).rejects.toThrow('unauthenticated');
    });
  });

  describe('getDailyScoresV2Stats', () => {
    beforeEach(() => {
      mockFirestore = {
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                easy: {
                  user1: 15,
                  user2: 18,
                  user3: 15,
                },
                medium: {
                  user1: 12,
                  user2: 14,
                },
                hard: {
                  user1: 8,
                  user2: 10,
                  user3: 7,
                  user4: 7,
                },
              }),
            }),
          })),
        })),
      };

      (admin.firestore as unknown as jest.Mock).mockReturnValue(mockFirestore);
    });

    it('should return stats for all difficulty levels', async () => {
      const mockRequest = {
        data: {
          puzzleId: puzzleId,
        },
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (getDailyScoresV2Stats as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats[DifficultyLevel.Easy]).toBeDefined();
      expect(result.stats[DifficultyLevel.Medium]).toBeDefined();
      expect(result.stats[DifficultyLevel.Hard]).toBeDefined();
    });

    it('should calculate lowest score correctly', async () => {
      const mockRequest = {
        data: {
          puzzleId: puzzleId,
        },
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (getDailyScoresV2Stats as any).run(mockRequest);

      expect(result.stats[DifficultyLevel.Hard].lowestScore).toBe(7);
      expect(result.stats[DifficultyLevel.Easy].lowestScore).toBe(15);
    });

    it('should calculate total players correctly', async () => {
      const mockRequest = {
        data: {
          puzzleId: puzzleId,
        },
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (getDailyScoresV2Stats as any).run(mockRequest);

      expect(result.stats[DifficultyLevel.Hard].totalPlayers).toBe(4);
      expect(result.stats[DifficultyLevel.Easy].totalPlayers).toBe(3);
      expect(result.stats[DifficultyLevel.Medium].totalPlayers).toBe(2);
    });

    it('should calculate players with lowest score correctly', async () => {
      const mockRequest = {
        data: {
          puzzleId: puzzleId,
        },
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (getDailyScoresV2Stats as any).run(mockRequest);

      expect(result.stats[DifficultyLevel.Hard].playersWithLowestScore).toBe(2); // Two users with 7
      expect(result.stats[DifficultyLevel.Easy].playersWithLowestScore).toBe(2); // Two users with 15
    });

    it('should calculate average score correctly', async () => {
      const mockRequest = {
        data: {
          puzzleId: puzzleId,
        },
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (getDailyScoresV2Stats as any).run(mockRequest);

      // Hard: (8 + 10 + 7 + 7) / 4 = 8
      expect(result.stats[DifficultyLevel.Hard].averageScore).toBeCloseTo(8, 1);
      // Easy: (15 + 18 + 15) / 3 = 16
      expect(result.stats[DifficultyLevel.Easy].averageScore).toBeCloseTo(16, 1);
    });

    it('should throw error for missing puzzleId', async () => {
      const mockRequest = {
        data: {},
        auth: { uid: userId },
        app: undefined,
      };

      await expect((getDailyScoresV2Stats as any).run(mockRequest)).rejects.toThrow('invalid-argument');
    });
  });
});
