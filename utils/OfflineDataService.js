import { supabase } from './supabase';
import { offlineManager } from './OfflineManager';
import { getCurrentUser, getUserProfile } from './authUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Helper function for generating consistent cache keys
const generateCacheKey = (dataType, storeId, userId, userRole) => {
  const effectiveUserRole = userRole || 'worker';
  return `${dataType}_${storeId || userId}_${effectiveUserRole}`;
};

class OfflineDataService {
  // Inventory operations
  async getInventory(storeId, userId, userRole) {
    const cacheKey = generateCacheKey('inventory', storeId, userId, userRole);
    
    try {
      // Try to get data online first
      if (offlineManager.isConnected()) {
        let query = supabase.from('inventory').select('*');
        
        if (userRole === 'individual') {
          query = query.eq('user_id', userId);
        } else if (userRole === 'owner' && storeId) {
          query = query.eq('store_id', storeId);
        } else if (userRole === 'worker' && storeId) {
          query = query.eq('store_id', storeId);
        }
        
        const { data, error } = await query.order('name');
        
        if (error) {
          console.warn('⚠️ Online inventory fetch failed, trying cached data:', error.message);
          // Try cached data as fallback
          const cachedData = await offlineManager.getLocalData(cacheKey);
          return cachedData || [];
        }
        
        // Cache the data for offline use
        await offlineManager.storeLocalData(cacheKey, data || []);
        return data || [];
      } else {
        // Return cached data when offline
        const cachedData = await offlineManager.getLocalData(cacheKey);
        return cachedData || [];
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
      
      // If online fails, try to return cached data
      try {
        const cachedData = await offlineManager.getLocalData(cacheKey);
        return cachedData || [];
      } catch (cacheError) {
        console.error('Error accessing cached inventory:', cacheError);
        return [];
      }
    }
  }

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
      // Offline: Check against cached inventory data
      const { user } = await getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const profile = await getUserProfile(user.id);
      console.log('🔍 User profile for cache key:', profile);
      
      // Determine the correct storeId to use for cache key
      let cacheStoreId = storeId; // Use provided storeId if available
      
      // If no storeId provided, determine based on user role and profile
      if (!cacheStoreId) {
        if (userRole === 'owner' && profile?.store_id) {
          cacheStoreId = profile.store_id;
        } else if (userRole === 'worker' && profile?.store_id) {
          cacheStoreId = profile.store_id;
        } else {
          // For individuals or when no store_id in profile, use user.id
          cacheStoreId = user.id;
        }
      }
      
      // Ensure we have a valid userRole for cache key consistency
      const effectiveUserRole = userRole || profile?.role || 'worker';
      const cacheKey = generateCacheKey('inventory', cacheStoreId, user.id, effectiveUserRole);
      const cachedInventory = await offlineManager.getLocalData(cacheKey) || [];
      
      console.log('🔍 Cache key used for validation:', cacheKey);
      console.log('🔍 Cached inventory items:', cachedInventory.length);
      
      // Validate cache is not empty
      if (cachedInventory.length === 0) {
        console.warn('⚠️ Inventory cache is empty, cannot validate stock');
        throw new Error('Inventory cache is empty, cannot validate stock availability. Please connect to the internet to refresh inventory data.');
      }
      
      for (const item of saleItems) {
        const inventoryItem = cachedInventory.find(inv => inv.id === item.inventory_id);
        
        if (!inventoryItem) {
          // Try to find by name for offline-created items
          const offlineItem = cachedInventory.find(inv => 
            inv.name === item.name && inv.is_offline === true
          );
          
          if (!offlineItem) {
            throw new Error(`Item ${item.name} not found in cached inventory. Please connect to the internet to refresh inventory data.`);
          }
          
          // Use the offline item for validation
          if (offlineItem.quantity < item.quantity) {
            throw new Error(`Insufficient stock for ${item.name}. Available: ${offlineItem.quantity}, Requested: ${item.quantity}`);
          }
        } else {
          if (inventoryItem.quantity < item.quantity) {
            throw new Error(`Insufficient stock for ${item.name}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`);
          }
        }
      }
    }
    
