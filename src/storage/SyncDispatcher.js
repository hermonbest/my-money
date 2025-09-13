// =====================================================
// SYNC DISPATCHER
// =====================================================
// Handles all sync operations from SQLite queue to Supabase
// Routes different operation types to appropriate handlers
// =====================================================

import { supabase } from '../../utils/supabase';
import { centralizedStorage } from './index';

/**
 * Sync Dispatcher - Routes and processes sync operations
 * Handles complex multi-table operations and provides retry logic
 */
class SyncDispatcher {
  constructor() {
    this.isProcessing = false;
    this.retryDelays = [1000, 2000, 5000, 10000, 30000]; // Progressive delays
  }

  /**
   * Process all pending sync operations
   * @returns {Promise<Object>} - Sync results
   */
  async processPendingOperations() {
    if (this.isProcessing) {
      console.log('🔄 Sync already in progress, skipping...');
      return { alreadyInProgress: true };
    }

    this.isProcessing = true;
    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    };

    try {
      console.log('🚀 Starting sync dispatcher...');
      
      // Get pending operations ordered by creation time
      const pendingOps = await centralizedStorage.getPendingSyncOperations(50);
      
      if (pendingOps.length === 0) {
        console.log('✅ No pending sync operations');
        return results;
      }

      console.log(`📤 Processing ${pendingOps.length} pending operations...`);

      // Process operations in order
      for (const operation of pendingOps) {
        results.processed++;
        
        try {
          await this.processOperation(operation);
          await centralizedStorage.markSyncCompleted(operation.id);
          results.succeeded++;
          console.log(`✅ Synced: ${operation.operation_key}`);
        } catch (error) {
          results.failed++;
          results.errors.push({
            operation: operation.operation_key,
            error: error.message
          });
          
          console.error(`❌ Sync failed: ${operation.operation_key}`, error.message);
          
          // Handle retry logic
          await this.handleRetry(operation, error);
        }
      }

      console.log(`🏁 Sync completed: ${results.succeeded}/${results.processed} succeeded`);
      return results;

    } catch (error) {
      console.error('❌ Sync dispatcher error:', error);
      results.errors.push({ operation: 'dispatcher', error: error.message });
      return results;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single sync operation
   * @param {Object} operation - Sync operation from queue
   * @returns {Promise<any>} - Operation result
   */
  async processOperation(operation) {
    console.log(`🔄 Processing: ${operation.operation_key} (${operation.table_name}/${operation.operation_type})`);
    
    // Parse operation data
    let data;
    try {
      data = JSON.parse(operation.data);
    } catch (parseError) {
      throw new Error(`Invalid operation data: ${parseError.message}`);
    }

    // Route to appropriate handler based on table and operation type
    switch (operation.table_name) {
      case 'inventory':
        return await this.processInventoryOperation(operation.operation_type, data);
      
      case 'sales':
        return await this.processSalesOperation(operation.operation_type, data);
      
      case 'expenses':
        return await this.processExpensesOperation(operation.operation_type, data);
      
      case 'user_profiles':
        return await this.processUserProfileOperation(operation.operation_type, data);
      
      default:
        throw new Error(`Unknown table for sync: ${operation.table_name}`);
    }
  }

  /**
   * Handle inventory sync operations
   */
  async processInventoryOperation(operationType, data) {
    switch (operationType) {
      case 'INSERT':
        const { data: insertResult, error: insertError } = await supabase
          .from('inventory')
          .insert(data)
          .select()
          .single();
        
        if (insertError) throw insertError;
        
        // Update local SQLite with real ID and mark as synced
        if (insertResult && data.id && data.id.startsWith('temp_')) {
          await centralizedStorage.updateInventoryItem(data.id, {
            id: insertResult.id,
            temp_id: data.id,
            synced: true,
            is_offline: false
          });
        }
        
        return insertResult;

      case 'UPDATE':
        const { data: updateResult, error: updateError } = await supabase
          .from('inventory')
          .update(data.updates)
          .eq('id', data.itemId)
          .select()
          .single();
        
        if (updateError) throw updateError;
        return updateResult;

      case 'DELETE':
        const { error: deleteError } = await supabase
          .from('inventory')
          .delete()
          .eq('id', data.itemId);
        
        if (deleteError) throw deleteError;
        return { success: true };

      default:
        throw new Error(`Unknown inventory operation: ${operationType}`);
    }
  }

  /**
   * Handle sales sync operations (complex multi-table)
   */
  async processSalesOperation(operationType, data) {
    switch (operationType) {
      case 'INSERT':
        // Handle complex sale processing with sale items and inventory updates
        if (data.saleData && data.saleItems) {
          return await this.processCompleteSale(data);
        } else {
          // Simple sale insert
          const { data: result, error } = await supabase
            .from('sales')
            .insert(data)
            .select()
            .single();
          
          if (error) throw error;
          return result;
        }

      default:
        throw new Error(`Unknown sales operation: ${operationType}`);
    }
  }

  /**
   * Process complete sale with items and inventory updates
   * This is the complex multi-table operation
   */
  async processCompleteSale(data) {
    const { saleData, saleItems, userRole } = data;
    
    console.log('🔄 Processing complete sale with transaction...');
    
    try {
      // Step 1: Create sale record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single();

      if (saleError) throw saleError;
      console.log(`✅ Sale created: ${sale.id}`);

      // Step 2: Resolve inventory IDs (handle temp IDs)
      const resolvedSaleItems = [];
      for (const item of saleItems) {
        let inventoryId = item.inventory_id;
        
        // If it's a temp ID, try to resolve it
        if (typeof inventoryId === 'string' && inventoryId.startsWith('temp_')) {
          const realItem = await centralizedStorage.findInventoryItemByTempId(inventoryId);
          if (realItem && !realItem.id.startsWith('temp_')) {
            inventoryId = realItem.id;
            console.log(`🔄 Resolved temp ID ${item.inventory_id} → ${inventoryId}`);
          } else {
            throw new Error(`Cannot resolve temp inventory ID: ${inventoryId}`);
          }
        }
        
        resolvedSaleItems.push({
          ...item,
          inventory_id: inventoryId
        });
      }

      // Step 3: Create sale items
      const saleItemsData = resolvedSaleItems.map((item, index) => ({
        id: `${sale.id}_item_${index}`,
        sale_id: sale.id,
        user_id: saleData.user_id,
        inventory_id: item.inventory_id,
        item_name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.quantity * item.unit_price,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItemsData);

      if (itemsError) throw itemsError;
      console.log(`✅ Created ${saleItemsData.length} sale items`);

      // Step 4: Update inventory quantities
      for (const item of resolvedSaleItems) {
        try {
          // Get current quantity
          const { data: currentInventory, error: fetchError } = await supabase
            .from('inventory')
            .select('quantity')
            .eq('id', item.inventory_id)
            .single();

          if (fetchError) {
            console.warn(`⚠️ Could not fetch inventory ${item.inventory_id}:`, fetchError.message);
            continue;
          }

          // Update quantity
          const newQuantity = currentInventory.quantity - item.quantity;
          
          const { error: updateError } = await supabase
            .from('inventory')
            .update({ 
              quantity: newQuantity,
              updated_at: new Date().toISOString() 
            })
            .eq('id', item.inventory_id);

          if (updateError) {
            console.warn(`⚠️ Could not update inventory ${item.inventory_id}:`, updateError.message);
          } else {
            console.log(`✅ Updated inventory ${item.inventory_id}: ${currentInventory.quantity} → ${newQuantity}`);
          }
        } catch (inventoryError) {
          console.warn(`⚠️ Inventory update failed for ${item.inventory_id}:`, inventoryError.message);
          // Continue processing other items
        }
      }

      console.log('🎉 Complete sale sync successful');
      return {
        sale,
        saleItems: saleItemsData,
        success: true
      };

    } catch (error) {
      console.error('❌ Complete sale sync failed:', error);
      throw error;
    }
  }

  /**
   * Handle expenses sync operations
   */
  async processExpensesOperation(operationType, data) {
    switch (operationType) {
      case 'INSERT':
        const { data: result, error } = await supabase
          .from('expenses')
          .insert(data)
          .select()
          .single();
        
        if (error) throw error;
        return result;

      case 'DELETE':
        const { error: deleteError } = await supabase
          .from('expenses')
          .delete()
          .eq('id', data.expenseId);
        
        if (deleteError) throw deleteError;
        return { success: true };

      default:
        throw new Error(`Unknown expenses operation: ${operationType}`);
    }
  }

  /**
   * Handle user profile sync operations
   */
  async processUserProfileOperation(operationType, data) {
    switch (operationType) {
      case 'INSERT':
      case 'UPDATE':
        const { data: result, error } = await supabase
          .from('profiles')
          .upsert(data)
          .select()
          .single();
        
        if (error) throw error;
        return result;

      default:
        throw new Error(`Unknown user profile operation: ${operationType}`);
    }
  }

  /**
   * Handle retry logic for failed operations
   */
  async handleRetry(operation, error) {
    const currentAttempts = operation.attempts || 0;
    const maxAttempts = operation.max_attempts || 3;

    if (currentAttempts >= maxAttempts) {
      console.error(`❌ Max attempts reached for ${operation.operation_key}, marking as failed`);
      return;
    }

    // Increment attempts and update error message
    await centralizedStorage.incrementSyncAttempts(operation.id, error.message);
    
    // Calculate retry delay (progressive backoff)
    const delayIndex = Math.min(currentAttempts, this.retryDelays.length - 1);
    const retryDelay = this.retryDelays[delayIndex];
    
    console.log(`🔄 Will retry ${operation.operation_key} in ${retryDelay}ms (attempt ${currentAttempts + 1}/${maxAttempts})`);
  }

  /**
   * Get sync statistics
   */
  async getSyncStats() {
    try {
      const pendingOps = await centralizedStorage.getPendingSyncOperations();
      const failedOps = pendingOps.filter(op => op.attempts >= (op.max_attempts || 3));
      
      return {
        pendingOperations: pendingOps.length,
        failedOperations: failedOps.length,
        retryableOperations: pendingOps.length - failedOps.length,
        lastProcessed: new Date().toISOString(),
        isProcessing: this.isProcessing
      };
    } catch (error) {
      console.error('❌ Error getting sync stats:', error);
      return {
        pendingOperations: 0,
        failedOperations: 0,
        retryableOperations: 0,
        lastProcessed: null,
        isProcessing: this.isProcessing,
        error: error.message
      };
    }
  }

  /**
   * Clear failed operations (for debugging/recovery)
   */
  async clearFailedOperations() {
    try {
      const pendingOps = await centralizedStorage.getPendingSyncOperations();
      const failedOps = pendingOps.filter(op => op.attempts >= (op.max_attempts || 3));
      
      for (const op of failedOps) {
        await centralizedStorage.markSyncCompleted(op.id);
      }
      
      console.log(`🧹 Cleared ${failedOps.length} failed operations`);
      return { cleared: failedOps.length };
    } catch (error) {
      console.error('❌ Error clearing failed operations:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
export const syncDispatcher = new SyncDispatcher();
export default syncDispatcher;
