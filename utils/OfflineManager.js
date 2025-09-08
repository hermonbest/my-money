import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';

class OfflineManager {
  constructor() {
    this.isOnline = true;
    this.syncQueue = [];
    this.listeners = [];
    this.transactions = new Map(); // Track active transactions for rollback
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      // Check initial network state
      const netInfo = await NetInfo.fetch();
      this.isOnline = netInfo.isConnected;
      
      // Listen for network changes
      const unsubscribe = NetInfo.addEventListener(state => {
        console.log('🌐 Network status changed:', state);
        const wasOffline = !this.isOnline;
        this.isOnline = state.isConnected;
        
        if (wasOffline && this.isOnline) {
          console.log('✅ Back online - processing sync queue');
          this.syncPendingChanges();
        } else if (!this.isOnline) {
          console.log('⚠️ Offline mode activated');
        }
        
        this.notifyListeners();
      });
      
      // Store unsubscribe function for cleanup
      this.unsubscribe = unsubscribe;
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing OfflineManager:', error);
      this.isOnline = true; // Default to online if detection fails
      this.initialized = true;
    }
  }

  // Add listener for network state changes
  addNetworkListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  notifyListeners() {
    this.listeners.forEach(listener => listener(this.isOnline));
  }

  // Check if currently online
  isConnected() {
    // If not initialized yet, assume online to avoid blocking the app
    if (!this.initialized) {
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
      timestamp: new Date().toISOString()
    });
  }

  // Sync pending changes when back online
  async syncPendingChanges() {
    if (!this.isOnline || this.syncQueue.length === 0) return;

    console.log(`🔄 Syncing ${this.syncQueue.length} pending changes...`);
    
    const queue = [...this.syncQueue];
    this.syncQueue = [];

    for (const item of queue) {
      try {
        await item.syncFunction();
        console.log(`✅ Synced: ${item.key}`);
      } catch (error) {
        console.error(`❌ Sync failed for ${item.key}:`, error);
        // Re-add to queue if sync fails
        this.syncQueue.push(item);
      }
    }
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
      lastSync: new Date().toISOString()
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
