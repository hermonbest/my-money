/**
 * Utility to clear failed sync items from AsyncStorage
 * This helps clean up old sync items that were created with wrong parameter names
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const clearFailedSyncItems = async () => {
  try {
    console.log('🧹 Clearing failed sync items...');
    
    // Get all keys from AsyncStorage
    const keys = await AsyncStorage.getAllKeys();
    
    // Find sync items that might be failing
    const syncKeys = keys.filter(key => 
      key.startsWith('process_sale_') || 
      key.startsWith('add_inventory_') ||
      key.startsWith('add_expense_') ||
      key.startsWith('add_sale_')
    );
    
    console.log(`🔍 Found ${syncKeys.length} sync items to check`);
    
    // Remove all sync items (they will be recreated if needed)
    if (syncKeys.length > 0) {
      await AsyncStorage.multiRemove(syncKeys);
      console.log(`✅ Cleared ${syncKeys.length} sync items`);
    } else {
      console.log('✅ No sync items found to clear');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error clearing failed sync items:', error);
    return false;
  }
};

export const clearAllSyncData = async () => {
  try {
    console.log('🧹 Clearing all sync data...');
    
    // Get all keys from AsyncStorage
    const keys = await AsyncStorage.getAllKeys();
    
    // Find all sync-related keys
    const syncKeys = keys.filter(key => 
      key.includes('_sync') ||
      key.startsWith('process_') ||
      key.startsWith('add_') ||
      key.startsWith('update_') ||
      key.startsWith('delete_')
    );
    
    console.log(`🔍 Found ${syncKeys.length} sync-related items to clear`);
    
    // Remove all sync items
    if (syncKeys.length > 0) {
      await AsyncStorage.multiRemove(syncKeys);
      console.log(`✅ Cleared ${syncKeys.length} sync-related items`);
    } else {
      console.log('✅ No sync-related items found to clear');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error clearing sync data:', error);
    return false;
  }
};
