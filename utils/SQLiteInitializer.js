import { sqliteDatabase } from './SqliteDatabase';

/**
 * Simple SQLite Initializer
 * Handles database setup and initialization
 */
class SQLiteInitializer {
  constructor() {
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * Initialize SQLite database
   * @returns {Promise<Object>} - Initialization result
   */
  async initialize() {
    if (this.initialized) {
      return { success: true, message: 'Already initialized' };
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  async _doInitialize() {
    try {
      console.log('🚀 Initializing SQLite database...');
      
      // Initialize database and create tables
      await sqliteDatabase.init();
      
      this.initialized = true;
      console.log('✅ SQLite database initialized successfully');
      
      return {
        success: true,
        message: 'SQLite database ready'
      };
    } catch (error) {
      console.error('❌ SQLite initialization failed:', error);
      this.initPromise = null; // Allow retry
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if database is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Reset initialization state (for testing)
   */
  reset() {
    this.initialized = false;
    this.initPromise = null;
  }
}

export const sqliteInitializer = new SQLiteInitializer();
export default sqliteInitializer;
