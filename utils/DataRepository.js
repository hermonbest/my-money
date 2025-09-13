import { sqliteService } from './SqliteService';

/**
 * Data Repository - High-level data access layer
 * Provides business-logic aware data operations that match
 * the existing OfflineDataService interface for easy migration
 */
class DataRepository {
  constructor() {
    this.sqliteService = sqliteService;
    this.processingSale = false; // Transaction lock to prevent concurrent sales
  }

  /**
   * Initialize the repository
   * @returns {Promise<void>}
   */
  async init() {
    await this.sqliteService.init();
  }

  // ===========================
  // CACHE KEY MAPPING
  // ===========================

  /**
   * Generate cache key (maintains compatibility with existing system)
   * @param {string} dataType - Data type (inventory, sales, expenses)
   * @param {string} storeId - Store ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {string} - Cache key
   */
  generateCacheKey(dataType, storeId, userId, userRole) {
    const effectiveUserRole = userRole || 'worker';
    
    // For store-based data (owner/worker), use 'shared' instead of role
    if (storeId && (userRole === 'owner' || userRole === 'worker')) {
      return `${dataType}_${storeId}_shared`;
    }
    
    // For individual users, keep role-based isolation
    return `${dataType}_${storeId || userId}_${effectiveUserRole}`;
  }

  /**
   * Get all possible cache keys for data retrieval (for backward compatibility)
   * @param {string} dataType - Data type
   * @param {string} storeId - Store ID  
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {Array} - Possible cache keys
   */
  getAllPossibleCacheKeys(dataType, storeId, userId, userRole) {
    const effectiveUserRole = userRole || 'worker';
    const keys = [];
    
    if (storeId && (userRole === 'owner' || userRole === 'worker')) {
      keys.push(`${dataType}_${storeId}_shared`);
      // Backward compatibility keys
      keys.push(`${dataType}_${storeId}_owner`);
      keys.push(`${dataType}_${storeId}_worker`);
    } else if (storeId) {
      keys.push(`${dataType}_${storeId}_${effectiveUserRole}`);
    }
    
    // Add user-based key as fallback
    keys.push(`${dataType}_${userId}_${effectiveUserRole}`);
    
    // Remove duplicates
    return [...new Set(keys)];
  }

  // ===========================
  // INVENTORY OPERATIONS
  // ===========================

  /**
   * Get inventory with role-based access
   * @param {string} storeId - Store ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {Promise<Array>} - Inventory items
   */
  async getInventory(storeId, userId, userRole) {
    try {
      console.log('🔍 Getting inventory from SQLite:', { userRole, storeId, userId });
      
      const inventory = await this.sqliteService.findWithRoleAccess(
        'inventory',
        userId,
        userRole,
        storeId,
        {},
        { orderBy: 'name ASC' }
      );

      console.log(`✅ Retrieved ${inventory.length} inventory items from SQLite`);
      
      // Debug: Log first few items to check for duplicates
      if (inventory.length > 0) {
        console.log('🔍 Debug - First 3 inventory items:', inventory.slice(0, 3).map(item => ({
          id: item.id,
          name: item.name,
          user_id: item.user_id,
          store_id: item.store_id
        })));
        
        // Check for duplicates by name
        const uniqueNames = [...new Set(inventory.map(item => item.name))];
        console.log(`🔍 Debug - Unique item names: ${uniqueNames.length} unique names out of ${inventory.length} total items`);
        console.log('🔍 Debug - Unique names:', uniqueNames.slice(0, 10));
      }
      
      return inventory;
    } catch (error) {
      console.error('❌ Failed to get inventory from SQLite:', error);
      throw error;
    }
  }

