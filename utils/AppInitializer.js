import { sqliteInitializer } from './SQLiteInitializer';

/**
 * Simple App Initializer
 * Handles app-level SQLite initialization
 */
export const initializeAppWithSQLite = async () => {
  try {
    console.log('🚀 Initializing app with SQLite...');
    
    // Initialize SQLite database
    const result = await sqliteInitializer.initialize();
    
    if (result.success) {
      console.log('✅ App initialized with SQLite');
      return {
        success: true,
        message: 'SQLite system ready'
      };
    } else {
      console.error('❌ SQLite initialization failed:', result.error);
      return {
        success: false,
        error: result.error
      };
    }
  } catch (error) {
    console.error('❌ App initialization error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check if SQLite is ready
 */
export const isSQLiteReady = () => {
  return sqliteInitializer.isInitialized();
};
