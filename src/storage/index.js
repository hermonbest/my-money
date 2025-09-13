// =====================================================
// CENTRALIZED STORAGE SERVICE
// =====================================================
// Single source of truth for all data persistence
// Routes everything through SQLite, with expo-secure-store for auth
// =====================================================

import * as SecureStore from 'expo-secure-store';
import { dataRepository } from '../../utils/DataRepository';
import { sqliteService } from '../../utils/SqliteService';

/**
 * Centralized Storage Service
 * Provides a unified interface for all storage operations
 * - SQLite for all application data (inventory, sales, expenses, sync_queue)
 * - expo-secure-store for sensitive auth data (sessions, tokens)
 */
class CentralizedStorage {
  constructor() {
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * Initialize the storage service
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
      console.log('🗄️ Initializing centralized storage service...');
      
      // Initialize SQLite
      await dataRepository.init();
      
      this.initialized = true;
      console.log('✅ Centralized storage service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize centralized storage:', error);
      throw error;
    }
  }

  // ===========================
  // SECURE STORAGE (AUTH DATA)
  // ===========================

  /**
   * Store sensitive auth data securely
   * @param {string} key - Storage key
   * @param {string} value - Value to store (will be JSON stringified if object)
   * @returns {Promise<void>}
   */
  async setSecure(key, value) {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await SecureStore.setItemAsync(key, stringValue);
      console.log('🔐 Stored securely:', key);
    } catch (error) {
      console.error('❌ Failed to store secure data:', key, error);
      throw error;
    }
  }

  /**
   * Get sensitive auth data securely
   * @param {string} key - Storage key
   * @param {boolean} parseJson - Whether to parse as JSON
   * @returns {Promise<string|Object|null>}
   */
  async getSecure(key, parseJson = true) {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (!value) return null;
      
      if (parseJson) {
        try {
          return JSON.parse(value);
        } catch (parseError) {
          console.warn('⚠️ Failed to parse secure storage JSON:', key);
          return value;
        }
      }
      
      return value;
    } catch (error) {
      console.error('❌ Failed to get secure data:', key, error);
      return null;
    }
  }

  /**
   * Remove sensitive auth data
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  async removeSecure(key) {
    try {
      await SecureStore.deleteItemAsync(key);
      console.log('🗑️ Removed secure data:', key);
    } catch (error) {
      console.error('❌ Failed to remove secure data:', key, error);
    }
  }

  /**
   * Clear all secure storage (auth data)
   * @returns {Promise<void>}
   */
  async clearSecureStorage() {
    try {
      // Clear known auth keys
      const authKeys = ['user_session', 'user_tokens', 'cached_user_session'];
      
      for (const key of authKeys) {
        try {
          await this.removeSecure(key);
        } catch (error) {
          console.warn('⚠️ Failed to remove secure key:', key);
        }
      }
      
      console.log('🧹 Cleared all secure storage');
    } catch (error) {
      console.error('❌ Failed to clear secure storage:', error);
    }
  }

  // ===========================
  // SQLITE STORAGE (APP DATA)
  // ===========================

  /**
   * Store inventory data
   * @param {Object} itemData - Inventory item data
   * @param {string} userRole - User role
   * @returns {Promise<Object>}
   */
  async storeInventoryItem(itemData, userRole = 'individual') {
    await this._ensureInitialized();
    return await dataRepository.addInventoryItem(itemData, userRole);
  }

  /**
   * Get inventory data
   * @param {string} storeId - Store ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {Promise<Array>}
   */
  async getInventory(storeId, userId, userRole) {
    await this._ensureInitialized();
    return await dataRepository.getInventory(storeId, userId, userRole);
  }

  /**
   * Update inventory item
   * @param {string} itemId - Item ID
   * @param {Object} updates - Updates to apply
   * @param {string} userRole - User role
   * @returns {Promise<Object>}
   */
  async updateInventoryItem(itemId, updates, userRole = 'individual') {
    await this._ensureInitialized();
    return await dataRepository.updateInventoryItem(itemId, updates, userRole);
  }

  /**
   * Delete inventory item
   * @param {string} itemId - Item ID
   * @param {string} userRole - User role
   * @returns {Promise<boolean>}
   */
  async deleteInventoryItem(itemId, userRole = 'individual') {
    await this._ensureInitialized();
    return await dataRepository.deleteInventoryItem(itemId, userRole);
  }

  /**
   * Store sales data
   * @param {Object} saleData - Sale data
   * @param {Array} saleItems - Sale items
   * @param {string} userRole - User role
   * @returns {Promise<Object>}
   */
  async storeSale(saleData, saleItems, userRole = 'individual') {
    await this._ensureInitialized();
    return await dataRepository.processSale(saleData, saleItems, userRole);
  }

  /**
   * Get sales data
   * @param {string} storeId - Store ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {Promise<Array>}
   */
  async getSales(storeId, userId, userRole) {
    await this._ensureInitialized();
    return await dataRepository.getSales(storeId, userId, userRole);
  }

  /**
   * Store expense data
   * @param {Object} expenseData - Expense data
   * @param {string} userRole - User role
   * @returns {Promise<Object>}
   */
  async storeExpense(expenseData, userRole = 'individual') {
    await this._ensureInitialized();
    return await dataRepository.addExpense(expenseData, userRole);
  }

  /**
   * Get expenses data
   * @param {string} storeId - Store ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {Promise<Array>}
   */
  async getExpenses(storeId, userId, userRole) {
    await this._ensureInitialized();
    return await dataRepository.getExpenses(storeId, userId, userRole);
  }

  /**
   * Delete expense
   * @param {string} expenseId - Expense ID
   * @param {string} userRole - User role
   * @returns {Promise<boolean>}
   */
  async deleteExpense(expenseId, userRole = 'individual') {
    await this._ensureInitialized();
    return await dataRepository.deleteExpense(expenseId, userRole);
  }

  // ===========================
  // USER PROFILE STORAGE
  // ===========================

  /**
   * Store user profile
   * @param {Object} profileData - Profile data
   * @returns {Promise<Object>}
   */
  async storeUserProfile(profileData) {
    await this._ensureInitialized();
    return await dataRepository.storeUserProfile(profileData);
  }

  /**
   * Get user profile
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>}
   */
  async getUserProfile(userId) {
    await this._ensureInitialized();
    return await dataRepository.getUserProfile(userId);
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
   * @returns {Promise<Object>}
   */
  async addToSyncQueue(operationKey, tableName, recordId, operationType, data, syncFunctionRef = null) {
    await this._ensureInitialized();
    return await sqliteService.addToSyncQueue(operationKey, tableName, recordId, operationType, data, syncFunctionRef);
  }

  /**
   * Get pending sync operations
   * @param {number} limit - Maximum number of operations to return
   * @returns {Promise<Array>}
   */
  async getPendingSyncOperations(limit = 50) {
    await this._ensureInitialized();
    return await sqliteService.getPendingSyncOperations(limit);
  }

  /**
   * Mark sync operation as completed
   * @param {string} operationId - Sync operation ID
   * @returns {Promise<Object>}
   */
  async markSyncCompleted(operationId) {
    await this._ensureInitialized();
    return await sqliteService.markSyncCompleted(operationId);
  }

  /**
   * Increment sync attempts
   * @param {string} operationId - Sync operation ID
   * @param {string} errorMessage - Error message
   * @returns {Promise<Object>}
   */
  async incrementSyncAttempts(operationId, errorMessage = null) {
    await this._ensureInitialized();
    return await sqliteService.incrementSyncAttempts(operationId, errorMessage);
  }

  // ===========================
  // CACHE OPERATIONS (DASHBOARD)
  // ===========================

  /**
   * Store dashboard cache data
   * @param {string} cacheKey - Cache key
   * @param {Object} data - Data to cache
   * @param {number} ttlMinutes - Time to live in minutes
   * @returns {Promise<void>}
   */
  async storeDashboardCache(cacheKey, data, ttlMinutes = 60) {
    await this._ensureInitialized();
    
    const cacheData = {
      id: `cache_${cacheKey}`,
      key: cacheKey,
      data: JSON.stringify(data),
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      data_type: 'dashboard_cache',
      source: 'sqlite'
    };

    await sqliteService.upsert('cache_metadata', cacheData);
    console.log('📊 Stored dashboard cache:', cacheKey);
  }

  /**
   * Get dashboard cache data
   * @param {string} cacheKey - Cache key
   * @returns {Promise<Object|null>}
   */
  async getDashboardCache(cacheKey) {
    await this._ensureInitialized();
    
    try {
      const cacheRecord = await sqliteService.findById('cache_metadata', `cache_${cacheKey}`);
      
      if (!cacheRecord) {
        return null;
      }

      // Check if cache is expired
      if (cacheRecord.expires_at && new Date(cacheRecord.expires_at) < new Date()) {
        await sqliteService.delete('cache_metadata', cacheRecord.id);
        console.log('🗑️ Removed expired dashboard cache:', cacheKey);
        return null;
      }

      try {
        const data = JSON.parse(cacheRecord.data);
        console.log('📊 Retrieved dashboard cache:', cacheKey);
        return data;
      } catch (parseError) {
        console.warn('⚠️ Failed to parse dashboard cache:', cacheKey);
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to get dashboard cache:', cacheKey, error);
      return null;
    }
  }

  /**
   * Clear expired dashboard cache entries
   * @returns {Promise<number>}
   */
  async clearExpiredDashboardCache() {
    await this._ensureInitialized();
    
    try {
      const now = new Date().toISOString();
      const expiredCaches = await sqliteService.find('cache_metadata', {
        data_type: 'dashboard_cache'
      });

      let removedCount = 0;
      for (const cache of expiredCaches) {
        if (cache.expires_at && cache.expires_at < now) {
          await sqliteService.delete('cache_metadata', cache.id);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(`🧹 Cleared ${removedCount} expired dashboard cache entries`);
      }

      return removedCount;
    } catch (error) {
      console.error('❌ Failed to clear expired dashboard cache:', error);
      return 0;
    }
  }

  // ===========================
  // UTILITY METHODS
  // ===========================

  /**
   * Get storage statistics
   * @returns {Promise<Object>}
   */
  async getStorageStats() {
    await this._ensureInitialized();
    
    const sqliteStats = await dataRepository.getStats();
    const syncQueueCount = await sqliteService.count('sync_queue', { synced: false });
    const cacheCount = await sqliteService.count('cache_metadata');

    return {
      ...sqliteStats,
      pendingSyncOperations: syncQueueCount,
      cachedEntries: cacheCount,
      storageType: 'SQLite + SecureStore',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear all application data (keep auth data)
   * @returns {Promise<void>}
   */
  async clearAllAppData() {
    await this._ensureInitialized();
    
    console.log('🧹 Clearing all application data...');
    await dataRepository.clearAllData();
    console.log('✅ All application data cleared');
  }

  /**
   * Clear all data including auth
   * @returns {Promise<void>}
   */
  async clearAllData() {
    await this._ensureInitialized();
    
    console.log('🧹 Clearing all data including auth...');
    await this.clearAllAppData();
    await this.clearSecureStorage();
    console.log('✅ All data cleared');
  }

  /**
   * Run database transaction
   * @param {Function} transactionFunction - Function to execute within transaction
   * @returns {Promise<any>}
   */
  async runTransaction(transactionFunction) {
    await this._ensureInitialized();
    return await sqliteService.runTransaction(transactionFunction);
  }

  /**
   * Validate stock availability
   * @param {Array} saleItems - Sale items to validate
   * @param {string} userRole - User role
   * @param {string} storeId - Store ID
   * @returns {Promise<void>}
   */
  async validateStockAvailability(saleItems, userRole = 'individual', storeId = null) {
    await this._ensureInitialized();
    return await dataRepository.validateStockAvailability(saleItems, userRole, storeId);
  }

  /**
   * Find inventory item by temp ID
   * @param {string} tempId - Temporary ID to search for
   * @returns {Promise<Object|null>}
   */
  async findInventoryItemByTempId(tempId) {
    await this._ensureInitialized();
    return await dataRepository.findInventoryItemByTempId(tempId);
  }

  /**
   * Get stores for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getStores(userId) {
    await this._ensureInitialized();
    return await dataRepository.getStores(userId);
  }

  /**
   * Store store data
   * @param {Object} storeData - Store data
   * @returns {Promise<void>}
   */
  async storeStore(storeData) {
    await this._ensureInitialized();
    return await dataRepository.storeStore(storeData);
  }

  // ===========================
  // PRIVATE METHODS
  // ===========================

  /**
   * Ensure service is initialized
   * @private
   */
  async _ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Check if service is ready
   * @returns {boolean}
   */
  isReady() {
    return this.initialized && sqliteService.isReady();
  }
}

// Create and export singleton instance
export const centralizedStorage = new CentralizedStorage();
export default centralizedStorage;