  /**
   * Clean up duplicate inventory items
   * @param {string} storeId - Store ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {Promise<number>} - Number of duplicates removed
   */
  async cleanupDuplicateInventory(storeId, userId, userRole) {
    try {
      console.log('🧹 Cleaning up duplicate inventory items...');
      
      // Get all inventory items
      const allItems = await this.sqliteService.findWithRoleAccess(
        'inventory',
        userId,
        userRole,
        storeId,
        {},
        { orderBy: 'created_at ASC' }
      );

      // Group by name and keep only the first (oldest) occurrence of each unique item
      const uniqueItems = new Map();
      const duplicatesToRemove = [];

      for (const item of allItems) {
        const key = `${item.name}_${item.store_id || item.user_id}`;
        
        if (uniqueItems.has(key)) {
          // This is a duplicate, mark for removal
          duplicatesToRemove.push(item.id);
          console.log(`🗑️ Marking duplicate for removal: ${item.name} (${item.id})`);
        } else {
          // First occurrence, keep it
          uniqueItems.set(key, item);
        }
      }

      // Remove duplicates
      if (duplicatesToRemove.length > 0) {
        console.log(`🧹 Removing ${duplicatesToRemove.length} duplicate inventory items...`);
        
        for (const duplicateId of duplicatesToRemove) {
          await this.sqliteService.delete('inventory', duplicateId);
        }
        
        console.log(`✅ Removed ${duplicatesToRemove.length} duplicate items`);
        return duplicatesToRemove.length;
      } else {
        console.log('✅ No duplicate inventory items found');
        return 0;
      }
    } catch (error) {
      console.error('❌ Failed to cleanup duplicate inventory:', error);
      throw error;
    }
  }

  /**
   * Add inventory item
   * @param {Object} itemData - Item data
   * @param {string} userRole - User role
   * @returns {Promise<Object>} - Created item
   */
  async addInventoryItem(itemData, userRole = 'individual') {
    try {
      const timestamp = Date.now();
      const tempItem = {
        ...itemData,
        id: `temp_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        is_offline: true,
        synced: false
      };

      console.log('📝 Adding inventory item to SQLite:', tempItem.name);
      
      const result = await this.sqliteService.insert('inventory', tempItem);
      
      console.log('✅ Inventory item added to SQLite:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Failed to add inventory item to SQLite:', error);
      throw error;
    }
  }

  /**
   * Upsert inventory item (insert or update)
   * @param {Object} itemData - Item data
   * @param {string} userRole - User role
   * @returns {Promise<Object>} - Upserted item
   */
  async upsertInventoryItem(itemData, userRole = 'individual') {
    try {
      // Use the built-in upsert method from SqliteService
      const timestamp = Date.now();
      const tempItem = {
        ...itemData,
        id: itemData.id || `temp_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        is_offline: true,
        synced: false
      };

      console.log('📝 Upserting inventory item to SQLite:', tempItem.name);
      
      const result = await this.sqliteService.upsert('inventory', tempItem, tempItem.id);
      
      console.log('✅ Inventory item upserted to SQLite:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Failed to upsert inventory item to SQLite:', error);
      throw error;
    }
  }

  /**
   * Update inventory item
   * @param {string} itemId - Item ID
   * @param {Object} updates - Updates to apply
   * @param {string} userRole - User role
   * @returns {Promise<Object>} - Updated item
   */
  async updateInventoryItem(itemId, updates, userRole = 'individual') {
    try {
      console.log('📝 Updating inventory item in SQLite:', itemId);
      
      const updatedItem = await this.sqliteService.update('inventory', itemId, {
        ...updates,
        synced: false
      });

      console.log('✅ Inventory item updated in SQLite:', itemId);
      return updatedItem;
    } catch (error) {
      console.error('❌ Failed to update inventory item in SQLite:', error);
      throw error;
    }
  }

  /**
   * Delete inventory item
   * @param {string} itemId - Item ID
   * @param {string} userRole - User role
   * @returns {Promise<boolean>} - Success status
   */
  async deleteInventoryItem(itemId, userRole = 'individual') {
    try {
      console.log('🗑️ Deleting inventory item from SQLite:', itemId);
      
      const success = await this.sqliteService.delete('inventory', itemId);
      
      console.log('✅ Inventory item deleted from SQLite:', itemId);
      return success;
    } catch (error) {
      console.error('❌ Failed to delete inventory item from SQLite:', error);
      throw error;
    }
  }

