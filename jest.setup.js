// Jest Setup File
// Global test setup and mocks

// Mock react-native modules
jest.mock('react-native', () => {
  return {
    Platform: { OS: 'ios' },
    StyleSheet: {
      create: (styles) => styles,
    },
    Dimensions: {
      get: () => ({ width: 375, height: 667 }),
    },
  };
});

// Mock expo modules
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
    withTransactionAsync: jest.fn().mockImplementation(async (fn) => await fn()),
    closeAsync: jest.fn().mockResolvedValue(undefined)
  })
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined)
}));

// Global test utilities
global.console = {
  ...console,
  // Reduce noise in tests
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Global test timeout
jest.setTimeout(10000);
