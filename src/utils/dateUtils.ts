/**
 * Returns the date key for today in YYYY-MM-DD format
 */
export function dateKeyForToday(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generates a stable seed value from a date string
 * Used to ensure deterministic puzzle generation
 */
export function stableSeedForDate(dateStr: string): number {
  return dateStr.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
}

/**
 * Create a Swift-style random number generator for compatibility
 * with the iOS version of the game
 */
export function createSwiftSeededGenerator(seed: number) {
  let state = BigInt(seed);
  
  // Returns a random UInt64 value
  function nextUInt64(): bigint {
    state = (state * 6364136223846793005n + 1n) & ((1n << 64n) - 1n);
    return state;
  }
  
  // Returns a random integer in range [0, upperBound)
  function nextIntInRange(upperBound: number): number {
    if (upperBound <= 0) return 0;
    
    // Calculate how many bits we need
    const range = BigInt(upperBound);
    const bitsNeeded = range.toString(2).length;
    
    // Generate a mask for those bits
    const mask = (1n << BigInt(bitsNeeded)) - 1n;
    
    // Keep trying until we get a value within our range
    let value: bigint;
    do {
      value = nextUInt64() & mask;
    } while (value >= range);
    
    return Number(value);
  }
  
  return {
    nextUInt64,
    nextIntInRange
  };
} 