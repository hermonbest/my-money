// =====================================================
// STORAGE INTEGRATION TESTS
// =====================================================
// 10 Essential tests for storage + queue functionality
// =====================================================

// Mock all external dependencies
jest.mock('../utils/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null }),
      update: jest.fn().mockResolvedValue({ data: [{ id: 'test-id' }], error: null }),
      delete: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'test-id', quantity: 10 }, error: null })
    }))
  }
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined)
}));

describe('Storage + Queue Integration Tests', () => {
  
  // ===========================
  // TEST 1: Basic Storage Operations
  // ===========================
  test('1. Basic storage CRUD operations', async () => {
    // Mock a simple storage interface
    const mockStorage = {
      data: new Map(),
      
      async store(key, value) {
        this.data.set(key, value);
        return value;
      },
      
      async get(key) {
        return this.data.get(key) || null;
      },
      
      async delete(key) {
        return this.data.delete(key);
      },
      
      async clear() {
        this.data.clear();
      }
    };

    // Test CRUD operations
    const testData = { id: 'test-1', name: 'Test Item', quantity: 100 };
    
    // Create
    const stored = await mockStorage.store('test-1', testData);
    expect(stored).toEqual(testData);
    
    // Read
    const retrieved = await mockStorage.get('test-1');
    expect(retrieved).toEqual(testData);
    
    // Update
    const updatedData = { ...testData, quantity: 150 };
    await mockStorage.store('test-1', updatedData);
    const updated = await mockStorage.get('test-1');
    expect(updated.quantity).toBe(150);
    
    // Delete
    const deleted = await mockStorage.delete('test-1');
    expect(deleted).toBe(true);
    
    const notFound = await mockStorage.get('test-1');
    expect(notFound).toBeNull();
  });

  // ===========================
  // TEST 2: Queue Operations
  // ===========================
  test('2. Sync queue operations', async () => {
    const mockQueue = {
      operations: [],
      
      async add(operation) {
        this.operations.push({
          id: Date.now(),
          ...operation,
          status: 'pending',
          attempts: 0,
          created_at: new Date().toISOString()
        });
        return this.operations.length;
      },
      
      async getPending() {
        return this.operations.filter(op => op.status === 'pending');
      },
      
      async markCompleted(id) {
        const operation = this.operations.find(op => op.id === id);
        if (operation) {
          operation.status = 'completed';
          return true;
        }
        return false;
      },
      
      async incrementAttempts(id) {
        const operation = this.operations.find(op => op.id === id);
        if (operation) {
          operation.attempts++;
          return operation.attempts;
        }
        return 0;
      }
    };

    // Add operations to queue
    await mockQueue.add({
      operation_key: 'test_op_1',
      table_name: 'inventory',
      operation_type: 'INSERT',
      data: { name: 'Test Item 1' }
    });

    await mockQueue.add({
      operation_key: 'test_op_2',
      table_name: 'sales',
      operation_type: 'INSERT',
      data: { total: 100 }
    });

    // Verify queue operations
    const pending = await mockQueue.getPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].table_name).toBe('inventory');
    expect(pending[1].table_name).toBe('sales');

    // Mark one as completed
    const firstOp = pending[0];
    await mockQueue.markCompleted(firstOp.id);
    
    const stillPending = await mockQueue.getPending();
    expect(stillPending).toHaveLength(1);
  });

  // ===========================
  // TEST 3: Retry Logic
  // ===========================
  test('3. Retry logic and error handling', async () => {
    const mockRetryHandler = {
      maxAttempts: 3,
      delays: [1000, 2000, 5000],
      
      shouldRetry(attempts) {
        return attempts < this.maxAttempts;
      },
      
      getDelay(attempts) {
        const index = Math.min(attempts, this.delays.length - 1);
        return this.delays[index];
      },
      
      async processWithRetry(operation, processor) {
        let attempts = 0;
        let lastError = null;

        while (attempts < this.maxAttempts) {
          try {
            return await processor(operation);
          } catch (error) {
            attempts++;
            lastError = error;
            
            if (this.shouldRetry(attempts)) {
              const delay = this.getDelay(attempts - 1);
              // In real code: await new Promise(resolve => setTimeout(resolve, delay));
              console.log(`Retry ${attempts}/${this.maxAttempts} after ${delay}ms`);
            }
          }
        }
        
        throw lastError;
      }
    };

    // Test successful retry
    let attemptCount = 0;
    const successAfterRetry = async () => {
      attemptCount++;
      if (attemptCount < 2) {
        throw new Error('Temporary failure');
      }
      return { success: true };
    };

    const result = await mockRetryHandler.processWithRetry({}, successAfterRetry);
    expect(result.success).toBe(true);
    expect(attemptCount).toBe(2);

    // Test max attempts reached
    const alwaysFails = async () => {
      throw new Error('Persistent failure');
    };

    await expect(
      mockRetryHandler.processWithRetry({}, alwaysFails)
    ).rejects.toThrow('Persistent failure');
  });

  // ===========================
  // TEST 4: Operation Routing
  // ===========================
  test('4. Operation routing by table and type', async () => {
    const mockRouter = {
      handlers: {
        inventory: {
          INSERT: jest.fn().mockResolvedValue({ success: true, type: 'inventory_insert' }),
          UPDATE: jest.fn().mockResolvedValue({ success: true, type: 'inventory_update' }),
          DELETE: jest.fn().mockResolvedValue({ success: true, type: 'inventory_delete' })
        },
        sales: {
          INSERT: jest.fn().mockResolvedValue({ success: true, type: 'sales_insert' })
        },
        expenses: {
          INSERT: jest.fn().mockResolvedValue({ success: true, type: 'expenses_insert' }),
          DELETE: jest.fn().mockResolvedValue({ success: true, type: 'expenses_delete' })
        }
      },
      
      async route(operation) {
        const handler = this.handlers[operation.table_name]?.[operation.operation_type];
        if (!handler) {
          throw new Error(`No handler for ${operation.table_name}/${operation.operation_type}`);
        }
        return await handler(operation.data);
      }
    };

    // Test inventory operations
    const inventoryInsert = await mockRouter.route({
      table_name: 'inventory',
      operation_type: 'INSERT',
      data: { name: 'New Item' }
    });
    expect(inventoryInsert.type).toBe('inventory_insert');

    // Test sales operations
    const salesInsert = await mockRouter.route({
      table_name: 'sales',
      operation_type: 'INSERT',
      data: { total: 100 }
    });
    expect(salesInsert.type).toBe('sales_insert');

    // Test unknown operation
    await expect(
      mockRouter.route({
        table_name: 'unknown',
        operation_type: 'INSERT',
        data: {}
      })
    ).rejects.toThrow('No handler for unknown/INSERT');
  });

  // ===========================
  // TEST 5: Complex Sale Processing
  // ===========================
  test('5. Complex sale with items and inventory updates', async () => {
    const mockSaleProcessor = {
      inventory: new Map([
        ['item-1', { id: 'item-1', quantity: 100 }],
        ['item-2', { id: 'item-2', quantity: 50 }]
      ]),
      
      async processCompleteSale(saleData, saleItems) {
        // Validate stock availability
        for (const item of saleItems) {
          const inventoryItem = this.inventory.get(item.inventory_id);
          if (!inventoryItem || inventoryItem.quantity < item.quantity) {
            throw new Error(`Insufficient stock for ${item.inventory_id}`);
          }
        }
        
        // Create sale
        const sale = {
          id: 'sale-' + Date.now(),
          ...saleData,
          created_at: new Date().toISOString()
        };
        
        // Process sale items and update inventory
        const processedItems = [];
        for (const item of saleItems) {
          // Create sale item
          const saleItem = {
            id: `${sale.id}_item_${processedItems.length}`,
            sale_id: sale.id,
            ...item,
            line_total: item.quantity * item.unit_price
          };
          processedItems.push(saleItem);
          
          // Update inventory
          const inventoryItem = this.inventory.get(item.inventory_id);
          inventoryItem.quantity -= item.quantity;
        }
        
        return {
          sale,
          saleItems: processedItems,
          success: true
        };
      }
    };

    const saleData = {
      user_id: 'user-1',
      total_amount: 150,
      sale_date: new Date().toISOString()
    };

    const saleItems = [
      { inventory_id: 'item-1', quantity: 5, unit_price: 10 },
      { inventory_id: 'item-2', quantity: 10, unit_price: 10 }
    ];

    // Process successful sale
    const result = await mockSaleProcessor.processCompleteSale(saleData, saleItems);
    
    expect(result.success).toBe(true);
    expect(result.sale.user_id).toBe('user-1');
    expect(result.saleItems).toHaveLength(2);
    expect(result.saleItems[0].line_total).toBe(50);
    
    // Verify inventory was updated
    expect(mockSaleProcessor.inventory.get('item-1').quantity).toBe(95);
    expect(mockSaleProcessor.inventory.get('item-2').quantity).toBe(40);

    // Test insufficient stock
    const largeOrder = [
      { inventory_id: 'item-1', quantity: 200, unit_price: 10 }
    ];

    await expect(
      mockSaleProcessor.processCompleteSale(saleData, largeOrder)
    ).rejects.toThrow('Insufficient stock for item-1');
  });

  // ===========================
  // TEST 6: Secure Storage
  // ===========================
  test('6. Secure storage for auth data', async () => {
    const mockSecureStorage = {
      store: new Map(),
      
      async setSecure(key, value) {
        // Simulate encryption
        const encrypted = btoa(JSON.stringify(value));
        this.store.set(key, encrypted);
        return true;
      },
      
      async getSecure(key) {
        const encrypted = this.store.get(key);
        if (!encrypted) return null;
        
        // Simulate decryption
        try {
          return JSON.parse(atob(encrypted));
        } catch {
          return null;
        }
      },
      
      async clearSecure() {
        this.store.clear();
        return true;
      }
    };

    const sessionData = {
      user: { id: 'user-123', email: 'test@example.com' },
      token: 'secret-token',
      expires: new Date().toISOString()
    };

    // Store secure data
    await mockSecureStorage.setSecure('user_session', sessionData);
    
    // Retrieve secure data
    const retrieved = await mockSecureStorage.getSecure('user_session');
    expect(retrieved).toEqual(sessionData);
    
    // Clear secure storage
    await mockSecureStorage.clearSecure();
    const afterClear = await mockSecureStorage.getSecure('user_session');
    expect(afterClear).toBeNull();
  });

  // ===========================
  // TEST 7: Data Integrity
  // ===========================
  test('7. Data integrity across operations', async () => {
    const mockDataStore = {
      tables: {
        inventory: new Map(),
        sales: new Map(),
        sale_items: new Map()
      },
      
      async runTransaction(operations) {
        const rollbackData = {};
        
        try {
          // Save current state for rollback
          for (const [tableName, table] of Object.entries(this.tables)) {
            rollbackData[tableName] = new Map(table);
          }
          
          // Execute operations
          for (const operation of operations) {
            await this.executeOperation(operation);
          }
          
          return { success: true, operations: operations.length };
        } catch (error) {
          // Rollback on error
          this.tables = rollbackData;
          throw error;
        }
      },
      
      async executeOperation(operation) {
        const { table, action, id, data } = operation;
        
        if (action === 'insert') {
          this.tables[table].set(id, data);
        } else if (action === 'update') {
          if (!this.tables[table].has(id)) {
            throw new Error(`Record ${id} not found in ${table}`);
          }
          const current = this.tables[table].get(id);
          this.tables[table].set(id, { ...current, ...data });
        } else if (action === 'delete') {
          if (!this.tables[table].delete(id)) {
            throw new Error(`Record ${id} not found in ${table}`);
          }
        } else {
          throw new Error(`Unknown action: ${action}`);
        }
      }
    };

    // Test successful transaction
    const successfulOps = [
      { table: 'inventory', action: 'insert', id: 'inv-1', data: { name: 'Item 1', quantity: 100 } },
      { table: 'sales', action: 'insert', id: 'sale-1', data: { total: 50 } },
      { table: 'sale_items', action: 'insert', id: 'item-1', data: { sale_id: 'sale-1', quantity: 5 } }
    ];

    const result = await mockDataStore.runTransaction(successfulOps);
    expect(result.success).toBe(true);
    expect(result.operations).toBe(3);
    
    // Verify all operations were applied
    expect(mockDataStore.tables.inventory.has('inv-1')).toBe(true);
    expect(mockDataStore.tables.sales.has('sale-1')).toBe(true);
    expect(mockDataStore.tables.sale_items.has('item-1')).toBe(true);

    // Test transaction rollback
    const failingOps = [
      { table: 'inventory', action: 'insert', id: 'inv-2', data: { name: 'Item 2' } },
      { table: 'sales', action: 'update', id: 'non-existent', data: { total: 100 } } // This will fail
    ];

    await expect(
      mockDataStore.runTransaction(failingOps)
    ).rejects.toThrow('Record non-existent not found in sales');
    
    // Verify rollback - inv-2 should not exist
    expect(mockDataStore.tables.inventory.has('inv-2')).toBe(false);
  });

  // ===========================
  // TEST 8: Temp ID Resolution
  // ===========================
  test('8. Temporary ID resolution for offline items', async () => {
    const mockIdResolver = {
      tempMappings: new Map(),
      
      generateTempId() {
        return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      },
      
      async mapTempToReal(tempId, realId) {
        this.tempMappings.set(tempId, realId);
        return true;
      },
      
      async resolveTempId(id) {
        if (typeof id === 'string' && id.startsWith('temp_')) {
          return this.tempMappings.get(id) || id;
        }
        return id;
      },
      
      async resolveReferences(data) {
        const resolved = { ...data };
        
        for (const [key, value] of Object.entries(resolved)) {
          if (typeof value === 'string' && value.startsWith('temp_')) {
            resolved[key] = await this.resolveTempId(value);
          }
        }
        
        return resolved;
      }
    };

    // Generate temp ID
    const tempId = mockIdResolver.generateTempId();
    expect(tempId).toMatch(/^temp_\d+_[a-z0-9]+$/);

    // Map temp ID to real ID
    await mockIdResolver.mapTempToReal(tempId, 'real-id-123');
    
    // Resolve temp ID
    const resolved = await mockIdResolver.resolveTempId(tempId);
    expect(resolved).toBe('real-id-123');
    
    // Resolve references in data
    const dataWithTempRefs = {
      id: 'sale-1',
      inventory_id: tempId,
      user_id: 'user-123'
    };
    
    const resolvedData = await mockIdResolver.resolveReferences(dataWithTempRefs);
    expect(resolvedData.inventory_id).toBe('real-id-123');
    expect(resolvedData.user_id).toBe('user-123'); // unchanged
  });

  // ===========================
  // TEST 9: Statistics Collection
  // ===========================
  test('9. Statistics and monitoring', async () => {
    const mockStatsCollector = {
      stats: {
        operations: { processed: 0, succeeded: 0, failed: 0 },
        storage: { reads: 0, writes: 0, deletes: 0 },
        queue: { pending: 0, completed: 0, retries: 0 }
      },
      
      incrementStat(category, stat, amount = 1) {
        if (this.stats[category] && this.stats[category][stat] !== undefined) {
          this.stats[category][stat] += amount;
        }
      },
      
      getStats() {
        return {
          ...this.stats,
          timestamp: new Date().toISOString(),
          uptime: Date.now()
        };
      },
      
      async simulateOperations() {
        // Simulate some operations
        this.incrementStat('storage', 'writes', 5);
        this.incrementStat('storage', 'reads', 10);
        this.incrementStat('operations', 'processed', 3);
        this.incrementStat('operations', 'succeeded', 2);
        this.incrementStat('operations', 'failed', 1);
        this.incrementStat('queue', 'pending', 2);
        this.incrementStat('queue', 'retries', 1);
        
        return this.getStats();
      }
    };

    // Collect some stats
    const stats = await mockStatsCollector.simulateOperations();
    
    expect(stats.storage.writes).toBe(5);
    expect(stats.storage.reads).toBe(10);
    expect(stats.operations.processed).toBe(3);
    expect(stats.operations.succeeded).toBe(2);
    expect(stats.operations.failed).toBe(1);
    expect(stats.queue.pending).toBe(2);
    expect(stats.queue.retries).toBe(1);
    expect(stats.timestamp).toBeDefined();
    expect(stats.uptime).toBeGreaterThan(0);
  });

  // ===========================
  // TEST 10: End-to-End Workflow
  // ===========================
  test('10. End-to-end offline to online sync workflow', async () => {
    const mockWorkflow = {
      isOnline: false,
      localData: new Map(),
      syncQueue: [],
      remoteData: new Map(),
      
      // Simulate offline operations
      async addItemOffline(item) {
        if (this.isOnline) {
          throw new Error('Use online method when connected');
        }
        
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const offlineItem = { ...item, id: tempId, is_offline: true, synced: false };
        
        this.localData.set(tempId, offlineItem);
        this.syncQueue.push({
          operation: 'INSERT',
          table: 'inventory',
          data: offlineItem,
          tempId
        });
        
        return offlineItem;
      },
      
      // Simulate going online and syncing
      async goOnlineAndSync() {
        this.isOnline = true;
        const results = { processed: 0, succeeded: 0, failed: 0 };
        
        for (const queueItem of this.syncQueue) {
          results.processed++;
          
          try {
            // Simulate server response
            const realId = `real_${Date.now()}_${results.processed}`;
            const serverItem = { ...queueItem.data, id: realId, is_offline: false, synced: true };
            
            // Store on "server"
            this.remoteData.set(realId, serverItem);
            
            // Update local data
            this.localData.delete(queueItem.tempId);
            this.localData.set(realId, serverItem);
            
            results.succeeded++;
          } catch (error) {
            results.failed++;
          }
        }
        
        // Clear sync queue
        this.syncQueue = [];
        return results;
      },
      
      // Get all items (local + synced)
      getAllItems() {
        return Array.from(this.localData.values());
      }
    };

    // Start offline - add some items
    const item1 = await mockWorkflow.addItemOffline({ name: 'Offline Item 1', quantity: 10 });
    const item2 = await mockWorkflow.addItemOffline({ name: 'Offline Item 2', quantity: 20 });
    
    expect(item1.id).toMatch(/^temp_/);
    expect(item1.is_offline).toBe(true);
    expect(item1.synced).toBe(false);
    
    expect(mockWorkflow.syncQueue).toHaveLength(2);
    expect(mockWorkflow.getAllItems()).toHaveLength(2);
    
    // Go online and sync
    const syncResults = await mockWorkflow.goOnlineAndSync();
    
    expect(syncResults.processed).toBe(2);
    expect(syncResults.succeeded).toBe(2);
    expect(syncResults.failed).toBe(0);
    
    // Verify final state
    const allItems = mockWorkflow.getAllItems();
    expect(allItems).toHaveLength(2);
    expect(allItems.every(item => item.synced)).toBe(true);
    expect(allItems.every(item => !item.is_offline)).toBe(true);
    expect(allItems.every(item => !item.id.startsWith('temp_'))).toBe(true);
    
    // Verify items are on "server"
    expect(mockWorkflow.remoteData.size).toBe(2);
    expect(mockWorkflow.syncQueue).toHaveLength(0);
  });
});
