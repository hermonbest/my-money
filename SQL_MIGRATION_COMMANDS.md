# 📊 SQLite Migration - SQL Commands Reference

## 🗄️ **Complete Database Schema**

### **1. Core Tables with Offline Support**

#### **Inventory Table:**
```sql
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  temp_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  store_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  cost_price REAL NOT NULL DEFAULT 0,
  selling_price REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  minimum_stock_level INTEGER DEFAULT 0,
  expiration_date TEXT,
  synced BOOLEAN NOT NULL DEFAULT 0,
  is_offline BOOLEAN NOT NULL DEFAULT 0
);
```

#### **Sales Table:**
```sql
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  temp_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  store_id TEXT,
  sale_number TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT,
  sale_date TEXT NOT NULL,
  notes TEXT,
  synced BOOLEAN NOT NULL DEFAULT 0,
  is_offline BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### **Sale Items Table:**
```sql
CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  inventory_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  synced BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);
```

#### **Expenses Table:**
```sql
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  temp_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  store_id TEXT,
  category TEXT,
  description TEXT,
  amount REAL NOT NULL DEFAULT 0,
  expense_date TEXT NOT NULL,
  receipt_url TEXT,
  vendor TEXT,
  payment_method TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT 0,
  synced BOOLEAN NOT NULL DEFAULT 0,
  is_offline BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### **2. Sync and Management Tables**

#### **Sync Queue Table:**
```sql
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  operation_key TEXT UNIQUE NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('INSERT', 'UPDATE', 'DELETE')),
  data TEXT NOT NULL,
  sync_function_ref TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  synced BOOLEAN NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### **User Profiles Table:**
```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('individual', 'owner', 'worker')),
  store_id TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  business_name TEXT,
  address TEXT,
  synced BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### **Worker Assignments Table:**
```sql
CREATE TABLE IF NOT EXISTS worker_assignments (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  worker_email TEXT NOT NULL,
  worker_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  assigned_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(store_id, worker_email)
);
```

#### **Cache Metadata Table:**
```sql
CREATE TABLE IF NOT EXISTS cache_metadata (
  key TEXT PRIMARY KEY,
  migrated BOOLEAN NOT NULL DEFAULT 0,
  migration_date TEXT,
  source TEXT NOT NULL CHECK (source IN ('asyncstorage', 'sqlite')),
  data_type TEXT,
  record_count INTEGER DEFAULT 0,
  expires_at TEXT,
  data TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 🔧 **Migration Commands for Existing Databases**

### **Add Missing Columns:**
```sql
-- Add temp_id columns (without UNIQUE constraint for existing tables)
ALTER TABLE sales ADD COLUMN temp_id TEXT;
ALTER TABLE expenses ADD COLUMN temp_id TEXT;

-- Add offline tracking columns
ALTER TABLE sales ADD COLUMN is_offline BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN is_offline BOOLEAN NOT NULL DEFAULT 0;
```

### **Check Column Existence:**
```sql
-- Check if columns exist before adding them
PRAGMA table_info(sales);
PRAGMA table_info(expenses);
PRAGMA table_info(inventory);
```

---

## 📈 **Performance Indexes**

### **Inventory Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_store_id ON inventory(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_synced ON inventory(synced);
CREATE INDEX IF NOT EXISTS idx_inventory_updated_at ON inventory(updated_at);
CREATE INDEX IF NOT EXISTS idx_inventory_temp_id ON inventory(temp_id);
```

### **Sales Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON sales(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_synced ON sales(synced);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_temp_id ON sales(temp_id);
```

### **Sale Items Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_inventory_id ON sale_items(inventory_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_user_id ON sale_items(user_id);
```

### **Expenses Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_store_id ON expenses(store_id);
CREATE INDEX IF NOT EXISTS idx_expenses_synced ON expenses(synced);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_temp_id ON expenses(temp_id);
```

### **Sync Queue Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced);
CREATE INDEX IF NOT EXISTS idx_sync_queue_table_name ON sync_queue(table_name);
CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);
```

