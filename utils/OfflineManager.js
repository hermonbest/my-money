import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
// Remove direct import of networkInterceptor to break circular dependency
// We'll attach it after both are initialized

class OfflineManager {
  constructor() {
    this.isOnline = true;
    this.syncQueue = [];
    this.listeners = [];
    this.transactions = new Map(); // Track active transactions for rollback
    this.initialized = false;
    this.syncInProgress = false;
    this.networkInterceptor = null;
    this.init();
  }

  async init() {
    try {
      // We'll set the network status after attachment
      this.initialized = true;
      console.log('🔄 OfflineManager initialized');
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

  // Store data locally
  async storeLocalData(key, data) {
    try {
      const jsonData = JSON.stringify({
        data,
        timestamp: new Date().toISOString(),
        synced: false
      });
      await AsyncStorage.setItem(`offline_${key}`, jsonData);
      console.log(`📱 Stored locally: ${key}`);
    } catch (error) {
      console.error('Error storing local data:', error);
    }
  }

  // Get data from local storage
  async getLocalData(key) {
    try {
      const jsonData = await AsyncStorage.getItem(`offline_${key}`);
      if (jsonData) {
        const parsed = JSON.parse(jsonData);
        return parsed.data;
      }
      return null;
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
        await this.storeLocalData(key, data);
        console.log(`✅ Synced online: ${key}`);
        return result;
      } catch (error) {
        console.log(`⚠️ Online sync failed, storing locally: ${key}`);
        await this.storeLocalData(key, data);
        this.addToSyncQueue(key, data, syncFunction);
        throw error;
      }
    } else {
      // Store locally and queue for sync
      await this.storeLocalData(key, data);
      this.addToSyncQueue(key, data, syncFunction);
      console.log(`📱 Stored offline: ${key}`);
      return { success: true, offline: true };
    }
  }

  // Add to sync queue
  addToSyncQueue(key, data, syncFunction) {
    this.syncQueue.push({
      key,
      data,
      syncFunction,
      timestamp: new Date().toISOString(),
      attempts: 0
    });
  }

  // Enhanced sync with conflict resolution and retry logic
  async syncWithConflictResolution() {
    if (this.syncInProgress) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    if (!this.isOnline || this.syncQueue.length === 0) {
      console.log('No sync needed - online status:', this.isOnline, 'queue length:', this.syncQueue.length);
      return;
    }

    this.syncInProgress = true;
    console.log(`🔄 Syncing ${this.syncQueue.length} pending changes...`);
    
    const queue = [...this.syncQueue];
    this.syncQueue = [];

    for (const item of queue) {
      try {
        await this.processSyncItem(item);
        console.log(`✅ Synced: ${item.key}`);
      } catch (error) {
        console.error(`❌ Sync failed for ${item.key}:`, error);
        // Re-add to queue with backoff if sync fails
        await this.requeueWithBackoff(item);
      }
    }
    
    this.syncInProgress = false;
    console.log('🔄 Sync process completed');
  }

  // Process individual sync item with retry logic
  async processSyncItem(item) {
    try {
      await item.syncFunction();
    } catch (error) {
      console.error(`❌ Sync failed for ${item.key}:`, error);
      throw error;
    }
  }

  // Requeue item with exponential backoff
  async requeueWithBackoff(item) {
    item.attempts = (item.attempts || 0) + 1;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, item.attempts - 1), 30000);
    
    console.log(`🔄 Requeuing ${item.key} with ${delay}ms delay (attempt ${item.attempts})`);
    
    setTimeout(() => {
      this.syncQueue.push(item);
      if (this.isOnline) {
        this.syncWithConflictResolution();
      }
    }, delay);
  }

  // Sync pending changes when back online
  async syncPendingChanges() {
    await this.syncWithConflictResolution();
  }

  // Get all local data keys
  async getAllLocalKeys() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return keys.filter(key => key.startsWith('offline_'));
    } catch (error) {
      console.error('Error getting local keys:', error);
      return [];
    }
  }

  // Debug function to inspect AsyncStorage contents
  async debugAsyncStorage() {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const offlineKeys = allKeys.filter(key => key.startsWith('offline_'));
      
      console.log('🔍 AsyncStorage Debug:');
      console.log('  - Total keys:', allKeys.length);
      console.log('  - Offline keys:', offlineKeys.length);
      
      if (offlineKeys.length > 0) {
        console.log('  - Offline keys list:', offlineKeys);
        
        // Show sample data for each key
        for (const key of offlineKeys.slice(0, 5)) { // Limit to first 5 for brevity
          try {
            const value = await AsyncStorage.getItem(key);
            const parsed = JSON.parse(value);
            console.log(`    ${key}:`, {
              dataLength: Array.isArray(parsed.data) ? parsed.data.length : 'not array',
              timestamp: parsed.timestamp,
              synced: parsed.synced
            });
          } catch (parseError) {
            console.log(`    ${key}: (parse error)`);
          }
        }
      }
    } catch (error) {
      console.error('Error debugging AsyncStorage:', error);
    }
  }

  // Clear all offline data
  async clearOfflineData() {
    try {
      const keys = await this.getAllLocalKeys();
      await AsyncStorage.multiRemove(keys);
      this.syncQueue = [];
      console.log('🧹 Cleared all offline data');
    } catch (error) {
      console.error('Error clearing offline data:', error);
    }
  }

  // Get sync status
  getSyncStatus() {
    return {
      isOnline: this.isOnline,
      pendingSync: this.syncQueue.length,
      lastSync: new Date().toISOString(),
      syncInProgress: this.syncInProgress
    };
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