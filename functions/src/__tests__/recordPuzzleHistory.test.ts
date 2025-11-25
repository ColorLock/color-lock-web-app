/**
 * Integration tests for recordPuzzleHistory cloud function
 * These tests verify the complex transaction logic for recording puzzle history
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
import { recordPuzzleHistory } from '../index';

describe('recordPuzzleHistory Integration Tests', () => {
  const userId = 'test-user-123';
  const puzzleId = '2025-01-15';
  const botMoves = 10;

  let mockFirestore: any;
  let mockCollection: jest.Mock;
  let mockDoc: jest.Mock;
  let mockGet: jest.Mock;
  let mockSet: jest.Mock;
  let mockRunTransaction: jest.Mock;
  let mockCollectionGroup: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGet = jest.fn();
    mockSet = jest.fn();
    mockDoc = jest.fn(() => ({
      get: mockGet,
      set: mockSet,
      collection: jest.fn((name: string) => ({
        doc: mockDoc,
      })),
    }));
    mockCollection = jest.fn(() => ({ doc: mockDoc }));
    mockCollectionGroup = jest.fn(() => ({ get: jest.fn() }));
    mockRunTransaction = jest.fn();

    mockFirestore = {
      collection: mockCollection,
      collectionGroup: mockCollectionGroup,
      runTransaction: mockRunTransaction,
    };

    (admin.firestore as unknown as jest.Mock).mockReturnValue(mockFirestore);
  });

  describe('Win Scenario', () => {
    it('should successfully record a win with first try', async () => {
      const winPayload = {
        puzzle_id: puzzleId,
        difficulty: DifficultyLevel.Hard,
        attemptNumber: 1,
        moves: 8,
        hintUsed: false,
        botMoves: botMoves,
        win_loss: 'win' as const,
      };

      // Mock dailyScoresV2 check (no existing scores)
      mockGet.mockResolvedValueOnce({ exists: false });

      // Mock transaction
      mockRunTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
          set: jest.fn(),
        };
        return await callback(mockTx);
      });

      const mockRequest = {
        data: winPayload,
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (recordPuzzleHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.firstTry).toBe(true);
      expect(result.elo).toBeGreaterThan(0);
    });

    it('should calculate Elo score correctly for beat bot scenario', async () => {
      const winPayload = {
        puzzle_id: puzzleId,
        difficulty: DifficultyLevel.Hard,
        attemptNumber: 1,
        moves: 8, // beats bot
        hintUsed: false,
        botMoves: 10,
        win_loss: 'win' as const,
      };

      mockGet.mockResolvedValue({ exists: false });

      mockRunTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
          set: jest.fn(),
        };
        return await callback(mockTx);
      });

      const mockRequest = {
        data: winPayload,
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (recordPuzzleHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      // Win bonus (200) + beat bonus (600) + first to beat bot (200) = 1000
      expect(result.elo).toBeGreaterThan(500);
    });

    it('should handle existing puzzle data and update correctly', async () => {
      const winPayload = {
        puzzle_id: puzzleId,
        difficulty: DifficultyLevel.Hard,
        attemptNumber: 2,
        moves: 7, // better than previous
        hintUsed: false,
        botMoves: 10,
        win_loss: 'win' as const,
      };

      mockGet.mockResolvedValue({ exists: false });

      mockRunTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({
              totalAttempts: 1,
              hard: {
                attemptNumber: 1,
                moves: 9,
                firstTry: false,
                eloScore: 600,
              },
            }),
          }),
          set: jest.fn(),
        };
        return await callback(mockTx);
      });

      const mockRequest = {
        data: winPayload,
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (recordPuzzleHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.firstTry).toBe(false); // Not first attempt
    });
  });

  describe('Loss Scenario', () => {
    it('should record loss without updating scores', async () => {
      const lossPayload = {
        puzzle_id: puzzleId,
        difficulty: DifficultyLevel.Hard,
        attemptNumber: 1,
        moves: 15, // doesn't beat bot
        hintUsed: false,
        botMoves: 10,
        win_loss: 'loss' as const,
      };

      mockGet.mockResolvedValue({ exists: false });

      mockRunTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
          set: jest.fn(),
        };
        return await callback(mockTx);
      });

      const mockRequest = {
        data: lossPayload,
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (recordPuzzleHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.firstTry).toBe(false);
      expect(result.elo).toBe(0);
    });
  });

  describe('Validation', () => {
    it('should throw error for unauthenticated user', async () => {
      const mockRequest = {
        data: {
          puzzle_id: puzzleId,
          difficulty: DifficultyLevel.Hard,
          attemptNumber: 1,
          moves: 8,
          hintUsed: false,
          botMoves: 10,
          win_loss: 'win',
        },
        auth: null,
        app: undefined,
      };

      await expect((recordPuzzleHistory as any).run(mockRequest)).rejects.toThrow('unauthenticated');
    });

    it('should throw error for missing puzzle_id', async () => {
      const mockRequest = {
        data: {
          difficulty: DifficultyLevel.Hard,
          attemptNumber: 1,
          moves: 8,
          hintUsed: false,
          botMoves: 10,
          win_loss: 'win',
        },
        auth: { uid: userId },
        app: undefined,
      };

      await expect((recordPuzzleHistory as any).run(mockRequest)).rejects.toThrow('invalid-argument');
    });

    it('should throw error for invalid difficulty', async () => {
      const mockRequest = {
        data: {
          puzzle_id: puzzleId,
          difficulty: null,
          attemptNumber: 1,
          moves: 8,
          hintUsed: false,
          botMoves: 10,
          win_loss: 'win',
        },
        auth: { uid: userId },
        app: undefined,
      };

      await expect((recordPuzzleHistory as any).run(mockRequest)).rejects.toThrow('invalid-argument');
    });

    it('should throw error for user_id mismatch', async () => {
      const mockRequest = {
        data: {
          puzzle_id: puzzleId,
          user_id: 'different-user',
          difficulty: DifficultyLevel.Hard,
          attemptNumber: 1,
          moves: 8,
          hintUsed: false,
          botMoves: 10,
          win_loss: 'win',
        },
        auth: { uid: userId },
        app: undefined,
      };

      await expect((recordPuzzleHistory as any).run(mockRequest)).rejects.toThrow('permission-denied');
    });
  });

  describe('Difficulty Levels', () => {
    it('should handle Easy difficulty', async () => {
      const winPayload = {
        puzzle_id: puzzleId,
        difficulty: DifficultyLevel.Easy,
        attemptNumber: 1,
        moves: 8,
        hintUsed: false,
        botMoves: 10,
        win_loss: 'win' as const,
      };

      mockGet.mockResolvedValue({ exists: false });

      mockRunTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
          set: jest.fn(),
        };
        return await callback(mockTx);
      });

      const mockRequest = {
        data: winPayload,
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (recordPuzzleHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      // Easy difficulty has 0.5 multiplier, so Elo should be less than hard
      expect(result.elo).toBeLessThan(400);
    });

    it('should handle Medium difficulty', async () => {
      const winPayload = {
        puzzle_id: puzzleId,
        difficulty: DifficultyLevel.Medium,
        attemptNumber: 1,
        moves: 8,
        hintUsed: false,
        botMoves: 10,
        win_loss: 'win' as const,
      };

      mockGet.mockResolvedValue({ exists: false });

      mockRunTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
          set: jest.fn(),
        };
        return await callback(mockTx);
      });

      const mockRequest = {
        data: winPayload,
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (recordPuzzleHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.elo).toBeGreaterThan(0);
    });
  });

  describe('Hint Penalty', () => {
    it('should apply hint penalty when hint is used', async () => {
      const winPayloadWithHint = {
        puzzle_id: puzzleId,
        difficulty: DifficultyLevel.Hard,
        attemptNumber: 1,
        moves: 8,
        hintUsed: true, // Hint used
        botMoves: 10,
        win_loss: 'win' as const,
      };

      mockGet.mockResolvedValue({ exists: false });

      mockRunTransaction.mockImplementation(async (callback: any) => {
        const mockTx = {
          get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
          set: jest.fn(),
        };
        return await callback(mockTx);
      });

      const mockRequest = {
        data: winPayloadWithHint,
        auth: { uid: userId },
        app: undefined,
      };

      const result = await (recordPuzzleHistory as any).run(mockRequest);

      expect(result.success).toBe(true);
      // Should have hint penalty applied (0.5x multiplier)
      expect(result.elo).toBeLessThan(800);
    });
  });
});
