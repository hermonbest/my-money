import { sqliteDatabase } from './SqliteDatabase';

/**
 * SQLite Service Layer - Provides high-level database operations
 * This service abstracts SQLite operations and provides a clean interface
 * for CRUD operations, queries, and transactions.
 */
class SqliteService {
  constructor() {
    this.db = sqliteDatabase;
  }

  /**
   * Initialize the service and database
   * @returns {Promise<void>}
   */
  async init() {
    await this.db.init();
  }

  /**
   * Check if service is ready
   * @returns {boolean}
   */
  isReady() {
    return this.db.isReady();
  }

  // ===========================
  // GENERIC CRUD OPERATIONS
  // ===========================

  /**
   * Insert a record into a table
   * @param {string} tableName - Table name
   * @param {Object} data - Data to insert
   * @returns {Promise<Object>} - Inserted record with ID
   */
  async insert(tableName, data) {
    try {
      const now = new Date().toISOString();
      const recordData = {
        ...data,
        created_at: data.created_at || now,
        updated_at: data.updated_at || now,
        synced: data.synced !== undefined ? data.synced : false
      };

      const columns = Object.keys(recordData);
      const placeholders = columns.map(() => '?').join(', ');
      const values = Object.values(recordData);

      const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
      
      console.log(`📝 Inserting into ${tableName}:`, { id: recordData.id, columns: columns.length });
      
      const result = await this.db.execute(sql, values);
      
      // Return the inserted record
      return {
        ...recordData,
        _rowId: result.lastInsertRowId
      };
    } catch (error) {
      console.error(`❌ Failed to insert into ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Update a record by ID
   * @param {string} tableName - Table name
   * @param {string} id - Record ID
   * @param {Object} data - Data to update
   * @returns {Promise<Object>} - Updated record
   */
  async update(tableName, id, data) {
    try {
      const now = new Date().toISOString();
      const updateData = {
        ...data,
        updated_at: now
      };

      const columns = Object.keys(updateData);
      const setClause = columns.map(col => `${col} = ?`).join(', ');
      const values = [...Object.values(updateData), id];

      const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = ?`;
      
      console.log(`📝 Updating ${tableName} record:`, id);
      
      await this.db.execute(sql, values);
      
      // Return the updated record
      const updatedRecord = await this.findById(tableName, id);
      return updatedRecord || { id, ...data, updated_at: now };
    } catch (error) {
      console.error(`❌ Failed to update ${tableName} record ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a record by ID
   * @param {string} tableName - Table name
   * @param {string} id - Record ID
   * @returns {Promise<boolean>} - Success status
   */
  async delete(tableName, id) {
    try {
      const sql = `DELETE FROM ${tableName} WHERE id = ?`;
      
      console.log(`🗑️ Deleting from ${tableName}:`, id);
      
      const result = await this.db.execute(sql, [id]);
      
      return result.changes > 0;
    } catch (error) {
      console.error(`❌ Failed to delete from ${tableName} record ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find a record by ID
   * @param {string} tableName - Table name
   * @param {string} id - Record ID
   * @returns {Promise<Object|null>} - Found record or null
   */
  async findById(tableName, id) {
    try {
      const sql = `SELECT * FROM ${tableName} WHERE id = ?`;
      const result = await this.db.getFirst(sql, [id]);
      return result || null;
    } catch (error) {
      console.error(`❌ Failed to find ${tableName} record ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find records with conditions
   * @param {string} tableName - Table name
   * @param {Object} conditions - Where conditions
   * @param {Object} options - Query options (orderBy, limit, offset)
   * @returns {Promise<Array>} - Found records
   */
  async find(tableName, conditions = {}, options = {}) {
    try {
      let sql = `SELECT * FROM ${tableName}`;
      const params = [];

      // Build WHERE clause
      if (Object.keys(conditions).length > 0) {
        const whereClause = Object.keys(conditions)
          .map(key => {
            if (conditions[key] === null) {
              return `${key} IS NULL`;
            } else if (Array.isArray(conditions[key])) {
              const placeholders = conditions[key].map(() => '?').join(', ');
              params.push(...conditions[key]);
              return `${key} IN (${placeholders})`;
            } else {
              params.push(conditions[key]);
              return `${key} = ?`;
            }
          })
          .join(' AND ');
        sql += ` WHERE ${whereClause}`;
      }

      // Add ORDER BY
      if (options.orderBy) {
        sql += ` ORDER BY ${options.orderBy}`;
      }

      // Add LIMIT and OFFSET
      if (options.limit) {
        sql += ` LIMIT ${options.limit}`;
        if (options.offset) {
          sql += ` OFFSET ${options.offset}`;
        }
      }

      // Reduced logging - skip verbose sync_queue queries
      if (tableName !== 'sync_queue') {
        console.log(`🔍 Querying ${tableName}:`, { conditions, options });
      }
      
      const results = await this.db.getAll(sql, params);
      return results;
    } catch (error) {
      console.error(`❌ Failed to find in ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Count records with conditions
   * @param {string} tableName - Table name
   * @param {Object} conditions - Where conditions
   * @returns {Promise<number>} - Record count
   */
  async count(tableName, conditions = {}) {
    try {
      let sql = `SELECT COUNT(*) as count FROM ${tableName}`;
      const params = [];

      if (Object.keys(conditions).length > 0) {
        const whereClause = Object.keys(conditions)
          .map(key => {
            if (conditions[key] === null) {
              return `${key} IS NULL`;
            } else {
              params.push(conditions[key]);
              return `${key} = ?`;
            }
          })
          .join(' AND ');
        sql += ` WHERE ${whereClause}`;
      }

      const result = await this.db.getFirst(sql, params);
      return result ? result.count : 0;
    } catch (error) {
      console.error(`❌ Failed to count in ${tableName}:`, error);
      throw error;
    }
  }

  // ===========================
  // ROLE-BASED ACCESS METHODS
  // ===========================

  /**
   * Find records with role-based access control
   * @param {string} tableName - Table name
   * @param {string} userId - User ID
   * @param {string} userRole - User role (individual, owner, worker)
   * @param {string} storeId - Store ID (for owner/worker)
   * @param {Object} additionalConditions - Additional where conditions
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Found records
   */
  async findWithRoleAccess(tableName, userId, userRole, storeId = null, additionalConditions = {}, options = {}) {
    try {
      let conditions = { ...additionalConditions };

      // Apply role-based filtering
      if (userRole === 'individual') {
        conditions.user_id = userId;
      } else if (userRole === 'owner' && storeId) {
        conditions.store_id = storeId;
      } else if (userRole === 'worker' && storeId) {
        conditions.store_id = storeId;
      } else {
        // Fallback to user-specific data
        conditions.user_id = userId;
      }

      console.log(`🔒 Role-based query for ${tableName}:`, { userRole, userId, storeId, conditions });
      
      return await this.find(tableName, conditions, options);
    } catch (error) {
      console.error(`❌ Failed role-based find in ${tableName}:`, error);
      throw error;
    }
  }

  // ===========================
  // SYNC QUEUE OPERATIONS
  // ===========================

  /**
   * Add operation to sync queue
   * @param {string} operationKey - Unique operation key
   * @param {string} tableName - Target table name
   * @param {string} recordId - Record ID
   * @param {string} operationType - Operation type (INSERT, UPDATE, DELETE)
   * @param {Object} data - Operation data
   * @param {string} syncFunctionRef - Reference to sync function
   * @returns {Promise<Object>} - Sync queue record
   */
  async addToSyncQueue(operationKey, tableName, recordId, operationType, data, syncFunctionRef = null) {
    try {
      const queueData = {
        id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        operation_key: operationKey,
        table_name: tableName,
        record_id: recordId,
        operation_type: operationType,
        data: JSON.stringify(data),
        sync_function_ref: syncFunctionRef,
        attempts: 0,
        max_attempts: 3,
        synced: false
      };

      console.log(`📤 Adding to sync queue:`, { operationKey, tableName, operationType });
      
      return await this.insert('sync_queue', queueData);
    } catch (error) {
      console.error('❌ Failed to add to sync queue:', error);
      throw error;
    }
  }

  /**
   * Get pending sync operations
   * @param {number} limit - Maximum number of operations to return
   * @returns {Promise<Array>} - Pending sync operations
   */
  async getPendingSyncOperations(limit = 50) {
    try {
      return await this.find(
        'sync_queue',
        { synced: false },
        { orderBy: 'created_at ASC', limit }
      );
    } catch (error) {
      console.error('❌ Failed to get pending sync operations:', error);
      throw error;
    }
  }

  /**
   * Mark sync operation as completed
   * @param {string} operationId - Sync operation ID
   * @returns {Promise<Object>} - Updated sync record
   */
  async markSyncCompleted(operationId) {
    try {
      console.log(`✅ Marking sync operation completed:`, operationId);
      return await this.update('sync_queue', operationId, { synced: true });
    } catch (error) {
      console.error('❌ Failed to mark sync completed:', error);
      throw error;
    }
  }

  /**
   * Increment sync attempts and update error message
   * @param {string} operationId - Sync operation ID
   * @param {string} errorMessage - Error message
   * @returns {Promise<Object>} - Updated sync record
   */
  async incrementSyncAttempts(operationId, errorMessage = null) {
    try {
      const record = await this.findById('sync_queue', operationId);
      if (!record) {
        throw new Error(`Sync operation not found: ${operationId}`);
      }

      const updateData = {
        attempts: record.attempts + 1,
        error_message: errorMessage
      };

      console.log(`🔄 Incrementing sync attempts for:`, operationId, `(${updateData.attempts}/${record.max_attempts})`);
      
      return await this.update('sync_queue', operationId, updateData);
    } catch (error) {
      console.error('❌ Failed to increment sync attempts:', error);
      throw error;
    }
  }

  // ===========================
  // TRANSACTION SUPPORT
  // ===========================

  /**
   * Execute operations within a transaction
   * @param {Function} transactionFunction - Function to execute within transaction
   * @returns {Promise<any>} - Transaction result
   */
  async runTransaction(transactionFunction) {
    return await this.db.runTransaction(transactionFunction);
  }

  // ===========================
  // UTILITY METHODS
  // ===========================

  /**
   * Execute raw SQL query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} - Query result
   */
  async executeRaw(sql, params = []) {
    console.log('🔧 Executing raw SQL:', sql);
    return await this.db.execute(sql, params);
  }

  /**
   * Get all records from table
   * @param {string} tableName - Table name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - All records
   */
  async getAll(tableName, options = {}) {
    return await this.find(tableName, {}, options);
  }

  /**
   * Clear all data from a table
   * @param {string} tableName - Table name
   * @returns {Promise<void>}
   */
  async clearTable(tableName) {
    try {
      console.log(`🧹 Clearing table: ${tableName}`);
      await this.db.execute(`DELETE FROM ${tableName}`);
    } catch (error) {
      console.error(`❌ Failed to clear table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Get table statistics
   * @returns {Promise<Object>} - Table statistics
   */
  async getTableStats() {
    return await this.db.getTableStats();
  }

  /**
   * Backup table data to JSON
   * @param {string} tableName - Table name
   * @returns {Promise<Array>} - Table data as JSON
   */
  async backupTable(tableName) {
    try {
      console.log(`💾 Backing up table: ${tableName}`);
      const data = await this.getAll(tableName);
      return data;
    } catch (error) {
      console.error(`❌ Failed to backup table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Restore table data from JSON
   * @param {string} tableName - Table name
   * @param {Array} data - Data to restore
   * @param {boolean} clearFirst - Whether to clear table first
   * @returns {Promise<void>}
   */
  async restoreTable(tableName, data, clearFirst = true) {
    try {
      console.log(`📥 Restoring table: ${tableName} (${data.length} records)`);
      
      if (clearFirst) {
        await this.clearTable(tableName);
      }

      for (const record of data) {
        await this.insert(tableName, record);
      }

      console.log(`✅ Restored ${data.length} records to ${tableName}`);
    } catch (error) {
      console.error(`❌ Failed to restore table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Check if record exists
   * @param {string} tableName - Table name
   * @param {string} id - Record ID
   * @returns {Promise<boolean>} - Whether record exists
   */
  async exists(tableName, id) {
    try {
      const count = await this.count(tableName, { id });
      return count > 0;
    } catch (error) {
      console.error(`❌ Failed to check existence in ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Get a record by field value
   * @param {string} tableName - Table name
   * @param {string} field - Field name
   * @param {any} value - Field value
   * @returns {Promise<Object|null>} - Record or null
   */
  async getByField(tableName, field, value) {
    try {
      const result = await this.db.getFirst(`SELECT * FROM ${tableName} WHERE ${field} = ?`, [value]);
      return result || null;
    } catch (error) {
      console.error(`❌ Failed to get by field from ${tableName}:`, error);
      return null;
    }
  }

  /**
   * Upsert (insert or update) a record
   * @param {string} tableName - Table name
   * @param {Object} data - Data to upsert
   * @param {string} id - Record ID (if updating)
   * @returns {Promise<Object>} - Upserted record
   */
  async upsert(tableName, data, id = null) {
    try {
      const recordId = id || data.id;
      
      // Special handling for user_profiles table - check by user_id instead of id
      if (tableName === 'user_profiles' && data.user_id) {
        const existingRecord = await this.getByField(tableName, 'user_id', data.user_id);
        if (existingRecord) {
          console.log(`🔄 Updating existing record in ${tableName}:`, existingRecord.id);
          return await this.update(tableName, existingRecord.id, data);
        } else {
          console.log(`➕ Inserting new record in ${tableName}`);
          return await this.insert(tableName, data);
        }
      }
      
      // Standard upsert logic for other tables
      if (recordId && await this.exists(tableName, recordId)) {
        console.log(`🔄 Updating existing record in ${tableName}:`, recordId);
        return await this.update(tableName, recordId, data);
      } else {
        console.log(`➕ Inserting new record in ${tableName}`);
        return await this.insert(tableName, data);
      }
    } catch (error) {
      console.error(`❌ Failed to upsert in ${tableName}:`, error);
      throw error;
    }
  }
}

// Create and export singleton instance
export const sqliteService = new SqliteService();
export default sqliteService;
