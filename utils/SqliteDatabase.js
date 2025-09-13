import * as SQLite from 'expo-sqlite';

class SqliteDatabase {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.initPromise = null;
  }

  /**
   * Initialize the SQLite database
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._init();
    return this.initPromise;
  }

  async _init() {
    try {
      console.log('🗄️ Initializing SQLite database...');
      
      // Open database
      this.db = await SQLite.openDatabaseAsync('financial_app.db');
      
      // Enable foreign keys
      await this.db.execAsync('PRAGMA foreign_keys = ON;');
      
      // Create tables
      await this.createTables();
      
      // Run migration for existing databases
      await this.runMigration();
      
      // Create indexes for performance
      await this.createIndexes();
      
      this.isInitialized = true;
      console.log('✅ SQLite database initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize SQLite database:', error);
      throw error;
    }
  }

  /**
   * Create all required tables
   * @returns {Promise<void>}
   */
  async createTables() {
    console.log('🗄️ Creating SQLite tables...');

    try {
      // Core data tables
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS inventory (
          id TEXT PRIMARY KEY,
          temp_id TEXT UNIQUE,
          user_id TEXT NOT NULL,
          store_id TEXT,
          name TEXT NOT NULL,
          description TEXT,
          sku TEXT,
          category TEXT,
          quantity INTEGER NOT NULL DEFAULT 0,
          cost_price REAL NOT NULL DEFAULT 0,
          selling_price REAL NOT NULL DEFAULT 0,
          unit_price REAL NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          minimum_stock_level INTEGER DEFAULT 0,
          expiration_date TEXT,
          synced BOOLEAN NOT NULL DEFAULT 0,
          is_offline BOOLEAN NOT NULL DEFAULT 0
        );
      `);

      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS sales (
          id TEXT PRIMARY KEY,
          temp_id TEXT UNIQUE,
          user_id TEXT NOT NULL,
          store_id TEXT,
          sale_number TEXT,
          customer_name TEXT,
          customer_email TEXT,
          customer_phone TEXT,
          subtotal REAL NOT NULL DEFAULT 0,
          tax_amount REAL NOT NULL DEFAULT 0,
          discount_amount REAL NOT NULL DEFAULT 0,
          total_amount REAL NOT NULL DEFAULT 0,
          payment_method TEXT,
          payment_status TEXT,
          sale_date TEXT NOT NULL,
          notes TEXT,
          sale_items TEXT,
          synced BOOLEAN NOT NULL DEFAULT 0,
          is_offline BOOLEAN NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS sale_items (
          id TEXT PRIMARY KEY,
          sale_id TEXT NOT NULL,
          inventory_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          item_name TEXT NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          unit_price REAL NOT NULL DEFAULT 0,
          line_total REAL NOT NULL DEFAULT 0,
          synced BOOLEAN NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
        );
      `);

      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS stores (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          address TEXT,
          phone TEXT,
          email TEXT,
          is_active BOOLEAN NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          synced BOOLEAN NOT NULL DEFAULT 0
        );
      `);

      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY,
          temp_id TEXT UNIQUE,
          user_id TEXT NOT NULL,
          store_id TEXT,
          title TEXT,
          category TEXT,
          description TEXT,
          amount REAL NOT NULL DEFAULT 0,
          expense_date TEXT NOT NULL,
          receipt_url TEXT,
          vendor TEXT,
          payment_method TEXT,
          is_recurring BOOLEAN NOT NULL DEFAULT 0,
          synced BOOLEAN NOT NULL DEFAULT 0,
          is_offline BOOLEAN NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // Sync and cache tables
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY,
          operation_key TEXT UNIQUE NOT NULL,
          table_name TEXT NOT NULL,
          record_id TEXT NOT NULL,
          operation_type TEXT NOT NULL CHECK (operation_type IN ('INSERT', 'UPDATE', 'DELETE')),
          data TEXT NOT NULL,
          sync_function_ref TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          synced BOOLEAN NOT NULL DEFAULT 0,
          error_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          id TEXT PRIMARY KEY,
          user_id TEXT UNIQUE NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('individual', 'owner', 'worker')),
          store_id TEXT,
          business_name TEXT,
          email TEXT,
          first_name TEXT,
          last_name TEXT,
          phone TEXT,
          synced BOOLEAN NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT UNIQUE NOT NULL,
          session_data TEXT NOT NULL,
          expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // Cache metadata table for migration tracking
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS worker_assignments (
          id TEXT PRIMARY KEY,
          store_id TEXT NOT NULL,
          worker_email TEXT NOT NULL,
          worker_id TEXT,
          is_active BOOLEAN NOT NULL DEFAULT 1,
          assigned_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(store_id, worker_email)
        );
      `);

      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS cache_metadata (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL,
          migrated BOOLEAN NOT NULL DEFAULT 0,
          migration_date TEXT,
          source TEXT NOT NULL CHECK (source IN ('asyncstorage', 'sqlite')),
          data_type TEXT,
          record_count INTEGER DEFAULT 0,
          expires_at TEXT,
          data TEXT,
          synced BOOLEAN NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      console.log('✅ All SQLite tables created successfully');
    } catch (error) {
      console.error('❌ Failed to create SQLite tables:', error);
      throw error;
    }
  }

  /**
   * Run database migration for existing databases
   * @returns {Promise<void>}
   */
  async runMigration() {
    console.log('🔄 Running database migration...');
    
    try {
      // Check if temp_id column exists in sales table
      const hasSalesTempId = await this.checkColumnExists('sales', 'temp_id');
      
      if (!hasSalesTempId) {
        // Add temp_id column without UNIQUE constraint first
        await this.db.execAsync('ALTER TABLE sales ADD COLUMN temp_id TEXT;');
        console.log('✅ Added temp_id column to sales table');
      } else {
        console.log('✅ temp_id column already exists in sales table');
      }
      
      // Add is_offline column to sales table if it doesn't exist
      try {
        await this.db.execAsync('ALTER TABLE sales ADD COLUMN is_offline BOOLEAN NOT NULL DEFAULT 0;');
        console.log('✅ Added is_offline column to sales table');
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log('✅ is_offline column already exists in sales table');
        }
      }
      
      // Check if temp_id column exists in expenses table
      const hasExpensesTempId = await this.checkColumnExists('expenses', 'temp_id');
      
      if (!hasExpensesTempId) {
        // Add temp_id column without UNIQUE constraint first
        await this.db.execAsync('ALTER TABLE expenses ADD COLUMN temp_id TEXT;');
        console.log('✅ Added temp_id column to expenses table');
      } else {
        console.log('✅ temp_id column already exists in expenses table');
      }
      
      // Add is_offline column to expenses table if it doesn't exist
      try {
        await this.db.execAsync('ALTER TABLE expenses ADD COLUMN is_offline BOOLEAN NOT NULL DEFAULT 0;');
        console.log('✅ Added is_offline column to expenses table');
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log('✅ is_offline column already exists in expenses table');
        }
      }

      // Add missing columns to user_profiles table
      const userProfileColumns = [
        { name: 'business_name', type: 'TEXT' },
        { name: 'first_name', type: 'TEXT' },
        { name: 'last_name', type: 'TEXT' },
        { name: 'phone', type: 'TEXT' }
      ];

      for (const column of userProfileColumns) {
        try {
          await this.db.execAsync(`ALTER TABLE user_profiles ADD COLUMN ${column.name} ${column.type};`);
          console.log(`✅ Added ${column.name} column to user_profiles table`);
        } catch (error) {
          if (error.message.includes('duplicate column name')) {
            console.log(`✅ ${column.name} column already exists in user_profiles table`);
          } else {
            console.warn(`⚠️ Failed to add ${column.name} column:`, error.message);
          }
        }
      }

      // Add sale_items column to sales table if it doesn't exist
      try {
        await this.db.execAsync('ALTER TABLE sales ADD COLUMN sale_items TEXT;');
        console.log('✅ Added sale_items column to sales table');
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log('✅ sale_items column already exists in sales table');
        } else {
          console.warn('⚠️ Failed to add sale_items column:', error.message);
        }
      }

      // Add title column to expenses table if it doesn't exist
      try {
        await this.db.execAsync('ALTER TABLE expenses ADD COLUMN title TEXT;');
        console.log('✅ Added title column to expenses table');
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log('✅ title column already exists in expenses table');
        } else {
          console.warn('⚠️ Failed to add title column to expenses:', error.message);
        }
      }

      // Fix cache_metadata table schema - add id column if missing
      try {
        await this.db.execAsync('ALTER TABLE cache_metadata ADD COLUMN id TEXT;');
        await this.db.execAsync('ALTER TABLE cache_metadata ADD COLUMN synced BOOLEAN NOT NULL DEFAULT 0;');
        // Copy key values to id column for existing records
        await this.db.execAsync('UPDATE cache_metadata SET id = key WHERE id IS NULL;');
        console.log('✅ Added id and synced columns to cache_metadata table');
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log('✅ id and synced columns already exist in cache_metadata table');
        } else {
          console.warn('⚠️ Failed to add columns to cache_metadata:', error.message);
        }
      }
      
      console.log('🎉 Database migration completed');
    } catch (error) {
      console.warn('⚠️ Database migration had issues:', error.message);
      // Don't throw - let the app continue
    }
  }

  /**
   * Check if a column exists in a table
   * @param {string} tableName - Table name
   * @param {string} columnName - Column name
   * @returns {Promise<boolean>}
   */
  async checkColumnExists(tableName, columnName) {
    try {
      const columns = await this.db.getAllAsync(`PRAGMA table_info(${tableName})`);
      return columns.some(col => col.name === columnName);
    } catch (error) {
      console.warn(`⚠️ Error checking column ${columnName} in ${tableName}:`, error.message);
      return false;
    }
  }

  /**
   * Create indexes for performance optimization
   * @returns {Promise<void>}
   */
  async createIndexes() {
    console.log('🗄️ Creating SQLite indexes...');

    try {
      // Inventory indexes
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_inventory_store_id ON inventory(store_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_inventory_synced ON inventory(synced);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_inventory_updated_at ON inventory(updated_at);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_inventory_temp_id ON inventory(temp_id);');

      // Sales indexes
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sales_synced ON sales(synced);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);');
      
      // Only create temp_id index if column exists
      const hasSalesTempId = await this.checkColumnExists('sales', 'temp_id');
      if (hasSalesTempId) {
        await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sales_temp_id ON sales(temp_id);');
      }

      // Sale items indexes
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sale_items_inventory_id ON sale_items(inventory_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sale_items_user_id ON sale_items(user_id);');

      // Expenses indexes
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_expenses_store_id ON expenses(store_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_expenses_synced ON expenses(synced);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);');
      
      // Only create temp_id index if column exists
      const hasExpensesTempId = await this.checkColumnExists('expenses', 'temp_id');
      if (hasExpensesTempId) {
        await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_expenses_temp_id ON expenses(temp_id);');
      }

      // Sync queue indexes
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sync_queue_table_name ON sync_queue(table_name);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);');

      // User profiles indexes
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_user_profiles_store_id ON user_profiles(store_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);');

      // Worker assignments indexes
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_worker_assignments_store_id ON worker_assignments(store_id);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_worker_assignments_worker_email ON worker_assignments(worker_email);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_worker_assignments_is_active ON worker_assignments(is_active);');

      // Cache metadata indexes
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_cache_metadata_migrated ON cache_metadata(migrated);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_cache_metadata_source ON cache_metadata(source);');
      await this.db.execAsync('CREATE INDEX IF NOT EXISTS idx_cache_metadata_expires_at ON cache_metadata(expires_at);');

      console.log('✅ All SQLite indexes created successfully');
    } catch (error) {
      console.error('❌ Failed to create SQLite indexes:', error);
      throw error;
    }
  }

  /**
   * Get database instance
   * @returns {SQLite.SQLiteDatabase}
   */
  getDatabase() {
    if (!this.isInitialized) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Check if database is initialized
   * @returns {boolean}
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * Execute a transaction
   * @param {Function} transactionFunction - Function to execute within transaction
   * @returns {Promise<any>}
   */
  async runTransaction(transactionFunction) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      console.log('🔄 Starting SQLite transaction...');
      
      // Store the result from the transaction function
      let transactionResult;
      
      await this.db.withTransactionAsync(async () => {
        transactionResult = await transactionFunction();
      });
      
      console.log('✅ SQLite transaction completed successfully');
      console.log('🔍 runTransaction returning result:', transactionResult);
      return transactionResult;
    } catch (error) {
      console.error('❌ SQLite transaction failed:', error);
      throw error;
    }
  }

  /**
   * Execute SQL query with parameters
   * @param {string} sql - SQL query
   * @param {Array} params - Parameters for the query
   * @returns {Promise<any>}
   */
  async execute(sql, params = []) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      const result = await this.db.runAsync(sql, params);
      return result;
    } catch (error) {
      console.error('❌ SQLite execute failed:', error);
      console.error('SQL:', sql);
      console.error('Params:', params);
      throw error;
    }
  }

  /**
   * Execute SQL query and return first result
   * @param {string} sql - SQL query
   * @param {Array} params - Parameters for the query
   * @returns {Promise<any>}
   */
  async getFirst(sql, params = []) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      const result = await this.db.getFirstAsync(sql, params);
      return result;
    } catch (error) {
      console.error('❌ SQLite getFirst failed:', error);
      console.error('SQL:', sql);
      console.error('Params:', params);
      throw error;
    }
  }

  /**
   * Execute SQL query and return all results
   * @param {string} sql - SQL query
   * @param {Array} params - Parameters for the query
   * @returns {Promise<Array>}
   */
  async getAll(sql, params = []) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      const result = await this.db.getAllAsync(sql, params);
      return result || [];
    } catch (error) {
      console.error('❌ SQLite getAll failed:', error);
      console.error('SQL:', sql);
      console.error('Params:', params);
      throw error;
    }
  }

  /**
   * Get database version for migration tracking
   * @returns {Promise<number>}
   */
  async getDatabaseVersion() {
    try {
      const result = await this.getFirst('PRAGMA user_version;');
      return result ? result.user_version : 0;
    } catch (error) {
      console.error('❌ Failed to get database version:', error);
      return 0;
    }
  }

  /**
   * Set database version for migration tracking
   * @param {number} version - Version number
   * @returns {Promise<void>}
   */
  async setDatabaseVersion(version) {
    try {
      await this.db.execAsync(`PRAGMA user_version = ${version};`);
      console.log(`✅ Database version set to ${version}`);
    } catch (error) {
      console.error('❌ Failed to set database version:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.db) {
      try {
        await this.db.closeAsync();
        this.db = null;
        this.isInitialized = false;
        this.initPromise = null;
        console.log('✅ SQLite database closed');
      } catch (error) {
        console.error('❌ Failed to close SQLite database:', error);
        throw error;
      }
    }
  }

  /**
   * Drop all tables (for testing/reset purposes)
   * @returns {Promise<void>}
   */
  async dropAllTables() {
    console.log('🗄️ Dropping all SQLite tables...');
    
    try {
      const tables = [
        'cache_metadata',
        'worker_assignments',
        'user_sessions', 
        'user_profiles',
        'sync_queue',
        'sale_items',
        'sales',
        'expenses',
        'inventory'
      ];

      for (const table of tables) {
        await this.db.execAsync(`DROP TABLE IF EXISTS ${table};`);
      }

      console.log('✅ All SQLite tables dropped');
    } catch (error) {
      console.error('❌ Failed to drop SQLite tables:', error);
      throw error;
    }
  }

  /**
   * Get table statistics
   * @returns {Promise<Object>}
   */
  async getTableStats() {
    try {
      const stats = {};
      
      const tables = ['inventory', 'sales', 'sale_items', 'stores', 'expenses', 'sync_queue', 'user_profiles', 'user_sessions', 'worker_assignments', 'cache_metadata'];
      
      for (const table of tables) {
        const result = await this.getFirst(`SELECT COUNT(*) as count FROM ${table};`);
        stats[table] = result ? result.count : 0;
      }

      return stats;
    } catch (error) {
      console.error('❌ Failed to get table statistics:', error);
      return {};
    }
  }
}

// Create and export singleton instance
export const sqliteDatabase = new SqliteDatabase();
export default sqliteDatabase;
