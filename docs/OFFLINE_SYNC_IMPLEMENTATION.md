# Offline-Online Sync Implementation Documentation

## Overview

This document describes the implementation of comprehensive offline-online synchronization functionality in the Financial Dashboard App. The solution enables users to seamlessly work with the application regardless of network connectivity, with automatic synchronization when connectivity is restored.

## Architecture Components

### 1. DataPreloader Service
Handles initial data loading on login to ensure instant page navigation.

**Key Features:**
- Preloads user profile data
- Preloads store information (for owners and workers)
- Preloads inventory, sales, and expenses data
- Preloads dashboard metrics and charts data
- Uses consistent cache key generation for data consistency

### 2. Enhanced OfflineManager
Manages synchronization queue and conflict resolution with improved functionality.

**Key Features:**
- Network state monitoring via NetworkInterceptor
- Sync queue management with exponential backoff retry logic
- Transaction support for data consistency
- Conflict resolution with timestamp-based strategies
- Sync status monitoring and reporting

### 3. NetworkInterceptor
Monitors network connectivity changes and triggers appropriate actions.

**Key Features:**
- Real-time network status monitoring
- Automatic sync trigger when connectivity is restored
- Network state change notifications

### 4. SyncStatusIndicator Component
Visual indicator showing current sync status to users.

**Key Features:**
- Offline mode banner
- Pending sync item counter
- Sync in progress indicator

## Implementation Details

### Data Preloading
Upon successful login, the application preloads data for all screens to ensure instant navigation:

1. **User Profile**: Role and store assignment information
2. **Stores**: Store information for owners and workers
3. **Inventory**: Complete inventory data
4. **Sales**: Sales history
5. **Expenses**: Expense records
6. **Dashboard**: Metrics and charts data

### Offline Data Storage
All data is stored locally using AsyncStorage with the following structure:
```
offline_{key} = {
  data: [actual_data],
  timestamp: [ISO_timestamp],
  synced: [boolean]
}
```

### Sync Process
When connectivity is restored:
1. Items in the sync queue are processed in order
2. Failed sync operations are requeued with exponential backoff
3. Successful sync operations update local cache
4. Conflict resolution uses timestamp-based strategies

### Conflict Resolution
The system implements timestamp-based conflict resolution:
- When conflicts occur, the most recent data (based on timestamps) is preserved
- Conflicts are logged for debugging purposes

### Retry Logic
Failed sync operations use exponential backoff:
- 1st attempt: 1 second delay
- 2nd attempt: 2 seconds delay
- 3rd attempt: 4 seconds delay
- Maximum delay: 30 seconds

## API Integration

The synchronization mechanism works with the existing Supabase backend through standard REST endpoints:

### Authentication
- `POST /auth/v1/token?grant_type=password` - User login
- `GET /auth/v1/user` - Get current user
- `POST /auth/v1/logout` - User logout

### Data Operations
- `GET /rest/v1/inventory` - Fetch inventory items
- `POST /rest/v1/inventory` - Create inventory item
- `PATCH /rest/v1/inventory?id=eq.{id}` - Update inventory item
- `DELETE /rest/v1/inventory?id=eq.{id}` - Delete inventory item

- `GET /rest/v1/sales` - Fetch sales records
- `POST /rest/v1/sales` - Create sales record
- `GET /rest/v1/sale_items` - Fetch sale items
- `POST /rest/v1/sale_items` - Create sale items

- `GET /rest/v1/expenses` - Fetch expense records
- `POST /rest/v1/expenses` - Create expense record
- `DELETE /rest/v1/expenses?id=eq.{id}` - Delete expense record

## Security Considerations

### Data Encryption
- All sensitive data is stored using AsyncStorage (encrypted at rest on supported platforms)
- Authentication tokens are securely managed by Supabase

### Access Control
- Role-based access control enforced on both client and server
- Offline mode maintains role restrictions

## Performance Optimizations

### Memory Management
- Efficient caching strategies to minimize memory usage
- Pagination for large datasets (planned enhancement)

### Network Optimization
- Batch operations when possible
- Request prioritization for critical operations

### Storage Optimization
- Efficient data serialization
- Regular cleanup of obsolete cached data

## Testing Strategy

### Unit Tests
1. Data preloading functionality
2. Offline data persistence
3. Sync queue management
4. Conflict resolution logic
5. Error handling and recovery

### Integration Tests
1. Full offline workflow simulation
2. Sync process with various conflict scenarios
3. Data consistency across sessions
4. Performance testing with large datasets

## Error Handling & Recovery

### Error Categories
1. Network errors
2. Data conflicts
3. Storage errors
4. Authentication errors

### Recovery Strategies
1. Automatic retry with exponential backoff
2. Manual sync trigger for persistent errors
3. Data rollback for failed operations
4. User notification for critical errors

## Future Enhancements

1. **Advanced Conflict Resolution**: Implement more sophisticated conflict resolution strategies
2. **Data Compression**: Compress data for transfer to reduce bandwidth usage
3. **Selective Sync**: Allow users to select which data to sync
4. **Background Sync**: Implement more aggressive background sync strategies
5. **Progressive Web App**: Extend offline support to web version

## Usage Examples

### Preloading Data
```javascript
const userData = {
  userId: 'user123',
  userRole: 'owner',
  storeId: 'store456'
};

await dataPreloader.preloadAll(userData);
```

### Monitoring Sync Status
```javascript
const unsubscribe = offlineManager.addNetworkListener((isOnline) => {
  console.log('Network status changed:', isOnline);
});

// Get current sync status
const status = offlineManager.getSyncStatus();
```

### Handling Transactions
```javascript
const transactionId = 'transaction_' + Date.now();

await offlineManager.beginTransaction(transactionId);

// Perform operations
await offlineManager.storeDataWithTransaction(
  key, 
  data, 
  syncFunction, 
  rollbackFunction, 
  transactionId
);

await offlineManager.commitTransaction(transactionId);
```