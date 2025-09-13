/**
 * Utility to clear failed sync items from SQLite sync queue
 * This helps clean up old sync items that are stuck in failed state
 */

import { centralizedStorage } from '../src/storage/index';
import { syncDispatcher } from '../src/storage/SyncDispatcher';

export const clearFailedSyncItems = async () => {
  try {
    console.log('🧹 Clearing failed sync items from SQLite...');
    
    // Clear failed operations using the dispatcher
    const result = await syncDispatcher.clearFailedOperations();
    
    console.log(`✅ Cleared ${result.cleared || 0} failed sync operations`);
    
    return true;
  } catch (error) {
    console.error('❌ Error clearing failed sync items:', error);
    return false;
  }
};

export const clearAllSyncData = async () => {
  try {
    console.log('🧹 Clearing ALL sync data from SQLite...');
    
    // Clear all pending operations and reset sync queue
    await centralizedStorage.clearAllAppData();
    
    console.log('✅ Cleared all sync data and reset storage');
    
    return true;
  } catch (error) {
    console.error('❌ Error clearing all sync data:', error);
    return false;
  }
};
