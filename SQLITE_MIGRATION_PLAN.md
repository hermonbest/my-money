# SQLite Migration Plan: AsyncStorage to expo-sqlite

## Overview
This document outlines a comprehensive, step-by-step migration plan to transition the offline-first system from AsyncStorage to SQLite using expo-sqlite. The migration is designed to be **non-disruptive** and **backward-compatible** during the transition period.

## Current State Analysis

### Existing AsyncStorage Usage
- **OfflineDataService.js**: Uses cache keys for inventory, sales, expenses, user profiles
- **OfflineManager.js**: Stores sync queue and local data with `offline_` prefix
- **authUtils.js**: Caches user sessions and profiles
- **App.js**: Loads and caches user profiles

### Key Data Structures
1. **Cache Keys**: `{dataType}_{storeId}_{userRole}` or `{dataType}_{userId}_{userRole}`
2. **Sync Queue**: Pending operations stored with metadata
3. **User Sessions**: Cached authentication data
4. **Role-based Access**: individual, owner, worker roles with shared store data

## Migration Strategy: Phased Approach

### Phase 1: Foundation Setup (Steps 1-5)
**Goal**: Create SQLite infrastructure alongside existing AsyncStorage system

### Phase 2: Parallel Operation (Steps 6-10)
**Goal**: Run SQLite alongside AsyncStorage with data synchronization

### Phase 3: Migration & Transition (Steps 11-15)
**Goal**: Migrate existing data and switch primary storage to SQLite

### Phase 4: Cleanup & Optimization (Steps 16-20)
**Goal**: Remove AsyncStorage dependencies and optimize SQLite operations

---

## Detailed Migration Steps

### Phase 1: Foundation Setup

#### Step 1: Create SQLite Database Schema
**File**: `utils/SqliteDatabase.js`
**Risk**: Low - New file, no existing dependencies

**Tables to Create**:
```sql
-- Core data tables
CREATE TABLE inventory (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  store_id TEXT,
  name TEXT,
  quantity INTEGER,
  unit_price REAL,
  category TEXT,
  description TEXT,
  synced BOOLEAN DEFAULT 0,
  is_offline BOOLEAN DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  store_id TEXT,
  sale_number TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  subtotal REAL,
  tax_amount REAL,
  discount_amount REAL,
  total_amount REAL,
  payment_method TEXT,
  payment_status TEXT,
  sale_date TEXT,
  synced BOOLEAN DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT,
  inventory_id TEXT,
  user_id TEXT,
  item_name TEXT,
  quantity INTEGER,
  unit_price REAL,
  line_total REAL,
  synced BOOLEAN DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (sale_id) REFERENCES sales(id)
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  store_id TEXT,
  category TEXT,
  description TEXT,
  amount REAL,
  expense_date TEXT,
  receipt_url TEXT,
  synced BOOLEAN DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

-- Sync and cache tables
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,
  operation_key TEXT UNIQUE,
  table_name TEXT,
  record_id TEXT,
  operation_type TEXT, -- 'INSERT', 'UPDATE', 'DELETE'
  data TEXT, -- JSON data
  sync_function TEXT, -- Serialized function reference
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  synced BOOLEAN DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  role TEXT,
  store_id TEXT,
  full_name TEXT,
  email TEXT,
  synced BOOLEAN DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  session_data TEXT, -- JSON session data
  expires_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- Cache metadata table for migration tracking
CREATE TABLE cache_metadata (
  key TEXT PRIMARY KEY,
  migrated BOOLEAN DEFAULT 0,
  migration_date TEXT,
  source TEXT -- 'asyncstorage' or 'sqlite'
);
```

#### Step 2: Create SQLite Service Layer
**File**: `utils/SqliteService.js`
**Risk**: Low - New service, no existing dependencies

**Core Methods**:
- Database initialization
- Table creation and migration
- Generic CRUD operations
- Transaction support
- Query builders for complex operations

#### Step 3: Create Data Access Layer
**File**: `utils/DataRepository.js`
**Risk**: Low - New abstraction layer

**Features**:
- Unified interface for data operations
- Role-based data filtering
- Cache key to SQL query mapping
- Temporary ID handling

#### Step 4: Create Migration Utilities
**File**: `utils/MigrationUtils.js`
**Risk**: Low - Utility functions only

**Functions**:
- AsyncStorage data extraction
- Data transformation for SQLite
- Migration progress tracking
- Rollback capabilities

#### Step 5: Update Package Dependencies
**File**: `package.json`
**Risk**: Low - Adding dependencies only

- Ensure expo-sqlite is properly configured
- Add any additional utilities if needed

### Phase 2: Parallel Operation

#### Step 6: Create Hybrid Storage Manager
**File**: `utils/HybridStorageManager.js`
**Risk**: Medium - Core storage logic

**Features**:
- Route operations to both AsyncStorage and SQLite
- Compare results for consistency
- Gradual migration flag support
- Fallback mechanisms

#### Step 7: Implement SQLite Data Operations
**File**: `utils/SqliteDataService.js`
**Risk**: Medium - Core business logic replication

**Operations to Implement**:
- All CRUD operations from OfflineDataService
- Role-based access control
- Cache key mapping to SQL queries
- Temporary ID management

#### Step 8: Create Migration Controller
**File**: `utils/MigrationController.js`
**Risk**: Medium - Controls migration process

**Features**:
- Migration progress tracking
- Background migration scheduling
- Error handling and recovery
- Migration status reporting

#### Step 9: Add Migration UI Indicators
**Files**: Various UI components
**Risk**: Low - UI enhancements only

**Features**:
- Migration progress indicators
- User notifications during migration
- Fallback messaging

#### Step 10: Implement Data Validation
**File**: `utils/DataValidator.js`
**Risk**: Low - Validation utilities

