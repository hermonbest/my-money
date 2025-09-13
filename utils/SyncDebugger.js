// =====================================================
// SYNC DEBUGGER
// =====================================================
// Debugging utilities for sync operations and queue
// =====================================================

import { syncDispatcher } from '../src/storage/SyncDispatcher';
import { centralizedStorage } from '../src/storage/index';

/**
 * Sync Debugger - Debugging utilities for sync operations
 */
class SyncDebugger {
  
  /**
   * Print comprehensive sync status
   */
  async printSyncStatus() {
    console.log('\n🔍 ===== SYNC DEBUG STATUS =====');
    
    try {
      // Get dispatcher stats
      const stats = await syncDispatcher.getSyncStats();
      console.log('📊 Dispatcher Stats:');
      console.log(`   - Pending: ${stats.pendingOperations}`);
      console.log(`   - Failed: ${stats.failedOperations}`);
      console.log(`   - Retryable: ${stats.retryableOperations}`);
      console.log(`   - Processing: ${stats.isProcessing}`);
      console.log(`   - Last Processed: ${stats.lastProcessed || 'Never'}`);
      
      // Get storage stats
      const storageStats = await centralizedStorage.getStorageStats();
      console.log('\n📈 Storage Stats:');
      Object.entries(storageStats).forEach(([key, value]) => {
        if (typeof value === 'number') {
          console.log(`   - ${key}: ${value}`);
        }
      });
      
      // Get pending operations details
      const pendingOps = await centralizedStorage.getPendingSyncOperations(10);
      if (pendingOps.length > 0) {
        console.log('\n📋 Pending Operations (first 10):');
        pendingOps.forEach((op, index) => {
          console.log(`   ${index + 1}. ${op.operation_key} (${op.table_name}/${op.operation_type})`);
          console.log(`      - Attempts: ${op.attempts}/${op.max_attempts}`);
          console.log(`      - Created: ${op.created_at}`);
          if (op.error_message) {
            console.log(`      - Error: ${op.error_message}`);
          }
        });
      } else {
        console.log('\n✅ No pending operations');
      }
      
    } catch (error) {
      console.error('❌ Error getting sync status:', error);
    }
    
    console.log('===== END SYNC DEBUG =====\n');
  }
  
  /**
   * Force sync all pending operations
   */
  async forceSyncAll() {
    console.log('🚀 Force syncing all pending operations...');
    
    try {
      const results = await syncDispatcher.processPendingOperations();
      console.log('🏁 Force sync results:', results);
      return results;
    } catch (error) {
      console.error('❌ Force sync failed:', error);
      throw error;
    }
  }
  
  /**
   * Clear all failed operations
   */
  async clearFailedOperations() {
    console.log('🧹 Clearing all failed operations...');
    
    try {
      const results = await syncDispatcher.clearFailedOperations();
      console.log('✅ Cleared failed operations:', results);
      return results;
    } catch (error) {
      console.error('❌ Failed to clear failed operations:', error);
      throw error;
    }
  }
  
  /**
   * Test sync dispatcher with a dummy operation
   */
  async testSyncDispatcher() {
    console.log('🧪 Testing sync dispatcher...');
    
    try {
      // Add a test operation to the queue
      await centralizedStorage.addToSyncQueue(
        'test_operation_' + Date.now(),
        'inventory',
        'test_record_id',
        'INSERT',
        {
          name: 'Test Item',
          quantity: 1,
          unit_price: 10.00,
          user_id: 'test_user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        'test'
      );
      
      console.log('✅ Test operation added to queue');
      
      // Print status
      await this.printSyncStatus();
      
      return { success: true, message: 'Test operation added successfully' };
    } catch (error) {
      console.error('❌ Test sync dispatcher failed:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
export const syncDebugger = new SyncDebugger();
export default syncDebugger;

// Global debug function for easy access in development
if (__DEV__) {
  global.syncDebug = syncDebugger;
  console.log('🔧 Sync debugger available as global.syncDebug');
}
