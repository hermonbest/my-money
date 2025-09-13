import { supabase } from './supabase';
import { centralizedStorage } from '../src/storage/index';
import { syncDispatcher } from '../src/storage/SyncDispatcher';
// Remove direct import of networkInterceptor to break circular dependency
// We'll attach it after both are initialized

class OfflineManager {
  constructor() {
    this.isOnline = true;
    this.listeners = [];
    this.transactions = new Map(); // Track active transactions for rollback
    this.initialized = false;
    this.syncInProgress = false;
    this.networkInterceptor = null;
    this.init();
  }

  async init() {
    try {
      // Initialize centralized storage
      await centralizedStorage.init();
      
      // We'll set the network status after attachment
      this.initialized = true;
      console.log('🔄 OfflineManager initialized with centralized storage');
    } catch (error) {
      console.error('Error initializing OfflineManager:', error);
      this.isOnline = true; // Default to online if detection fails
      this.initialized = true;
    }
  }

  // Method to attach network interceptor after both are created
  attachNetworkInterceptor(networkInterceptorInstance) {
    this.networkInterceptor = networkInterceptorInstance;
    // Attach this offline manager to the network interceptor
    this.networkInterceptor.attachToOfflineManager(this);
    // Set initial status
    this.isOnline = this.networkInterceptor.getCurrentStatus().isOnline;
    console.log('🔄 OfflineManager attached to network interceptor with status:', this.isOnline);
  }