  /**
   * Find an inventory item by its temporary ID
   * @param {string} tempId - The temporary ID to search for
   * @returns {Promise<Object|null>} - The inventory item with the real ID, or null if not found
   */
  async findInventoryItemByTempId(tempId) {
    try {
      console.log(`🔍 Searching for inventory item with temp_id: ${tempId}`);
      const item = await this.sqliteService.findOne('inventory', { temp_id: tempId });
      if (item) {
        console.log(`✅ Found inventory item by temp_id: ${tempId} -> ${item.id}`);
        return item;
      } else {
        console.log(`⚠️ No inventory item found with temp_id: ${tempId}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Failed to find inventory item by temp_id ${tempId}:`, error);
      throw error;
    }
  }

  // ===========================
  // SALES OPERATIONS
  // ===========================

  /**
   * Get sales with role-based access
   * @param {string} storeId - Store ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {Promise<Array>} - Sales records
   */
  async getSales(storeId, userId, userRole) {
    try {
      console.log('🔍 Getting sales from SQLite:', { userRole, storeId, userId });
      
      // Get sales records
      const sales = await this.sqliteService.findWithRoleAccess(
        'sales',
        userId,
        userRole,
        storeId,
        {},
        { orderBy: 'created_at DESC' }
      );

      // Get sale items for each sale
      for (const sale of sales) {
        const saleItems = await this.sqliteService.find('sale_items', { sale_id: sale.id });
        sale.sale_items = saleItems;
      }

      console.log(`✅ Retrieved ${sales.length} sales from SQLite`);
      return sales;
    } catch (error) {
      console.error('❌ Failed to get sales from SQLite:', error);
      throw error;
    }
  }

  /**
   * Add sale
   * @param {Object} saleData - Sale data
   * @param {string} userRole - User role
   * @returns {Promise<Object>} - Created sale
   */
  async addSale(saleData, userRole = 'individual') {
    try {
      const timestamp = Date.now();
      const sale = {
        ...saleData,
        id: saleData.id || `temp_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        synced: false
      };

      console.log('📝 Adding sale to SQLite:', sale.id);
      
      const result = await this.sqliteService.insert('sales', sale);
      
      console.log('✅ Sale added to SQLite:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Failed to add sale to SQLite:', error);
      throw error;
    }
  }

  /**
   * Process sale with sale items
   * @param {Object} saleData - Sale data
   * @param {Array} saleItems - Sale items
   * @param {string} userRole - User role
   * @returns {Promise<Object>} - Process result
   */
  async processSale(saleData, saleItems, userRole = 'individual') {
    try {
      // Prevent concurrent sale processing
      if (this.processingSale) {
        console.log('⚠️ Sale processing already in progress, queuing...');
        // Wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 100));
        if (this.processingSale) {
          throw new Error('Sale processing is busy, please try again');
        }
      }
      
      this.processingSale = true;
      console.log('🔄 Processing sale in SQLite transaction...');
      
      // Check if sale already exists to prevent duplicates
      if (saleData.id && await this.sqliteService.exists('sales', saleData.id)) {
        console.log('⚠️ Sale already exists, skipping duplicate insertion:', saleData.id);
        this.processingSale = false;
        return {
          success: true,
          sale: { id: saleData.id },
          saleItems: [],
          message: 'Sale already exists, skipped duplicate'
        };
      }
      
      const result = await this.sqliteService.runTransaction(async () => {
        // Create sale record
        const timestamp = Date.now();
        const sale = {
          ...saleData,
          id: saleData.id || `temp_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
          synced: false
        };

        // Double-check that the sale doesn't exist (in case of race conditions)
        if (await this.sqliteService.exists('sales', sale.id)) {
          console.log('⚠️ Sale already exists during transaction, skipping:', sale.id);
          return {
            sale: { id: sale.id },
            saleItems: []
          };
        }

        const createdSale = await this.sqliteService.insert('sales', sale);

        // Create sale items
        const createdSaleItems = [];
        for (let i = 0; i < saleItems.length; i++) {
          const item = saleItems[i];
          
          // Fix item_name issue - handle different data structures
          const itemName = item.name || item.item_name || 'Unknown Item';
          
          const saleItem = {
            id: `${createdSale.id}_item_${i}`,
            sale_id: createdSale.id,
            user_id: saleData.user_id,
            inventory_id: item.inventory_id,
            item_name: itemName,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.quantity * item.unit_price,
            synced: false
          };

          // Check if sale item already exists to prevent duplicates
          const saleItemId = saleItem.id;
          if (await this.sqliteService.exists('sale_items', saleItemId)) {
            console.log('⚠️ Sale item already exists, skipping:', saleItemId);
            continue;
          }
          
          const createdSaleItem = await this.sqliteService.insert('sale_items', saleItem);
          createdSaleItems.push(createdSaleItem);
        }

        // Update inventory quantities
        for (const item of saleItems) {
          const inventoryItem = await this.sqliteService.findById('inventory', item.inventory_id);
          if (inventoryItem) {
            const newQuantity = inventoryItem.quantity - item.quantity;
            await this.sqliteService.update('inventory', item.inventory_id, {
              quantity: newQuantity,
              synced: false
            });
          }
        }

        const result = {
          sale: createdSale,
          saleItems: createdSaleItems
        };
        
        console.log('🔍 Transaction returning result:', result);
        return result;
      });

      console.log('✅ Sale processed successfully in SQLite');
      console.log('🔍 Transaction result:', result);
      
      // Ensure result has the expected structure
      if (!result || typeof result !== 'object') {
        console.error('❌ Transaction returned invalid result:', result);
        throw new Error('Transaction returned invalid result');
      }
      
      if (!result.sale) {
        console.error('❌ Transaction result missing sale property:', result);
        throw new Error('Transaction result missing sale property');
      }
      
      this.processingSale = false;
      return {
        success: true,
        saleData: result.sale,
        saleItems: result.saleItems || [],
        message: 'Sale processed successfully'
      };
    } catch (error) {
      console.error('❌ Failed to process sale in SQLite:', error);
      return {
        success: false,
        error: error.message || 'Failed to process sale',
        message: 'Sale processing failed'
      };
    } finally {
      this.processingSale = false;
    }
  }

  // ===========================
  // EXPENSES OPERATIONS
  // ===========================

  /**
   * Get expenses with role-based access
   * @param {string} storeId - Store ID
   * @param {string} userId - User ID
   * @param {string} userRole - User role
   * @returns {Promise<Array>} - Expense records
   */
  async getExpenses(storeId, userId, userRole) {
    try {
      console.log('🔍 Getting expenses from SQLite:', { userRole, storeId, userId });
      
      const expenses = await this.sqliteService.findWithRoleAccess(
        'expenses',
        userId,
        userRole,
        storeId,
        {},
        { orderBy: 'expense_date DESC' }
      );

      console.log(`✅ Retrieved ${expenses.length} expenses from SQLite`);
      return expenses;
    } catch (error) {
      console.error('❌ Failed to get expenses from SQLite:', error);
      throw error;
    }
  }

  /**
   * Add expense
   * @param {Object} expenseData - Expense data
   * @param {string} userRole - User role
   * @returns {Promise<Object>} - Created expense
   */
  async addExpense(expenseData, userRole = 'individual') {
    try {
      const timestamp = Date.now();
      const expense = {
        ...expenseData,
        id: expenseData.id || `temp_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        synced: false
      };

      // Check if expense already exists to prevent duplicates
      if (expense.id && await this.sqliteService.exists('expenses', expense.id)) {
        console.log('⚠️ Expense already exists, skipping duplicate insertion:', expense.id);
        return { id: expense.id };
      }

      console.log('📝 Adding expense to SQLite:', expense.description);
      
      const result = await this.sqliteService.insert('expenses', expense);
      
      console.log('✅ Expense added to SQLite:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Failed to add expense to SQLite:', error);
      throw error;
    }
  }

  /**
   * Delete expense
   * @param {string} expenseId - Expense ID
   * @param {string} userRole - User role
   * @returns {Promise<boolean>} - Success status
   */
  async deleteExpense(expenseId, userRole = 'individual') {
    try {
      console.log('🗑️ Deleting expense from SQLite:', expenseId);
      
      const success = await this.sqliteService.delete('expenses', expenseId);
      
      console.log('✅ Expense deleted from SQLite:', expenseId);
      return success;
    } catch (error) {
      console.error('❌ Failed to delete expense from SQLite:', error);
      throw error;
    }
  }

  // ===========================
  // USER PROFILE OPERATIONS
  // ===========================

  /**
   * Get user profile
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} - User profile
   */
  async getUserProfile(userId) {
    try {
      console.log('🔍 Getting user profile from SQLite:', userId);
      
      const profile = await this.sqliteService.findById('user_profiles', userId);
      
      if (profile) {
        console.log('✅ Retrieved user profile from SQLite:', profile.role);
      } else {
        console.log('⚠️ No user profile found in SQLite for:', userId);
      }
      
      return profile;
    } catch (error) {
      console.error('❌ Failed to get user profile from SQLite:', error);
      throw error;
    }
  }

  /**
   * Store user profile
   * @param {Object} profileData - Profile data
   * @returns {Promise<Object>} - Stored profile
   */
  async storeUserProfile(profileData) {
    try {
      // Validate profile data
      if (!profileData) {
        console.warn('⚠️ Profile data is null/undefined, skipping storage');
        return null;
      }
      
      // Handle different profile data structures - some have user_id, others have id
      const userId = profileData.user_id || profileData.id;
      
      // If we still don't have a userId, we can't store the profile
      if (!userId) {
        console.warn('⚠️ No user_id or id found in profile data, skipping storage:', profileData);
        return null;
      }
      
      console.log('📝 Storing user profile in SQLite:', userId);
      
      const profile = {
        id: profileData.id || profileData.user_id, // Use existing id or user_id as primary key
        user_id: userId, // Ensure user_id field is set
        ...profileData,
        synced: false
      };

      const result = await this.sqliteService.upsert('user_profiles', profile);
      
      console.log('✅ User profile stored in SQLite:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Failed to store user profile in SQLite:', error);
      throw error;
    }
  }

  // ===========================
  // USER SESSION OPERATIONS
  // ===========================

  /**
   * Store user session
   * @param {string} userId - User ID
   * @param {Object} sessionData - Session data
   * @param {string} expiresAt - Expiration timestamp
   * @returns {Promise<Object>} - Stored session
   */
  async storeUserSession(userId, sessionData, expiresAt = null) {
    try {
      console.log('📝 Storing user session in SQLite:', userId);
      
      const session = {
        id: `session_${userId}`,
        user_id: userId,
        session_data: JSON.stringify(sessionData),
        expires_at: expiresAt
      };

      const result = await this.sqliteService.upsert('user_sessions', session);
      
      console.log('✅ User session stored in SQLite:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Failed to store user session in SQLite:', error);
      throw error;
    }
  }

  /**
   * Get user session
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} - User session
   */
  async getUserSession(userId) {
    try {
      console.log('🔍 Getting user session from SQLite:', userId);
      
      const session = await this.sqliteService.findById('user_sessions', `session_${userId}`);
      
      if (session) {
        // Check if session is expired
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
          console.log('⚠️ User session expired, removing from SQLite');
          await this.sqliteService.delete('user_sessions', session.id);
          return null;
        }

        // Parse session data
        try {
          const sessionData = JSON.parse(session.session_data);
          console.log('✅ Retrieved user session from SQLite');
          return { ...session, session_data: sessionData };
        } catch (parseError) {
          console.error('❌ Failed to parse session data:', parseError);
          return null;
        }
      }
      
      console.log('⚠️ No user session found in SQLite for:', userId);
      return null;
    } catch (error) {
      console.error('❌ Failed to get user session from SQLite:', error);
      throw error;
    }
  }

  /**
   * Remove user session
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} - Success status
   */
  async removeUserSession(userId) {
    try {
      console.log('🗑️ Removing user session from SQLite:', userId);
      
      const success = await this.sqliteService.delete('user_sessions', `session_${userId}`);
      
      console.log('✅ User session removed from SQLite:', userId);
      return success;
    } catch (error) {
      console.error('❌ Failed to remove user session from SQLite:', error);
      throw error;
    }
  }

  // ===========================
  // SYNC OPERATIONS
  // ===========================

  /**
   * Get unsynced records for a table
   * @param {string} tableName - Table name
   * @param {number} limit - Maximum records to return
   * @returns {Promise<Array>} - Unsynced records
   */
  async getUnsyncedRecords(tableName, limit = 50) {
    try {
      const records = await this.sqliteService.find(
        tableName,
        { synced: false },
        { orderBy: 'created_at ASC', limit }
      );

      console.log(`📤 Found ${records.length} unsynced records in ${tableName}`);
      return records;
    } catch (error) {
      console.error(`❌ Failed to get unsynced records from ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Mark record as synced
   * @param {string} tableName - Table name
   * @param {string} recordId - Record ID
   * @returns {Promise<Object>} - Updated record
   */
  async markRecordSynced(tableName, recordId) {
    try {
      console.log(`✅ Marking record as synced in ${tableName}:`, recordId);
      return await this.sqliteService.update(tableName, recordId, { synced: true });
    } catch (error) {
      console.error(`❌ Failed to mark record as synced in ${tableName}:`, error);
      throw error;
    }
  }

  // ===========================
  // UTILITY METHODS
  // ===========================

  /**
   * Get repository statistics
   * @returns {Promise<Object>} - Repository statistics
   */
  async getStats() {
    try {
      const stats = await this.sqliteService.getTableStats();
      return {
        ...stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to get repository stats:', error);
      return {};
    }
  }

  /**
   * Clear all data from the repository
   * @returns {Promise<void>}
   */
  async clearAllData() {
    try {
      console.log('🧹 Clearing all data from repository...');
      
      const tables = ['cache_metadata', 'user_sessions', 'user_profiles', 'sync_queue', 'sale_items', 'sales', 'expenses', 'inventory'];
      
      for (const table of tables) {
        await this.sqliteService.clearTable(table);
      }
      
      console.log('✅ All data cleared from repository');
    } catch (error) {
      console.error('❌ Failed to clear repository data:', error);
      throw error;
    }
  }

  /**
   * Validate stock availability (maintains compatibility with existing logic)
   * @param {Array} saleItems - Sale items to validate
   * @param {string} userRole - User role
   * @param {string} storeId - Store ID
   * @returns {Promise<void>} - Throws error if validation fails
   */
  async validateStockAvailability(saleItems, userRole = 'individual', storeId = null) {
    try {
      console.log('🔍 Validating stock availability in SQLite...');
      
      for (const item of saleItems) {
        const inventoryItem = await this.sqliteService.findById('inventory', item.inventory_id);
        
        if (!inventoryItem) {
          throw new Error(`Item ${item.name} not found in inventory`);
        }
        
        if (inventoryItem.quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${item.name}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`);
        }
      }
      
      console.log('✅ Stock validation passed');
    } catch (error) {
      console.error('❌ Stock validation failed:', error);
      throw error;
    }
  }

  /**
   * Get stores for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>}
   */
  async getStores(userId) {
    try {
      console.log('📋 Getting stores for user:', userId);
      
      const stores = await this.sqliteService.find(
        'stores',
        { owner_id: userId },
        { orderBy: 'name' }
      );
      
      console.log('✅ Retrieved stores:', stores.length);
      return stores || [];
    } catch (error) {
      console.error('❌ Failed to get stores:', error);
      throw error;
    }
  }

  /**
   * Store store data
   * @param {Object} storeData - Store data
   * @returns {Promise<void>}
   */
  async storeStore(storeData) {
    try {
      console.log('🏪 Storing store:', storeData.name);
      
      await this.sqliteService.insert('stores', storeData);
      
      console.log('✅ Store stored successfully');
    } catch (error) {
      console.error('❌ Failed to store store:', error);
      throw error;
    }
  }
}

// Create and export singleton instance
export const dataRepository = new DataRepository();
export default dataRepository;
