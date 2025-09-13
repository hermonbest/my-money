// Database Cleanup Utility
// Helps resolve corrupted data and transaction conflicts

import { sqliteService } from './SqliteService.js';
import { centralizedStorage } from '../src/storage/index.js';

class DatabaseCleanup {
  /**
   * Clear all corrupted sales data
   * This will resolve UNIQUE constraint and transaction conflicts
   */
  static async clearCorruptedSalesData() {
    console.log('🧹 Starting corrupted sales data cleanup...');
    
    try {
      // Initialize services
      await centralizedStorage.init();
      
      // Clear all sales and sale_items to start fresh
      console.log('🗑️ Clearing all sales data...');
      await sqliteService.execute('DELETE FROM sale_items');
      await sqliteService.execute('DELETE FROM sales');
      
      // Clear sync queue to prevent retry conflicts
      console.log('🗑️ Clearing sync queue...');
      await sqliteService.execute('DELETE FROM sync_queue');
      
      console.log('✅ Corrupted sales data cleanup completed');
      return { success: true, message: 'Sales data cleared successfully' };
      
    } catch (error) {
      console.error('❌ Error during sales data cleanup:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Clear all corrupted data (more comprehensive cleanup)
   */
  static async clearAllCorruptedData() {
    console.log('🧹 Starting comprehensive data cleanup...');
    
    try {
      await centralizedStorage.init();
      
      // Clear all data tables
      const tables = ['sale_items', 'sales', 'expenses', 'inventory', 'sync_queue'];
      
      for (const table of tables) {
        console.log(`🗑️ Clearing ${table}...`);
        await sqliteService.execute(`DELETE FROM ${table}`);
      }
      
      console.log('✅ Comprehensive data cleanup completed');
      return { success: true, message: 'All data cleared successfully' };
      
    } catch (error) {
      console.error('❌ Error during comprehensive cleanup:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Reset sync queue only (preserves data, clears sync conflicts)
   */
  static async clearSyncQueue() {
    console.log('🧹 Clearing sync queue...');
    
    try {
      await centralizedStorage.init();
      await sqliteService.execute('DELETE FROM sync_queue');
      
      console.log('✅ Sync queue cleared');
      return { success: true, message: 'Sync queue cleared successfully' };
      
    } catch (error) {
      console.error('❌ Error clearing sync queue:', error);
      return { success: false, error: error.message };
    }
  }
}

export { DatabaseCleanup };
export default DatabaseCleanup;
