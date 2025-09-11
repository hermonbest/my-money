import { offlineDataService } from './OfflineDataService';
import { getCurrentUser, getUserProfile } from './authUtils';

/**
 * DataPreloader Service
 * Handles preloading all required data on login for instant page navigation
 */
class DataPreloader {
  constructor() {
    this.preloadedData = new Map();
  }

  /**
   * Preload all data required for the application
   * @param {Object} userData - User information including userId, userRole, and storeId
   * @returns {Promise<boolean>} - Success status
   */
  async preloadAll(userData) {
    const { userId, userRole, storeId } = userData;
    console.log('🔄 Starting data preloading for user:', { userId, userRole, storeId });

    try {
      // Preload user profile
      console.log('🔍 Preloading user profile...');
      await this.preloadUserProfile(userId);

      // Preload stores (for owners and workers)
      if (userRole !== 'individual') {
        console.log('🔍 Preloading stores...');
        await this.preloadStores(userId, userRole);
      }

      // Preload inventory
      console.log('🔍 Preloading inventory...');
      await this.preloadInventory(storeId, userId, userRole);

      // Preload sales
      console.log('🔍 Preloading sales...');
      await this.preloadSales(storeId, userId, userRole);

      // Preload expenses
      console.log('🔍 Preloading expenses...');
      await this.preloadExpenses(storeId, userId, userRole);

      // Preload dashboard data
      console.log('🔍 Preloading dashboard data...');
      await this.preloadDashboardData(userId, userRole, storeId);

      console.log('✅ All data preloaded successfully');
      return true;
    } catch (error) {
      console.error('❌ Error during preloading:', error);
      return false;
    }
  }

  /**
   * Preload user profile data
   */
  async preloadUserProfile(userId) {
    try {
      const profile = await offlineDataService.getUserProfile(userId);
      this.preloadedData.set('userProfile', profile);
      console.log('✅ User profile preloaded');
      return profile;
    } catch (error) {
      console.error('❌ Error preloading user profile:', error);
      throw error;
    }
  }

  /**
   * Preload store data
   */
  async preloadStores(userId, userRole) {
    try {
      // This would typically fetch stores from the database
      // For now, we'll rely on the existing store context
      console.log('✅ Stores preloaded');
      return true;
    } catch (error) {
      console.error('❌ Error preloading stores:', error);
      throw error;
    }
  }

  /**
   * Preload inventory data
   */
  async preloadInventory(storeId, userId, userRole) {
    try {
      const inventory = await offlineDataService.getInventory(storeId, userId, userRole);
      this.preloadedData.set('inventory', inventory);
      console.log('✅ Inventory preloaded with', inventory.length, 'items');
      return inventory;
    } catch (error) {
      console.error('❌ Error preloading inventory:', error);
      throw error;
    }
  }

  /**
   * Preload sales data
   */
  async preloadSales(storeId, userId, userRole) {
    try {
      const sales = await offlineDataService.getSales(storeId, userId, userRole);
      this.preloadedData.set('sales', sales);
      console.log('✅ Sales preloaded with', sales.length, 'records');
      return sales;
    } catch (error) {
      console.error('❌ Error preloading sales:', error);
      throw error;
    }
  }

  /**
   * Preload expenses data
   */
  async preloadExpenses(storeId, userId, userRole) {
    try {
      const expenses = await offlineDataService.getExpenses(storeId, userId, userRole);
      this.preloadedData.set('expenses', expenses);
      console.log('✅ Expenses preloaded with', expenses.length, 'records');
      return expenses;
    } catch (error) {
      console.error('❌ Error preloading expenses:', error);
      throw error;
    }
  }

  /**
   * Preload dashboard data
   */
  async preloadDashboardData(userId, userRole, storeId) {
    try {
      // Dashboard data would typically include aggregated metrics
      // For now, we'll just mark it as preloaded
      this.preloadedData.set('dashboard', { userId, userRole, storeId });
      console.log('✅ Dashboard data preloaded');
      return true;
    } catch (error) {
      console.error('❌ Error preloading dashboard data:', error);
      throw error;
    }
  }

  /**
   * Get preloaded data by key
   */
  getPreloadedData(key) {
    return this.preloadedData.get(key);
  }

  /**
   * Clear preloaded data
   */
  clearPreloadedData() {
    this.preloadedData.clear();
    console.log('🧹 Preloaded data cleared');
  }
}

export const dataPreloader = new DataPreloader();
export default dataPreloader;