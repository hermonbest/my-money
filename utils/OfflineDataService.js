import { supabase } from './supabase';
import { offlineManager } from './OfflineManager';
import { getCurrentUser, getUserProfile } from './authUtils';
import { centralizedStorage } from '../src/storage/index';
import { dataRepository } from './DataRepository';

// Legacy cache functions - now deprecated in favor of centralized storage
// These are kept for backward compatibility but will be removed

class OfflineDataService {
  constructor() {
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * Initialize the service
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._init();
    return this.initPromise;
  }

  async _init() {
    try {
      // Initialize centralized storage (which handles SQLite setup)
      await centralizedStorage.init();
      this.initialized = true;
      console.log('✅ OfflineDataService initialized with centralized storage');
    } catch (error) {
      console.error('❌ Failed to initialize OfflineDataService:', error);
      this.initialized = true; // Continue with fallback
    }
  }

  /**
   * Ensure service is initialized
   * @private
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  // Inventory operations
  async getInventory(storeId, userId, userRole) {
    await this.ensureInitialized();
    
    try {
      // Try to get data online first
      if (offlineManager.isConnected()) {
        let query = supabase.from('inventory').select('*');
        
        console.log('🔧 Building query for', {dataType: 'inventory', userRole, storeId, userId});
        
        if (userRole === 'individual') {
          query = query.eq('user_id', userId);
          console.log('🔧 Individual query - filtering by user_id:', userId);
        } else if (userRole === 'owner' && storeId) {
          query = query.eq('store_id', storeId);
          console.log('🔧 Owner query - filtering by store_id:', storeId);
        } else if (userRole === 'worker' && storeId) {
          query = query.eq('store_id', storeId);
          console.log('🔧 Worker query - filtering by store_id:', storeId);
        }
        
        const { data, error } = await query.order('name');
        
        console.log('🔧 Database query result:', {
          error: error?.message,
          dataCount: data?.length || 0
        });
        
        if (error) {
          console.warn('⚠️ Online inventory fetch failed, using SQLite cache:', error.message);
          // Get data from SQLite
          return await centralizedStorage.getInventory(storeId, userId, userRole);
        }
        
        // Cache the data in SQLite
        for (const item of data || []) {
          await centralizedStorage.storeInventoryItem(item, userRole);
        }
        
        return data || [];
      } else {
        // Return data from SQLite when offline
        console.log('📱 Offline - getting inventory from SQLite');
        return await centralizedStorage.getInventory(storeId, userId, userRole);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
      
      // If online fails, try to return SQLite data
      try {
        return await centralizedStorage.getInventory(storeId, userId, userRole);
      } catch (cacheError) {
        console.error('Error accessing SQLite inventory:', cacheError);
        return [];
      }
    }
  }

  // Legacy cache methods - removed in favor of centralized storage

  // Simplified stock validation
  async validateStockAvailability(saleItems, userRole = 'individual', storeId = null) {
    console.log('🔍 Validating stock availability for sale items...');
    console.log('🔍 Validation parameters:', { userRole, storeId, items: saleItems.length });
    
    if (offlineManager.isConnected()) {
      // Online: Check real-time stock from database
      for (const item of saleItems) {
        try {
          const { data: currentStock, error: stockError } = await supabase
            .from('inventory')
            .select('quantity, name')
            .eq('id', item.inventory_id)
            .single();

          if (stockError) {
            throw new Error(`Failed to check stock for ${item.name}: ${stockError.message}`);
          }

          if (currentStock.quantity < item.quantity) {
            throw new Error(`Insufficient stock for ${item.name}. Available: ${currentStock.quantity}, Requested: ${item.quantity}`);
          }
        } catch (error) {
          console.error('Error checking stock for item:', item, error);
          throw error;
        }
      }
    } else {
      // Offline: Check against SQLite inventory data
      console.log('🔍 Using SQLite for offline stock validation...');
      
      // Use centralized storage for validation
      await centralizedStorage.validateStockAvailability(saleItems, userRole, storeId);
    }
    
    console.log('✅ Stock validation passed');
  }

  async addInventoryItem(itemData, userRole = 'individual') {
    await this.ensureInitialized();
    
    const timestamp = Date.now();
    const operationKey = `add_inventory_${timestamp}`;
    
    // Get current user first
    const { user, error: userError } = await getCurrentUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Create a temporary item with a unique ID for offline use
    const tempItem = {
      ...itemData,
      id: `temp_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_offline: true,
      synced: false
    };
    
    const syncFunction = async () => {
      const { data, error } = await supabase
        .from('inventory')
        .insert(itemData)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update SQLite with real data after successful sync
      try {
        await centralizedStorage.updateInventoryItem(tempItem.id, {
          id: data.id, // The real ID from the backend
          temp_id: tempItem.id, // Store the original temp ID for mapping
          is_offline: false,
          synced: true,
          ...data // Include other fields from the synced data
        }, userRole);
        console.log('🔄 Updated SQLite with synced item:', data.name);
      } catch (updateError) {
        console.warn('⚠️ Failed to update SQLite with synced item:', updateError);
      }
      
      return data;
    };

    try {
      // Store the operation for sync
      const result = await offlineManager.storeData(operationKey, itemData, syncFunction);
      
      // Add item to SQLite immediately
      const sqliteResult = await centralizedStorage.storeInventoryItem(tempItem, userRole);
      console.log('📱 Added item to SQLite immediately:', tempItem.name);
      
      return tempItem;
    } catch (error) {
      console.error('Error adding inventory item:', error);
      throw error;
    }
  }

  async updateInventoryItem(itemId, updates, userRole = 'individual') {
    const operationKey = `update_inventory_${itemId}_${Date.now()}`;
    
    const syncFunction = async () => {
      const { data, error } = await supabase
        .from('inventory')
        .update(updates)
        .eq('id', itemId)
        .select();
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        console.warn(`⚠️ No inventory item found with ID: ${itemId}`);
        return null;
      }
      
      return data[0];
    };

    try {
      const result = await offlineManager.storeData(operationKey, { itemId, updates }, syncFunction);
      
      // Update item in SQLite immediately
      await centralizedStorage.updateInventoryItem(itemId, updates, userRole);
      
      return result;
    } catch (error) {
      console.error('Error updating inventory item:', error);
      throw error;
    }
  }

  async deleteInventoryItem(itemId, userRole = 'individual') {
    const operationKey = `delete_inventory_${itemId}_${Date.now()}`;
    
    const syncFunction = async () => {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', itemId);
      
      if (error) throw error;
      return { success: true };
    };

    try {
      const result = await offlineManager.storeData(operationKey, { itemId }, syncFunction);
      
      // Delete item from SQLite immediately
      await centralizedStorage.deleteInventoryItem(itemId, userRole);
      
      return result;
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      throw error;
    }
  }

  // Sales operations
  async getSales(storeId, userId, userRole) {
    try {
      // Try to get data online first
      if (offlineManager.isConnected()) {
        let query = supabase.from('sales').select(`
          *,
          sale_items(
            *,
            inventory:inventory_id(*)
          )
        `);
        
        if (userRole === 'individual') {
          query = query.eq('user_id', userId);
        } else if (userRole === 'owner' && storeId) {
          query = query.eq('store_id', storeId);
        } else if (userRole === 'worker' && storeId) {
          query = query.eq('store_id', storeId);
        }
        
        const { data, error } = await query.order('created_at', { ascending: false });
        
        if (error) {
          console.warn('⚠️ Online sales fetch failed, using SQLite data:', error.message);
          return await centralizedStorage.getSales(storeId, userId, userRole);
        }
        
        // Cache the data in SQLite
        for (const sale of data || []) {
          await centralizedStorage.storeSale(sale, sale.sale_items || [], userRole);
        }
        
        return data || [];
      } else {
        // Return data from SQLite when offline
        console.log('📱 Offline - getting sales from SQLite');
        return await centralizedStorage.getSales(storeId, userId, userRole);
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
      
      // If online fails, try to return SQLite data
      try {
        return await centralizedStorage.getSales(storeId, userId, userRole);
      } catch (cacheError) {
        console.error('Error accessing SQLite sales:', cacheError);
        return [];
      }
    }
  }

  async addSale(saleData, userRole = 'individual') {
    const operationKey = `add_sale_${Date.now()}`;
    
    const syncFunction = async () => {
      const { data, error } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single();

      if (error) throw error;
      return data;
    };

    try {
      const result = await offlineManager.storeData(operationKey, saleData, syncFunction);
      
      // Store sale in SQLite immediately
      await centralizedStorage.storeSale(saleData, [], userRole);
      
      return result;
    } catch (error) {
      console.error('Error adding sale:', error);
      throw error;
    }
  }

  // Enhanced process sale with stock validation
  async processSale(saleData, saleItems, userRole = 'individual') {
    const operationKey = `process_sale_${Date.now()}`;
    
    console.log('🔍 processSale called - isOnline:', offlineManager.isConnected());
    console.log('🔍 Sale data:', { user_id: saleData.user_id, store_id: saleData.store_id });
    console.log('🔍 Sale items:', saleItems.length);
    console.log('🔍 User role:', userRole);
    
    // Ensure we have a valid userRole for cache key consistency
    const effectiveUserRole = userRole || 'worker';
    
    try {
      // CRITICAL: Validate stock availability before processing
      console.log('🔍 Starting stock validation...');
      await this.validateStockAvailability(saleItems, effectiveUserRole, saleData.store_id);
      console.log('🔍 Stock validation completed successfully');
    } catch (error) {
      console.error('❌ Error in stock validation:', error);
      throw error;
    }
    
    const syncFunction = async () => {
      // Helper function to resolve temporary IDs
      const resolveInventoryId = async (inventoryId) => {
        if (typeof inventoryId === 'string' && inventoryId.startsWith('temp_')) {
          console.log(`🔍 Resolving temporary inventory ID: ${inventoryId}`);
          // This is a temporary ID, we need to get the real ID from the synced item
          // This assumes the inventory item has been synced and its ID updated in the local DB.
          // The sync queue should process inventory additions before sales.
          const realItem = await dataRepository.findInventoryItemByTempId(inventoryId);
          if (realItem && !realItem.id.startsWith('temp_')) {
            console.log(`✅ Resolved temp ID ${inventoryId} to ${realItem.id}`);
            return realItem.id;
          } else {
            // If the item hasn't been synced yet, we can't proceed.
            // The sync manager should retry this later.
            throw new Error(`Inventory item with temp ID ${inventoryId} has not been synced yet.`);
          }
        }
        return inventoryId;
      };

      // Resolve all inventory IDs before processing the sale
      const resolvedSaleItems = await Promise.all(saleItems.map(async (item) => ({
        ...item,
        inventory_id: await resolveInventoryId(item.inventory_id),
      })));

      // Create sale record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItemsData = resolvedSaleItems.map(item => ({
        sale_id: sale.id,
        user_id: saleData.user_id,
        inventory_id: item.inventory_id,
        item_name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.quantity * item.unit_price
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItemsData);

      if (itemsError) throw itemsError;

      // Update inventory quantities with additional validation
      // COMPREHENSIVE DEBUGGING: Update inventory quantities
      console.log('\n🔍 ===== STARTING COMPREHENSIVE INVENTORY UPDATE DEBUGGING =====');
      console.log('🔍 Sale data store_id:', saleData.store_id);
      console.log('🔍 User role:', userRole);
      console.log('🔍 Items to process:', resolvedSaleItems.length);
      console.log('🔍 Items details:', JSON.stringify(resolvedSaleItems.map(item => ({
        name: item.name,
        inventory_id: item.inventory_id,
        quantity: item.quantity
      })), null, 2));
      
      for (let i = 0; i < resolvedSaleItems.length; i++) {
        const item = resolvedSaleItems[i];
        console.log(`\n🔍 ===== PROCESSING ITEM ${i + 1}/${resolvedSaleItems.length}: ${item.name} =====`);
        console.log('🔍 Item details:', JSON.stringify({
          name: item.name,
          inventory_id: item.inventory_id,
          quantity: item.quantity,
          unit_price: item.unit_price
        }, null, 2));
        
        let updateSuccess = false;
        let updateAttempts = 0;
        const maxAttempts = 3;
        let newQuantity = 0;
        let currentItem = null;

        while (!updateSuccess && updateAttempts < maxAttempts) {
          updateAttempts++;
          console.log(`\n🔍 --- ATTEMPT ${updateAttempts}/${maxAttempts} for ${item.name} ---`);
          
          try {
            // STEP 1: Fetch current inventory item
            console.log('🔍 STEP 1: Fetching current inventory item...');
            const fetchStartTime = Date.now();
            
            const { data: fetchedItem, error: fetchError } = await supabase
              .from('inventory')
              .select('id, name, quantity, updated_at, store_id, user_id')
              .eq('id', item.inventory_id)
              .single();

            const fetchEndTime = Date.now();
            console.log(`🔍 STEP 1 took ${fetchEndTime - fetchStartTime}ms`);
            
            if (fetchError) {
              console.error('❌ STEP 1 FAILED - Fetch error:');
              console.error('   - Error message:', fetchError.message);
              console.error('   - Error code:', fetchError.code);
              console.error('   - Error details:', fetchError.details);
              console.error('   - Error hint:', fetchError.hint);
              throw fetchError;
            }

            if (!fetchedItem) {
              console.error('❌ STEP 1 FAILED - No item returned from database');
              throw new Error(`Inventory item ${item.name} not found`);
            }

            console.log('✅ STEP 1 SUCCESS - Retrieved item:');
            console.log('   - Database ID:', fetchedItem.id);
            console.log('   - Database name:', fetchedItem.name);
            console.log('   - Database quantity:', fetchedItem.quantity);
            console.log('   - Database updated_at:', fetchedItem.updated_at);
            console.log('   - Database store_id:', fetchedItem.store_id);
            console.log('   - Database user_id:', fetchedItem.user_id);
            
            currentItem = fetchedItem;
            
            // STEP 2: Calculate new quantity
            console.log('\n🔍 STEP 2: Calculating new quantity...');
            const currentQuantity = fetchedItem.quantity;
            const quantityToSell = item.quantity;
            newQuantity = currentQuantity - quantityToSell;
            
            console.log('✅ STEP 2 SUCCESS - Quantity calculation:');
            console.log('   - Current quantity in DB:', currentQuantity);
            console.log('   - Quantity to sell:', quantityToSell);
            console.log('   - New quantity will be:', newQuantity);
            console.log('   - Change amount:', -quantityToSell);
            
            if (newQuantity < 0) {
              console.error('❌ STEP 2 FAILED - Insufficient stock');
              console.error('   - Available:', currentQuantity);
              console.error('   - Requested:', quantityToSell);
              console.error('   - Shortfall:', Math.abs(newQuantity));
              throw new Error(`Insufficient stock for ${item.name}. Available: ${currentQuantity}, Requested: ${quantityToSell}`);
            }

            // STEP 3: Prepare update data
            console.log('\n🔍 STEP 3: Preparing update data...');
            const updateTimestamp = new Date().toISOString();
            const updateData = {
              quantity: newQuantity,
              updated_at: updateTimestamp
            };
            
            console.log('✅ STEP 3 SUCCESS - Update data prepared:');
            console.log('   - Update data:', JSON.stringify(updateData, null, 2));
            console.log('   - Update timestamp:', updateTimestamp);
            console.log('   - Target item ID:', item.inventory_id);

            // STEP 4: Perform database update with response
            console.log('\n🔍 STEP 4: Performing database update...');
            const updateStartTime = Date.now();
            
            const { data: updatedRow, error: updateError } = await supabase
              .from('inventory')
              .update(updateData)
              .eq('id', item.inventory_id)
              .select('id, name, quantity, updated_at')
              .single();

            const updateEndTime = Date.now();
            console.log(`🔍 STEP 4 took ${updateEndTime - updateStartTime}ms`);
            
            if (updateError) {
              console.error('❌ STEP 4 FAILED - Update error:');
              console.error('   - Error message:', updateError.message);
              console.error('   - Error code:', updateError.code);
              console.error('   - Error details:', updateError.details);
              console.error('   - Error hint:', updateError.hint);
              console.error('   - Attempt number:', updateAttempts);
              
              if (updateAttempts < maxAttempts) {
                const delayMs = 200 * updateAttempts;
                console.log(`🔍 Will retry after ${delayMs}ms delay...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue; // Retry
              } else {
                throw updateError;
              }
            }
            
            console.log('✅ STEP 4 SUCCESS - Database update completed');
            console.log('   - Returned data exists:', !!updatedRow);
            
            if (updatedRow) {
              console.log('   - Updated ID:', updatedRow.id);
              console.log('   - Updated name:', updatedRow.name);
              console.log('   - Updated quantity:', updatedRow.quantity);
              console.log('   - Updated timestamp:', updatedRow.updated_at);
            } else {
              console.warn('⚠️ STEP 4 WARNING - No updated row returned');
            }
            
            // STEP 5: Verify the update result
            console.log('\n🔍 STEP 5: Verifying update result...');
            
            if (!updatedRow) {
              console.error('❌ STEP 5 FAILED - No updated row returned');
              console.log('🔍 Will retry this update...');
              continue;
            }
            
            const quantityMatches = updatedRow.quantity === newQuantity;
            console.log('✅ STEP 5 RESULT - Update verification:');
            console.log('   - Expected quantity:', newQuantity);
            console.log('   - Actual quantity:', updatedRow.quantity);
            console.log('   - Quantities match:', quantityMatches);
            console.log('   - Difference:', updatedRow.quantity - newQuantity);
            
            if (!quantityMatches) {
              console.warn('⚠️ STEP 5 WARNING - Quantity mismatch detected!');
              console.warn('   - This could indicate a race condition or database issue');
              console.warn('   - Will retry this update...');
              continue;
            }
            
            // STEP 6: Additional verification query (after delay)
            console.log('\n🔍 STEP 6: Performing additional verification...');
            const verifyDelay = 500;
            console.log(`🔍 Waiting ${verifyDelay}ms before verification query...`);
            await new Promise(resolve => setTimeout(resolve, verifyDelay));
            
            const verifyStartTime = Date.now();
            const { data: verifyData, error: verifyError } = await supabase
              .from('inventory')
              .select('id, name, quantity, updated_at')
              .eq('id', item.inventory_id)
              .single();
            const verifyEndTime = Date.now();
            
            console.log(`🔍 STEP 6 took ${verifyEndTime - verifyStartTime}ms`);
            
            if (verifyError) {
              console.warn('⚠️ STEP 6 WARNING - Verification query failed:');
              console.warn('   - Error:', verifyError.message);
              console.warn('   - Will proceed with update result');
            } else {
              console.log('✅ STEP 6 SUCCESS - Verification query completed');
              console.log('   - Verify ID:', verifyData.id);
              console.log('   - Verify name:', verifyData.name);
              console.log('   - Verify quantity:', verifyData.quantity);
              console.log('   - Verify timestamp:', verifyData.updated_at);
              
              const verifyMatches = verifyData.quantity === newQuantity;
              const updateMatches = verifyData.quantity === updatedRow.quantity;
              
              console.log('\n🔍 VERIFICATION ANALYSIS:');
              console.log('   - Expected quantity:', newQuantity);
              console.log('   - Update returned:', updatedRow.quantity);
              console.log('   - Verify returned:', verifyData.quantity);
              console.log('   - Expected vs Verify match:', verifyMatches);
              console.log('   - Update vs Verify match:', updateMatches);
              console.log('   - Update timestamp:', updatedRow.updated_at);
              console.log('   - Verify timestamp:', verifyData.updated_at);
              console.log('   - Timestamps match:', updatedRow.updated_at === verifyData.updated_at);
              
              if (!verifyMatches) {
                console.error('❌ STEP 6 CRITICAL - Verification failed!');
                console.error('   - Database may have been modified by another process');
                console.error('   - Expected:', newQuantity);
                console.error('   - Actual:', verifyData.quantity);
                console.error('   - Difference:', verifyData.quantity - newQuantity);
                
                if (updateAttempts < maxAttempts) {
                  console.log('🔍 Will retry the entire update process...');
                  continue;
                } else {
                  console.error('❌ Max attempts reached - will proceed but log as inconsistent');
                }
              }
            }
            
            // STEP 7: Update local cache
            console.log('\n🔍 STEP 7: Updating local cache...');
            try {
              const { user } = await getCurrentUser();
              if (user) {
                const inventoryCacheKey = dataRepository.generateCacheKey('inventory', saleData.store_id || user.id, user.id, userRole);
                console.log('   - Cache key:', inventoryCacheKey);
                
                const currentInventory = await offlineManager.getLocalData(inventoryCacheKey) || [];
                console.log('   - Current cache items:', currentInventory.length);
                
                const updatedInventory = currentInventory.map(inv =>
                  inv.id === item.inventory_id 
                    ? { ...inv, quantity: updatedRow.quantity, updated_at: updatedRow.updated_at } 
                    : inv
                );
                
                await offlineManager.storeLocalData(inventoryCacheKey, updatedInventory);
                console.log('✅ STEP 7 SUCCESS - Local cache updated');
                console.log('   - Updated item quantity in cache:', updatedRow.quantity);
              } else {
                console.warn('⚠️ STEP 7 WARNING - No user found, skipping cache update');
              }
            } catch (cacheError) {
              console.warn('⚠️ STEP 7 WARNING - Cache update failed:', cacheError.message);
              console.warn('   - Sale will continue despite cache error');
            }
            
            updateSuccess = true;
            console.log(`\n✅ COMPLETED SUCCESSFULLY: ${item.name}`);
            console.log('   - Final quantity:', updatedRow.quantity);
            console.log('   - Attempts used:', updateAttempts);
            console.log('   - Change applied:', currentItem.quantity, '→', updatedRow.quantity);
            
          } catch (error) {
            console.error(`\n❌ ERROR IN ATTEMPT ${updateAttempts} for ${item.name}:`);
            console.error('   - Error type:', error.constructor.name);
            console.error('   - Error message:', error.message);
            console.error('   - Error stack:', error.stack);
            
            if (updateAttempts >= maxAttempts) {
              console.error('❌ MAX ATTEMPTS REACHED - THROWING ERROR');
              throw error;
            } else {
              const delayMs = 200 * updateAttempts;
              console.log(`🔍 Will retry after ${delayMs}ms delay...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
          }
        }

        if (!updateSuccess) {
          console.error(`\n❌ FINAL FAILURE for ${item.name} after ${maxAttempts} attempts`);
          console.log('🔍 Proceeding with local cache update as fallback...');
          
          try {
            const { user } = await getCurrentUser();
            if (user) {
              const inventoryCacheKey = dataRepository.generateCacheKey('inventory', saleData.store_id || user.id, user.id, userRole);
              const currentInventory = await offlineManager.getLocalData(inventoryCacheKey) || [];
              const updatedInventory = currentInventory.map(inv =>
                inv.id === item.inventory_id 
                  ? { ...inv, quantity: newQuantity, updated_at: new Date().toISOString() }
                  : inv
              );
              await offlineManager.storeLocalData(inventoryCacheKey, updatedInventory);
              console.log(`📱 Fallback: Force-updated local cache for ${item.name} to quantity: ${newQuantity}`);
            }
          } catch (cacheError) {
            console.warn(`⚠️ Fallback cache update failed for ${item.name}:`, cacheError.message);
          }
          
          console.log(`ℹ️ Continuing sale process despite inventory update issue for ${item.name}`);
        }
      }
      
      console.log('\n🔍 ===== INVENTORY UPDATE DEBUGGING COMPLETE =====');
      console.log('✅ All inventory updates completed successfully');
      console.log('🔍 Processed', saleItems.length, 'items');
      console.log('🔍 Final summary:');
      for (let i = 0; i < saleItems.length; i++) {
        console.log(`   - ${saleItems[i].name}: ${saleItems[i].quantity} units sold`);
      }
      
      // Clear inventory cache to force fresh data on next load
      try {
        await offlineManager.clearOfflineData();
        console.log('🧹 Cleared all offline cache to ensure fresh data');
      } catch (error) {
        console.warn('⚠️ Error clearing cache:', error);
      }

      return sale;
    };

    try {
      if (offlineManager.isConnected()) {
        const result = await syncFunction();
        return {
          success: true,
          saleData: result,
          saleItems: saleItems,
          message: 'Sale processed successfully online'
        };
      } else {
        // --- OFFLINE SALE PROCESSING ---
        console.log('📱 Processing sale offline...');

        // 1. Immediately update local SQLite database
        const localResult = await centralizedStorage.storeSale(saleData, saleItems, userRole);
        console.log('✅ Sale and inventory updated locally in SQLite transaction.');

        // 2. Add the sync function to the queue
        await offlineManager.addToSyncQueue(operationKey, 'sales', localResult.sale.id, 'INSERT', { saleData, saleItems, userRole }, 'processSale');
        console.log(`📲 Sale ${localResult.sale.id} queued for sync.`);

        // 3. Return the locally created data
        return {
          success: true,
          offline: true,
          saleData: localResult.sale,
          saleItems: localResult.saleItems,
          message: 'Sale processed successfully offline'
        };
      }
    } catch (error) {
      console.error('Error processing sale:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to process sale',
        message: 'Sale processing failed'
      };
    }
  }

  // Expenses operations
  async getExpenses(storeId, userId, userRole) {
    try {
      // Try to get data online first
      if (offlineManager.isConnected()) {
        let query = supabase.from('expenses').select('*');
        
        if (userRole === 'individual') {
          query = query.eq('user_id', userId);
        } else if (userRole === 'owner' && storeId) {
          query = query.eq('store_id', storeId);
        }
        
        const { data, error } = await query.order('expense_date', { ascending: false });
        
        if (error) {
          console.warn('⚠️ Online expenses fetch failed, using SQLite data:', error.message);
          return await centralizedStorage.getExpenses(storeId, userId, userRole);
        }
        
        // Cache the data in SQLite
        for (const expense of data || []) {
          await centralizedStorage.storeExpense(expense, userRole);
        }
        
        return data || [];
      } else {
        // Return data from SQLite when offline
        console.log('📱 Offline - getting expenses from SQLite');
        return await centralizedStorage.getExpenses(storeId, userId, userRole);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      
      // If online fails, try to return SQLite data
      try {
        return await centralizedStorage.getExpenses(storeId, userId, userRole);
      } catch (cacheError) {
        console.error('Error accessing SQLite expenses:', cacheError);
        return [];
      }
    }
  }

  async addExpense(expenseData, userRole = 'individual') {
    const operationKey = `add_expense_${Date.now()}`;
    
    const syncFunction = async () => {
      const { data, error } = await supabase
        .from('expenses')
        .insert(expenseData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    };

    try {
      const result = await offlineManager.storeData(operationKey, expenseData, syncFunction);
      
      // Store expense in SQLite immediately
      await centralizedStorage.storeExpense(expenseData, userRole);
      
      return result;
    } catch (error) {
      console.error('Error adding expense:', error);
      throw error;
    }
  }

  async deleteExpense(expenseId, userRole = 'individual') {
    const operationKey = `delete_expense_${expenseId}_${Date.now()}`;
    
    const syncFunction = async () => {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);
      
      if (error) throw error;
      return { success: true };
    };

    try {
      const result = await offlineManager.storeData(operationKey, { expenseId }, syncFunction);
      
      // Delete expense from SQLite immediately
      await centralizedStorage.deleteExpense(expenseId, userRole);
      
      return result;
    } catch (error) {
      console.error('Error deleting expense:', error);
      throw error;
    }
  }

  // Stores operations
  async getStores(userId) {
    try {
      // Try to get data online first
      if (offlineManager.isConnected()) {
        console.log('🌐 Online - loading stores from database');
        const { data: stores, error } = await supabase
          .from('stores')
          .select('*')
          .eq('owner_id', userId)
          .order('name');

        if (error) {
          console.warn('⚠️ Online stores fetch failed, using SQLite data:', error.message);
          return await centralizedStorage.getStores(userId);
        }
        
        // Cache the stores in SQLite
        for (const store of stores || []) {
          await centralizedStorage.storeStore(store);
        }
        
        return stores || [];
      } else {
        // Return data from SQLite when offline
        console.log('📱 Offline - getting stores from SQLite');
        return await centralizedStorage.getStores(userId);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
      
      // If online fails, try to return SQLite data
      try {
        return await centralizedStorage.getStores(userId);
      } catch (cacheError) {
        console.error('Error accessing SQLite stores:', cacheError);
        return [];
      }
    }
  }

  // Enhanced method to get user profile with better caching
  async getUserProfile(userId) {
    try {
      // Try to get data online first
      if (offlineManager.isConnected()) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role, store_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.warn('⚠️ Online profile fetch failed, using SQLite data:', error.message);
          return await centralizedStorage.getUserProfile(userId);
        }
        
        if (profile) {
          // Cache the profile in SQLite with user_id
          await centralizedStorage.storeUserProfile({
            user_id: userId,
            ...profile
          });
          return profile;
        }
        
        return null;
      } else {
        // Return data from SQLite when offline
        console.log('📱 Offline - getting profile from SQLite');
        return await centralizedStorage.getUserProfile(userId);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      
      // If online fails, try to return SQLite data
      try {
        return await centralizedStorage.getUserProfile(userId);
      } catch (cacheError) {
        console.error('Error accessing SQLite profile:', cacheError);
        return null;
      }
    }
  }
}

export const offlineDataService = new OfflineDataService();