### **User Profiles Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_store_id ON user_profiles(store_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
```

### **Worker Assignments Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_worker_assignments_store_id ON worker_assignments(store_id);
CREATE INDEX IF NOT EXISTS idx_worker_assignments_worker_email ON worker_assignments(worker_email);
CREATE INDEX IF NOT EXISTS idx_worker_assignments_is_active ON worker_assignments(is_active);
```

### **Cache Metadata Indexes:**
```sql
CREATE INDEX IF NOT EXISTS idx_cache_metadata_migrated ON cache_metadata(migrated);
CREATE INDEX IF NOT EXISTS idx_cache_metadata_source ON cache_metadata(source);
CREATE INDEX IF NOT EXISTS idx_cache_metadata_expires_at ON cache_metadata(expires_at);
```

---

## 🔍 **Useful Query Commands**

### **Check Database Status:**
```sql
-- List all tables
SELECT name FROM sqlite_master WHERE type='table';

-- Check table structure
PRAGMA table_info(inventory);
PRAGMA table_info(sales);
PRAGMA table_info(expenses);

-- Check indexes
SELECT name FROM sqlite_master WHERE type='index';
```

### **Data Inspection:**
```sql
-- Check sync queue status
SELECT table_name, COUNT(*) as pending_count 
FROM sync_queue 
WHERE synced = 0 
GROUP BY table_name;

-- Check offline records
SELECT 'inventory' as table_name, COUNT(*) as offline_count 
FROM inventory 
WHERE is_offline = 1
UNION ALL
SELECT 'sales', COUNT(*) 
FROM sales 
WHERE is_offline = 1
UNION ALL
SELECT 'expenses', COUNT(*) 
FROM expenses 
WHERE is_offline = 1;

-- Check temp IDs
SELECT 'inventory' as table_name, COUNT(*) as temp_id_count 
FROM inventory 
WHERE temp_id IS NOT NULL
UNION ALL
SELECT 'sales', COUNT(*) 
FROM sales 
WHERE temp_id IS NOT NULL
UNION ALL
SELECT 'expenses', COUNT(*) 
FROM expenses 
WHERE temp_id IS NOT NULL;
```

### **Cleanup Commands:**
```sql
-- Clear completed sync operations
DELETE FROM sync_queue WHERE synced = 1;

-- Reset failed sync operations (if needed)
UPDATE sync_queue SET attempts = 0, error_message = NULL WHERE attempts >= max_attempts;

-- Clear all app data (for testing)
DELETE FROM inventory;
DELETE FROM sales;
DELETE FROM sale_items;
DELETE FROM expenses;
DELETE FROM sync_queue;
DELETE FROM user_profiles;
DELETE FROM worker_assignments;
DELETE FROM cache_metadata;
```

---

## 🛠️ **Database Configuration**

### **SQLite Pragma Settings:**
```sql
-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Check foreign key status
PRAGMA foreign_keys;

-- Optimize performance
PRAGMA synchronous = NORMAL;
PRAGMA journal_mode = WAL;
PRAGMA cache_size = 10000;
```

---

## 📋 **Migration Checklist**

### **✅ Schema Migration Commands:**
1. **Create Tables** → All tables with proper columns and constraints
2. **Add Missing Columns** → temp_id and is_offline for existing databases  
3. **Create Indexes** → Performance optimization for all tables
4. **Enable Foreign Keys** → Data integrity constraints
5. **Verify Migration** → Check column existence before operations

### **✅ Data Migration Commands:**
1. **Check Existing Data** → Verify current database state
2. **Backup Critical Data** → Ensure no data loss during migration
3. **Update Schema** → Add missing columns safely
4. **Create Indexes** → Optimize query performance
5. **Test Operations** → Verify all CRUD operations work

---

**All SQL commands are production-ready and have been tested in the app!** 🚀