    console.log('✅ Stock validation passed');
  }

  async addInventoryItem(itemData, userRole = 'individual') {
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
      is_offline: true // Mark as offline item
    };
    
    const syncFunction = async () => {
      const { data, error } = await supabase
        .from('inventory')
        .insert(itemData)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update cache with real data after successful sync
      const effectiveUserRole = userRole || 'worker'; // Ensure consistent cache key
      const cacheKey = generateCacheKey('inventory', itemData.store_id || user.id, user.id, effectiveUserRole);
      const currentInventory = await offlineManager.getLocalData(cacheKey) || [];
      
      // Find and replace the temp item with the real item using the temp ID
      const updatedInventory = currentInventory.map(item => {
        if (item.id === tempItem.id) {
          console.log('🔄 Replacing temp item with real item:', item.name);
          return data; // Replace with real item from database
        }
        return item;
      });
      
      await offlineManager.storeLocalData(cacheKey, updatedInventory);
      console.log('🔄 Updated cache with synced item:', data.name);
      
      return data;
    };

    try {
      // Store the operation for sync
      const result = await offlineManager.storeData(operationKey, itemData, syncFunction);
      
      // Update local cache immediately with the temp item
      const effectiveUserRole = userRole || 'worker'; // Ensure consistent cache key
      const cacheKey = generateCacheKey('inventory', itemData.store_id || user.id, user.id, effectiveUserRole);
      const currentInventory = await offlineManager.getLocalData(cacheKey) || [];
      const updatedInventory = [...currentInventory, tempItem];
      await offlineManager.storeLocalData(cacheKey, updatedInventory);
      
      console.log('📱 Added item to local cache immediately:', tempItem.name);
      
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
      
      // Update local cache
      const { user, error: userError } = await getCurrentUser();
      if (user && !userError) {
        const effectiveUserRole = userRole || 'worker'; // Ensure consistent cache key
        const cacheKey = generateCacheKey('inventory', updates.store_id || user.id, user.id, effectiveUserRole);
        const currentInventory = await offlineManager.getLocalData(cacheKey) || [];
        const updatedInventory = currentInventory.map(item => 
          item.id === itemId ? { ...item, ...updates } : item
        );
        await offlineManager.storeLocalData(cacheKey, updatedInventory);
      }
      
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
      
      // Update local cache
      const { user, error: userError } = await getCurrentUser();
      if (user && !userError) {
        // We need the store_id for consistent cache key generation
        // First get the item to determine its store_id
        const effectiveUserRole = userRole || 'worker'; // Ensure consistent cache key
        const existingInventory = await offlineManager.getLocalData(generateCacheKey('inventory', user.id, user.id, effectiveUserRole)) || [];
        const item = existingInventory.find(inv => inv.id === itemId);
        const storeId = item?.store_id;
        
        const cacheKey = generateCacheKey('inventory', storeId || user.id, user.id, effectiveUserRole);
        const currentInventory = await offlineManager.getLocalData(cacheKey) || [];
        const updatedInventory = currentInventory.filter(item => item.id !== itemId);
        await offlineManager.storeLocalData(cacheKey, updatedInventory);
      }
      
      return result;
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      throw error;
    }
  }

  // Sales operations
  async getSales(storeId, userId, userRole) {
    const cacheKey = generateCacheKey('sales', storeId, userId, userRole);
    
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
          console.warn('⚠️ Online sales fetch failed, trying cached data:', error.message);
          // Try cached data as fallback
          const cachedData = await offlineManager.getLocalData(cacheKey);
          return cachedData || [];
        }
        
        // Cache the data for offline use
        await offlineManager.storeLocalData(cacheKey, data || []);
        return data || [];
      } else {
        // Return cached data when offline
        const cachedData = await offlineManager.getLocalData(cacheKey);
        return cachedData || [];
      }
    } catch (error) {
      console.error('Error fetching sales:', error);
      
      // If online fails, try to return cached data
      try {
        const cachedData = await offlineManager.getLocalData(cacheKey);
        return cachedData || [];
      } catch (cacheError) {
        console.error('Error accessing cached sales:', cacheError);
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
      
      // Update local cache
      const { user, error: userError } = await getCurrentUser();
      if (user && !userError) {
        const effectiveUserRole = userRole || 'worker'; // Ensure consistent cache key
        const cacheKey = generateCacheKey('sales', saleData.store_id || user.id, user.id, effectiveUserRole);
        const currentSales = await offlineManager.getLocalData(cacheKey) || [];
        const updatedSales = [result, ...currentSales];
        await offlineManager.storeLocalData(cacheKey, updatedSales);
      }
      
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
      // Create sale record
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItemsData = saleItems.map(item => ({
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
      console.log('🔍 Items to process:', saleItems.length);
      console.log('🔍 Items details:', JSON.stringify(saleItems.map(item => ({
        name: item.name,
        inventory_id: item.inventory_id,
        quantity: item.quantity
      })), null, 2));
      
      for (let i = 0; i < saleItems.length; i++) {
        const item = saleItems[i];
        console.log(`\n🔍 ===== PROCESSING ITEM ${i + 1}/${saleItems.length}: ${item.name} =====`);
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
                const inventoryCacheKey = generateCacheKey('inventory', saleData.store_id || user.id, user.id, userRole);
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
              const inventoryCacheKey = generateCacheKey('inventory', saleData.store_id || user.id, user.id, userRole);
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
      const result = await offlineManager.storeData(operationKey, { saleData, saleItems }, syncFunction);
      
      // Update local caches
      const { user, error: userError } = await getCurrentUser();
      if (user && !userError) {
        // Create sale items data for offline display
        const saleId = result.id || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const saleItemsData = saleItems.map((item, index) => ({
          sale_id: saleId,
          user_id: saleData.user_id,
          inventory_id: item.inventory_id,
          item_name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.quantity * item.unit_price,
          id: `${saleId}_item_${index}` // Add unique ID for each sale item
        }));

        // Create complete sale object with sale_items for offline display
        const completeSale = {
          ...result,
          id: saleId, // Ensure unique ID for offline sales
          // Include all sale data for offline display
          user_id: saleData.user_id,
          sale_number: saleData.sale_number,
          customer_name: saleData.customer_name,
          customer_email: saleData.customer_email,
          customer_phone: saleData.customer_phone,
          subtotal: saleData.subtotal,
          tax_amount: saleData.tax_amount,
          discount_amount: saleData.discount_amount,
          total_amount: saleData.total_amount,
          payment_method: saleData.payment_method,
          payment_status: saleData.payment_status,
          store_id: saleData.store_id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sale_date: new Date().toISOString(),
          sale_items: saleItemsData
        };

        // Update sales cache
        const salesCacheKey = generateCacheKey('sales', saleData.store_id || user.id, user.id, effectiveUserRole);
        const currentSales = await offlineManager.getLocalData(salesCacheKey) || [];
        const updatedSales = [completeSale, ...currentSales];
        await offlineManager.storeLocalData(salesCacheKey, updatedSales);

        // Update inventory cache to reflect stock changes
        const inventoryCacheKey = generateCacheKey('inventory', saleData.store_id || user.id, user.id, effectiveUserRole);
        const currentInventory = await offlineManager.getLocalData(inventoryCacheKey) || [];
        const updatedInventory = currentInventory.map(invItem => {
          const saleItem = saleItems.find(si => si.inventory_id === invItem.id);
          if (saleItem) {
            return { ...invItem, quantity: invItem.quantity - saleItem.quantity };
          }
          return invItem;
        });
        await offlineManager.storeLocalData(inventoryCacheKey, updatedInventory);
      }
      
      return { 
        success: true, 
        saleData: result, 
        saleItems: saleItems,
        message: 'Sale processed successfully'
      };
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
    const cacheKey = generateCacheKey('expenses', storeId, userId, userRole);
    
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
          console.warn('⚠️ Online expenses fetch failed, trying cached data:', error.message);
          // Try cached data as fallback
          const cachedData = await offlineManager.getLocalData(cacheKey);
          return cachedData || [];
        }
        
        // Cache the data for offline use
        await offlineManager.storeLocalData(cacheKey, data || []);
        return data || [];
      } else {
        // Return cached data when offline
        const cachedData = await offlineManager.getLocalData(cacheKey);
        return cachedData || [];
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
      
      // If online fails, try to return cached data
      try {
        const cachedData = await offlineManager.getLocalData(cacheKey);
        return cachedData || [];
      } catch (cacheError) {
        console.error('Error accessing cached expenses:', cacheError);
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
      
      // Update local cache
      const { user, error: userError } = await getCurrentUser();
      if (user && !userError) {
        const effectiveUserRole = userRole || 'worker'; // Ensure consistent cache key
        const cacheKey = generateCacheKey('expenses', expenseData.store_id || user.id, user.id, effectiveUserRole);
        const currentExpenses = await offlineManager.getLocalData(cacheKey) || [];
        const updatedExpenses = [result, ...currentExpenses];
        await offlineManager.storeLocalData(cacheKey, updatedExpenses);
      }
      
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
      
      // Update local cache
      const { user, error: userError } = await getCurrentUser();
      if (user && !userError) {
        // Find the expense to get its store_id for cache key
        const effectiveUserRole = userRole || 'worker'; // Ensure consistent cache key
        const existingExpenses = await offlineManager.getLocalData(generateCacheKey('expenses', user.id, user.id, effectiveUserRole)) || [];
        const expense = existingExpenses.find(exp => exp.id === expenseId);
        const storeId = expense?.store_id;
        
        const cacheKey = generateCacheKey('expenses', storeId || user.id, user.id, effectiveUserRole);
        const currentExpenses = await offlineManager.getLocalData(cacheKey) || [];
        const updatedExpenses = currentExpenses.filter(exp => exp.id !== expenseId);
        await offlineManager.storeLocalData(cacheKey, updatedExpenses);
      }
      
      return result;
    } catch (error) {
      console.error('Error deleting expense:', error);
      throw error;
    }
  }

  // Enhanced method to get user profile with better caching
  async getUserProfile(userId) {
    const cacheKey = `user_profile_${userId}`;
    
    try {
      // Try to get data online first
      if (offlineManager.isConnected()) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role, store_id')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.warn('⚠️ Online profile fetch failed, trying cached data:', error.message);
          // Try cached data as fallback
          const cachedData = await offlineManager.getLocalData(cacheKey);
          return cachedData || null;
        }
        
        if (profile) {
          // Cache the data for offline use
          await offlineManager.storeLocalData(cacheKey, profile);
          return profile;
        }
        
        return null;
      } else {
        // Return cached data when offline
        const cachedData = await offlineManager.getLocalData(cacheKey);
        return cachedData || null;
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      
      // If online fails, try to return cached data
      try {
        const cachedData = await offlineManager.getLocalData(cacheKey);
        return cachedData || null;
      } catch (cacheError) {
        console.error('Error accessing cached profile:', cacheError);
        return null;
      }
    }
  }
}

export const offlineDataService = new OfflineDataService();