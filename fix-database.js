// Quick database fix script
// Run this to clear corrupted data and resolve the 450+ errors

import { DatabaseCleanup } from './utils/DatabaseCleanup.js';

async function fixDatabase() {
  console.log('🔧 Starting database fix...');
  console.log('This will clear corrupted sales data to resolve transaction conflicts.');
  
  try {
    // Clear corrupted sales data
    const result = await DatabaseCleanup.clearCorruptedSalesData();
    
    if (result.success) {
      console.log('✅ Database fix completed successfully!');
      console.log('📱 The app should now work without the 450+ errors');
      console.log('🔄 You may need to restart the app to see the changes');
    } else {
      console.error('❌ Database fix failed:', result.error);
    }
    
  } catch (error) {
    console.error('💥 Unexpected error during database fix:', error);
  }
}

// Run the fix
fixDatabase();