**Features**:
- Compare AsyncStorage vs SQLite data
- Integrity checks
- Migration verification

### Phase 3: Migration & Transition

#### Step 11: Background Data Migration
**Risk**: High - Data integrity critical

**Process**:
1. Create migration background task
2. Migrate data in small batches
3. Verify each batch before proceeding
4. Handle conflicts and duplicates
5. Update migration progress

#### Step 12: Update OfflineDataService
**File**: `utils/OfflineDataService.js`
**Risk**: High - Core service modification

**Changes**:
- Replace AsyncStorage calls with SQLite calls
- Maintain existing API interface
- Add migration checks before operations
- Preserve role-based access control

#### Step 13: Update OfflineManager
**File**: `utils/OfflineManager.js`
**Risk**: High - Sync logic modification

**Changes**:
- Replace AsyncStorage with SQLite for sync queue
- Update sync operations to use SQLite
- Preserve existing sync logic and conflict resolution
- Update transaction management

#### Step 14: Update Authentication Utils
**File**: `utils/authUtils.js`
**Risk**: Medium - Authentication flow

**Changes**:
- Store user sessions in SQLite
- Update profile caching to use SQLite
- Maintain existing authentication flow
- Add migration for existing cached sessions

#### Step 15: Update App.js
**File**: `App.js`
**Risk**: Medium - App initialization

**Changes**:
- Initialize SQLite database on app start
- Update user profile loading to use SQLite
- Add migration status checking
- Preserve existing app flow

### Phase 4: Cleanup & Optimization

#### Step 16: Performance Testing
**Risk**: Medium - Performance validation

**Tasks**:
- Benchmark SQLite vs AsyncStorage performance
- Optimize SQL queries
- Index critical columns
- Test with large datasets

#### Step 17: Error Handling Enhancement
**Risk**: Low - Robustness improvement

**Enhancements**:
- Add comprehensive error handling
- Implement retry mechanisms
- Add detailed logging
- Create error recovery procedures

#### Step 18: AsyncStorage Cleanup
**Risk**: Medium - Legacy code removal

**Process**:
- Remove AsyncStorage dependencies
- Clean up migration code
- Remove hybrid storage manager
- Update imports and references

#### Step 19: Documentation Update
**Risk**: Low - Documentation tasks

**Updates**:
- Update API documentation
- Create SQLite schema documentation
- Document migration process
- Update troubleshooting guides

#### Step 20: Final Testing & Validation
**Risk**: Medium - Quality assurance

**Testing**:
- End-to-end functionality testing
- Offline/online sync testing
- Role-based access testing
- Performance validation
- Migration edge case testing

---

## Safety Measures

### 1. Backup Strategy
- Create AsyncStorage backup before migration
- Implement rollback mechanisms
- Maintain data integrity checksums

### 2. Feature Flags
- Use feature flags to control migration phases
- Allow granular control over SQLite adoption
- Enable quick rollback if issues arise

### 3. Gradual Migration
- Migrate data types one at a time
- Start with least critical data (user preferences)
- Progress to critical data (sales, inventory)

### 4. Monitoring & Logging
- Add comprehensive logging throughout migration
- Monitor performance metrics
- Track migration success rates
- Alert on migration failures

### 5. Testing Strategy
- Test each phase independently
- Use test devices for migration testing
- Create automated migration tests
- Validate data integrity at each step

---

## Risk Assessment

| Step | Risk Level | Impact | Mitigation Strategy |
|------|------------|---------|-------------------|
| 1-5  | Low        | None    | New code, no dependencies |
| 6-10 | Medium     | Limited | Parallel operation, fallbacks |
| 11   | High       | High    | Batch migration, validation |
| 12-15| High       | High    | Gradual rollout, testing |
| 16-20| Low-Medium | Medium  | Comprehensive testing |

---

## Success Criteria

### Phase 1-2 Completion
- [ ] SQLite database created and accessible
- [ ] Data can be written to and read from SQLite
- [ ] Parallel operation working correctly
- [ ] No disruption to existing functionality

### Phase 3 Completion
- [ ] All AsyncStorage data successfully migrated
- [ ] SQLite operations replacing AsyncStorage calls
- [ ] Role-based access control functioning
- [ ] Sync logic working with SQLite
- [ ] Temporary ID mapping preserved

### Phase 4 Completion
- [ ] AsyncStorage dependencies removed
- [ ] Performance equal or better than AsyncStorage
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Migration process documented

---

## Rollback Plan

### Immediate Rollback (if needed during Phase 2-3)
1. Disable SQLite operations via feature flag
2. Revert to AsyncStorage-only operations
3. Restore from AsyncStorage backup if needed
4. Log and analyze failure causes

### Complete Rollback (if needed after Phase 3)
1. Stop all SQLite operations
2. Restore AsyncStorage from backup
3. Revert code changes to pre-migration state
4. Restart application with AsyncStorage

---

## Timeline Estimate

- **Phase 1**: 2-3 days (Foundation setup)
- **Phase 2**: 3-4 days (Parallel operation)
- **Phase 3**: 4-5 days (Migration & transition)
- **Phase 4**: 2-3 days (Cleanup & optimization)

**Total Estimated Time**: 11-15 days

---

## Post-Migration Benefits

1. **Improved Performance**: SQLite queries vs JSON parsing
2. **Better Data Integrity**: ACID transactions
3. **Advanced Querying**: Complex queries and joins
4. **Reduced Memory Usage**: On-demand data loading
5. **Better Concurrency**: Multiple simultaneous operations
6. **Data Relationships**: Foreign keys and constraints
7. **Easier Debugging**: SQL-based data inspection

---

This plan ensures a safe, methodical migration from AsyncStorage to SQLite while maintaining the existing functionality and user experience throughout the process.
