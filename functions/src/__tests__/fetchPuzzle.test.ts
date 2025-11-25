/**
 * Integration tests for fetchPuzzle cloud function
 * These tests verify the function's behavior with mocked Firestore
 */

import { HttpsError } from 'firebase-functions/v2/https';

// Create shared mock variables
let mockGet: jest.Mock;
let mockDoc: jest.Mock;
let mockCollection: jest.Mock;
let mockFirestore: any;

// Mock firebase-admin before any imports
jest.mock('firebase-admin', () => {
  return {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => mockFirestore),
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

describe('fetchPuzzle Integration Tests', () => {
  let fetchPuzzle: any;

  beforeAll(() => {
    // Setup Firestore mock chain before importing
    mockGet = jest.fn();
    mockDoc = jest.fn(() => ({ get: mockGet }));
    mockCollection = jest.fn(() => ({ doc: mockDoc }));

    mockFirestore = {
      collection: mockCollection,
    };

    // Now import the function after mocks are set up
    const indexModule = require('../index');
    fetchPuzzle = indexModule.fetchPuzzle;
  });

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Re-setup the mock chain
    mockGet = jest.fn();
    mockDoc = jest.fn(() => ({ get: mockGet }));
    mockCollection = jest.fn(() => ({ doc: mockDoc }));

    mockFirestore.collection = mockCollection;
  });

  describe('Valid Puzzle Data', () => {
    it('should return puzzle data when puzzle exists with valid format', async () => {
      const validPuzzleData = {
        algoScore: 10,
        targetColor: '#FF0000',
        states: [[1, 2, 3]],
        actions: ['action1'],
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => validPuzzleData,
      });

      const mockRequest = {
        data: { date: '2025-01-15' },
        auth: { uid: 'test-user-123' },
        app: undefined,
      };

      const result = await fetchPuzzle.run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validPuzzleData);
      expect(mockCollection).toHaveBeenCalledWith('puzzles');
      expect(mockDoc).toHaveBeenCalledWith('2025-01-15');
      expect(mockGet).toHaveBeenCalled();
    });

    it('should validate all required fields are present', async () => {
      const validData = {
        algoScore: 10,
        targetColor: '#FF0000',
        states: [[1, 2, 3]],
        actions: ['action1'],
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => validData,
      });

      const mockRequest = {
        data: { date: '2025-01-15' },
        auth: { uid: 'test-user-123' },
        app: undefined,
      };

      const result = await fetchPuzzle.run(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.algoScore).toBe(10);
      expect(result.data.targetColor).toBe('#FF0000');
      expect(Array.isArray(result.data.states)).toBe(true);
      expect(Array.isArray(result.data.actions)).toBe(true);
    });
  });

  describe('Invalid Puzzle Data', () => {
    it('should throw error for puzzle with missing algoScore', async () => {
      const invalidData = {
        targetColor: '#FF0000',
        states: [[1, 2, 3]],
        actions: ['action1'],
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => invalidData,
      });

      const mockRequest = {
        data: { date: '2025-01-15' },
        auth: { uid: 'test-user-123' },
        app: undefined,
      };

      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow(HttpsError);
      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow('Invalid puzzle data format found');
    });

    it('should throw error for puzzle with missing targetColor', async () => {
      const invalidData = {
        algoScore: 10,
        states: [[1, 2, 3]],
        actions: ['action1'],
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => invalidData,
      });

      const mockRequest = {
        data: { date: '2025-01-15' },
        auth: { uid: 'test-user-123' },
        app: undefined,
      };

      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow(HttpsError);
      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow('Invalid puzzle data format found');
    });

    it('should throw error for puzzle with empty states array', async () => {
      const invalidData = {
        algoScore: 10,
        targetColor: '#FF0000',
        states: [],
        actions: ['action1'],
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => invalidData,
      });

      const mockRequest = {
        data: { date: '2025-01-15' },
        auth: { uid: 'test-user-123' },
        app: undefined,
      };

      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow(HttpsError);
      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow('Invalid puzzle data format found');
    });

    it('should throw error for puzzle with missing actions', async () => {
      const invalidData = {
        algoScore: 10,
        targetColor: '#FF0000',
        states: [[1, 2, 3]],
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => invalidData,
      });

      const mockRequest = {
        data: { date: '2025-01-15' },
        auth: { uid: 'test-user-123' },
        app: undefined,
      };

      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow(HttpsError);
      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow('Invalid puzzle data format found');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for missing date parameter', async () => {
      const mockRequest = {
        data: {},
        auth: { uid: 'test-user-123' },
        app: undefined,
      };

      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow(HttpsError);
      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow('The function must be called with a "date" argument');
    });

    it('should handle Firestore errors gracefully', async () => {
      mockGet.mockRejectedValue(new Error('Firestore connection error'));

      const mockRequest = {
        data: { date: '2025-01-15' },
        auth: { uid: 'test-user-123' },
        app: undefined,
      };

      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow(HttpsError);
      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow('Internal server error fetching puzzle');
    });

    it('should throw not-found error for non-existent puzzle', async () => {
      mockGet.mockResolvedValue({
        exists: false,
      });

      const mockRequest = {
        data: { date: '2025-01-15' },
        auth: { uid: 'test-user-123' },
        app: undefined,
      };

      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow(HttpsError);
      await expect(fetchPuzzle.run(mockRequest)).rejects.toThrow('Puzzle not found for date');
    });
  });

  describe('Authentication', () => {
    it('should work with authenticated user', async () => {
      const validPuzzleData = {
        algoScore: 10,
        targetColor: '#FF0000',
        states: [[1, 2, 3]],
        actions: ['action1'],
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => validPuzzleData,
      });

      const mockRequest = {
        data: { date: '2025-01-15' },
        auth: { uid: 'authenticated-user' },
        app: undefined,
      };

      const result = await fetchPuzzle.run(mockRequest);
      expect(result.success).toBe(true);
    });

    it('should work with unauthenticated user', async () => {
      const validPuzzleData = {
        algoScore: 10,
        targetColor: '#FF0000',
        states: [[1, 2, 3]],
        actions: ['action1'],
      };

      mockGet.mockResolvedValue({
        exists: true,
        data: () => validPuzzleData,
      });

      const mockRequest = {
        data: { date: '2025-01-15' },
        auth: null,
        app: undefined,
      };

      const result = await fetchPuzzle.run(mockRequest);
      expect(result.success).toBe(true);
    });
  });
});
