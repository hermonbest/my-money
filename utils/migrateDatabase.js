// =====================================================
// DATABASE MIGRATION UTILITY
// =====================================================
// Adds missing temp_id columns to existing tables
// =====================================================

import { sqliteDatabase } from './SqliteDatabase';

/**
 * Migrate existing database to add temp_id columns
 */
export async function migrateDatabase() {
  try {
    console.log('🔄 Starting database migration...');
    
    const db = sqliteDatabase.getDatabase();
    
    // Add temp_id column to sales table if it doesn't exist
    try {
      await db.execAsync('ALTER TABLE sales ADD COLUMN temp_id TEXT;');
      console.log('✅ Added temp_id column to sales table');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('✅ temp_id column already exists in sales table');
      } else {
        throw error;
      }
    }
    
    // Add is_offline column to sales table if it doesn't exist
    try {
      await db.execAsync('ALTER TABLE sales ADD COLUMN is_offline BOOLEAN NOT NULL DEFAULT 0;');
      console.log('✅ Added is_offline column to sales table');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('✅ is_offline column already exists in sales table');
      } else {
        throw error;
      }
    }
    
    // Add temp_id column to expenses table if it doesn't exist
    try {
      await db.execAsync('ALTER TABLE expenses ADD COLUMN temp_id TEXT;');
      console.log('✅ Added temp_id column to expenses table');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('✅ temp_id column already exists in expenses table');
      } else {
        throw error;
      }
    }
    
    // Add is_offline column to expenses table if it doesn't exist
    try {
      await db.execAsync('ALTER TABLE expenses ADD COLUMN is_offline BOOLEAN NOT NULL DEFAULT 0;');
      console.log('✅ Added is_offline column to expenses table');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('✅ is_offline column already exists in expenses table');
      } else {
        throw error;
      }
    }
    
    // Create missing indexes
    try {
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_sales_temp_id ON sales(temp_id);');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_expenses_temp_id ON expenses(temp_id);');
      console.log('✅ Created temp_id indexes');
    } catch (error) {
      console.warn('⚠️ Some indexes may already exist:', error.message);
    }
    
    console.log('🎉 Database migration completed successfully');
    
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    throw error;
  }
}

export default migrateDatabase;