  // Add listener for network state changes
  addNetworkListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.isOnline);
      } catch (error) {
        console.error('Error notifying network listener:', error);
      }
    });
  }

  // Check if currently online
  isConnected() {
    // If not initialized yet, assume online to avoid blocking the app
    if (!this.initialized) {
      return true;
    }
    // If no network interceptor attached, assume online
    if (!this.networkInterceptor) {
      return true;
    }
    return this.isOnline;
  }

  // Store data locally - now deprecated, use centralized storage directly
  async storeLocalData(key, data) {
    console.warn('⚠️ storeLocalData is deprecated. Use centralizedStorage directly.');
    try {
      // For backward compatibility, store as dashboard cache with short TTL
      await centralizedStorage.storeDashboardCache(`legacy_${key}`, data, 60);
      console.log(`📱 Stored locally via centralized storage: ${key}`);
    } catch (error) {
      console.error('Error storing local data:', error);
    }
  }

  // Get data from local storage - now deprecated, use centralized storage directly
  async getLocalData(key) {
    console.warn('⚠️ getLocalData is deprecated. Use centralizedStorage directly.');
    try {
      // For backward compatibility, try to get from dashboard cache
      const data = await centralizedStorage.getDashboardCache(`legacy_${key}`);
      return data;
    } catch (error) {
      console.error('Error getting local data:', error);
      return null;
    }
  }

  // Store data with offline support
  async storeData(key, data, syncFunction) {
    if (this.isOnline) {
      try {
        // Try to sync immediately
        const result = await syncFunction();
        // No need to store locally anymore - data is in SQLite via the sync function
        console.log(`✅ Synced online: ${key}`);
        return result;
      } catch (error) {
        console.log(`⚠️ Online sync failed, queuing for later sync: ${key}`);
        // Add to SQLite sync queue instead of storing locally
        await this.addToSyncQueue(key, data, syncFunction);
        throw error;
      }
    } else {
      // Queue for sync when back online
      await this.addToSyncQueue(key, data, syncFunction);
      console.log(`📱 Queued for sync when online: ${key}`);
      return { success: true, offline: true };
    }
  }

  // Add to sync queue - now uses SQLite
  async addToSyncQueue(key, data, syncFunction = null) {
    try {
      // Store in SQLite sync queue
      const operationKey = key;
      const tableName = this._extractTableNameFromKey(key);
      const recordId = data.id || `temp_${Date.now()}`;
      const operationType = 'INSERT'; // Default operation type
      
      await centralizedStorage.addToSyncQueue(
        operationKey,
        tableName,
        recordId,
        operationType,
        data,
        syncFunction ? 'customSyncFunction' : null
      );
      
      console.log(`📤 Added to SQLite sync queue: ${key}`);
    } catch (error) {
      console.error('❌ Failed to add to sync queue:', error);
      // Fallback: store in memory for this session only
      if (!this.memoryQueue) this.memoryQueue = [];
      this.memoryQueue.push({
        key,
        data,
        syncFunction,
        timestamp: new Date().toISOString(),
        attempts: 0
      });
    }
  }

  // Helper to extract table name from operation key
  _extractTableNameFromKey(key) {
    if (key.includes('inventory')) return 'inventory';
    if (key.includes('sale')) return 'sales';
    if (key.includes('expense')) return 'expenses';
    return 'unknown';
  }

  // Enhanced sync with dispatcher - now uses SyncDispatcher
  async syncWithConflictResolution() {
    if (!this.isOnline) {
      console.log('No sync needed - offline');
      return;
    }

    if (this.syncInProgress) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    this.syncInProgress = true;
    
    try {
      console.log('🚀 Starting sync via dispatcher...');
      
      // Use the new dispatcher for all sync operations
      const results = await syncDispatcher.processPendingOperations();
      
      if (results.alreadyInProgress) {
        console.log('Dispatcher was already processing');
        return results;
      }

      console.log(`🏁 Sync completed: ${results.succeeded}/${results.processed} operations succeeded`);
      
      if (results.failed > 0) {
        console.warn(`⚠️ ${results.failed} operations failed:`, results.errors);
      }
      
      return results;
    } catch (error) {
      console.error('❌ Sync process failed:', error);
      return {
        processed: 0,
        succeeded: 0,
        failed: 1,
        errors: [{ operation: 'sync_manager', error: error.message }]
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  // Legacy sync methods - now handled by SyncDispatcher
  // These are kept for backward compatibility but delegate to the dispatcher

  // Sync pending changes when back online
  async syncPendingChanges() {
    await this.syncWithConflictResolution();
  }

  // Debug function to inspect SQLite storage contents
  async debugSQLiteStorage() {
    try {
      const stats = await centralizedStorage.getStorageStats();
      
      console.log('🔍 SQLite Storage Debug:');
      console.log('  - Storage type:', stats.storageType);
      console.log('  - Pending sync operations:', stats.pendingSyncOperations);
      console.log('  - Cached entries:', stats.cachedEntries);
      console.log('  - Table stats:', stats);
      
      // Show pending sync operations
      const pendingOps = await centralizedStorage.getPendingSyncOperations(10);
      if (pendingOps.length > 0) {
        console.log('  - Sample pending operations:');
        pendingOps.forEach((op, index) => {
          console.log(`    ${index + 1}. ${op.operation_key} (${op.table_name}/${op.operation_type}) - attempts: ${op.attempts}`);
        });
      }
    } catch (error) {
      console.error('Error debugging SQLite storage:', error);
    }
  }

  // Clear all offline data - now clears SQLite data
  async clearOfflineData() {
    try {
      await centralizedStorage.clearAllAppData();
      console.log('🧹 Cleared all offline data from SQLite');
    } catch (error) {
      console.error('Error clearing offline data:', error);
    }
  }

  // Get sync status - now uses dispatcher stats
  async getSyncStatus() {
    try {
      const dispatcherStats = await syncDispatcher.getSyncStats();
      
      return {
        isOnline: this.isOnline,
        pendingSync: dispatcherStats.pendingOperations,
        failedOperations: dispatcherStats.failedOperations,
        retryableOperations: dispatcherStats.retryableOperations,
        lastSync: dispatcherStats.lastProcessed,
        syncInProgress: this.syncInProgress || dispatcherStats.isProcessing,
        storageType: 'SQLite + Dispatcher'
      };
    } catch (error) {
      console.error('Error getting sync status:', error);
      return {
        isOnline: this.isOnline,
        pendingSync: 0,
        failedOperations: 0,
        retryableOperations: 0,
        lastSync: new Date().toISOString(),
        syncInProgress: this.syncInProgress,
        storageType: 'SQLite + Dispatcher (error)',
        error: error.message
      };
    }
  }

  // Transaction rollback methods
  async beginTransaction(transactionId, operations = []) {
    this.transactions.set(transactionId, {
      id: transactionId,
      operations,
      rollbackData: [],
      timestamp: new Date().toISOString()
    });
    console.log(`🔄 Transaction started: ${transactionId}`);
  }

  async addToTransaction(transactionId, operation) {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      transaction.operations.push(operation);
    }
  }

  async commitTransaction(transactionId) {
    const transaction = this.transactions.get(transactionId);
    if (transaction) {
      console.log(`✅ Transaction committed: ${transactionId}`);
      this.transactions.delete(transactionId);
      return true;
    }
    return false;
  }

  async rollbackTransaction(transactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      console.warn(`⚠️ Transaction not found for rollback: ${transactionId}`);
      return false;
    }

    console.log(`🔄 Rolling back transaction: ${transactionId}`);
    
    try {
      // Rollback operations in reverse order
      for (let i = transaction.rollbackData.length - 1; i >= 0; i--) {
        const rollbackOp = transaction.rollbackData[i];
        try {
          await rollbackOp.rollbackFunction();
          console.log(`✅ Rolled back: ${rollbackOp.key}`);
        } catch (error) {
          console.error(`❌ Rollback failed for ${rollbackOp.key}:`, error);
        }
      }
      
      this.transactions.delete(transactionId);
      console.log(`✅ Transaction rollback completed: ${transactionId}`);
      return true;
    } catch (error) {
      console.error(`❌ Transaction rollback failed: ${transactionId}`, error);
      return false;
    }
  }

  // Enhanced store data with transaction support
  async storeDataWithTransaction(key, data, syncFunction, rollbackFunction, transactionId = null) {
    if (transactionId) {
      const transaction = this.transactions.get(transactionId);
      if (transaction) {
        transaction.rollbackData.push({
          key,
          rollbackFunction,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Use existing storeData logic
    return await this.storeData(key, data, syncFunction);
  }
}

// Create singleton instance
export const offlineManager = new OfflineManager();
export default offlineManager;