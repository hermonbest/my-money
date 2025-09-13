// RESET APP CACHE SCRIPT
// Add this to your App.js temporarily to clear all cached data

import AsyncStorage from '@react-native-async-storage/async-storage';

export const clearAllAppData = async () => {
  try {
    console.log('🧹 Starting complete app data cleanup...');
    
    // Get all keys
    const keys = await AsyncStorage.getAllKeys();
    console.log('📱 Found cached keys:', keys.length);
    
    // Clear all AsyncStorage data
    await AsyncStorage.clear();
    console.log('✅ All AsyncStorage data cleared');
    
    // Clear specific app caches
    const appKeys = [
      'user_profile_',
      'inventory_',
      'sales_',
      'expenses_',
      'stores_',
      'dashboard_',
      'cached_user_session'
    ];
    
    for (const keyPrefix of appKeys) {
      const keysToDelete = keys.filter(key => key.startsWith(keyPrefix));
      if (keysToDelete.length > 0) {
        await AsyncStorage.multiRemove(keysToDelete);
        console.log(`🗑️ Cleared ${keysToDelete.length} ${keyPrefix} keys`);
      }
    }
    
    console.log('✅ App cache completely cleared');
    return true;
  } catch (error) {
    console.error('❌ Error clearing app data:', error);
    return false;
  }
};

// Usage: Call this function once, then restart the app
// clearAllAppData();
