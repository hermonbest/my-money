// Script to clear corrupted sales data from SQLite database
// This will help resolve the duplicate ID and transaction issues

import { sqliteService } from './utils/SqliteService.js';
import { centralizedStorage } from './src/storage/index.js';

async function clearCorruptedData() {
  console.log('🧹 Starting corrupted data cleanup...');
  
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
    
    // Reset auto-increment counters if needed
    console.log('🔄 Resetting database sequences...');
    await sqliteService.execute('DELETE FROM sqlite_sequence WHERE name IN ("sales", "sale_items", "sync_queue")');
    
    console.log('✅ Corrupted data cleanup completed successfully');
    console.log('📱 App should now work without transaction conflicts');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

// Export for use in the app
export { clearCorruptedData };

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  clearCorruptedData()
    .then(() => {
      console.log('🎉 Cleanup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Cleanup failed:', error);
      process.exit(1);
    });
}
