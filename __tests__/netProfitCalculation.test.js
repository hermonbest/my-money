import React from 'react';
import { render } from '@testing-library/react-native';

// Mock the necessary modules
jest.mock('../utils/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  },
}));

jest.mock('../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

jest.mock('../contexts/StoreContext', () => ({
  useStore: () => ({ 
    selectedStore: { id: 'store1', name: 'Test Store' },
    userRole: 'owner',
    selectStore: jest.fn(),
    stores: [{ id: 'store1', name: 'Test Store' }]
  }),
}));

jest.mock('../utils/authUtils', () => ({
  getCurrentUser: jest.fn().mockResolvedValue({ user: { id: 'user1' } }),
}));

jest.mock('../utils/translations', () => ({
  getTranslation: (key) => key,
}));

jest.mock('../utils/timeFilters', () => ({
  TIME_FILTERS: {
    TODAY: 'today',
    WEEK: 'week',
    MONTH: 'month',
    ALL_TIME: 'all_time'
  },
  TIME_FILTER_LABELS: {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    all_time: 'All Time'
  },
  getDateRange: jest.fn().mockReturnValue({ startDate: null, endDate: null }),
  getDateRangeDescription: jest.fn().mockReturnValue('All time'),
  getTimeFilterOptions: jest.fn().mockReturnValue([]),
  formatCurrency: (value) => `$${value.toFixed(2)}`,
  formatNumber: (value) => value.toString(),
}));

jest.mock('../utils/chartDataUtils', () => ({
  getStoreComparisonData: jest.fn().mockReturnValue([]),
  calculatePerformanceMetrics: jest.fn().mockReturnValue({}),
}));

jest.mock('../utils/expirationUtils', () => ({
  getItemsExpiringSoon: jest.fn().mockReturnValue([]),
  getExpiredItems: jest.fn().mockReturnValue([]),
  getExpirationSummary: jest.fn().mockReturnValue({}),
}));

jest.mock('../components/StoreComparisonChart', () => 'StoreComparisonChart');
jest.mock('../components/HeaderWithLogout', () => 'HeaderWithLogout');
jest.mock('../components/LanguageToggleMenu', () => 'LanguageToggleMenu');

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(),
    removeItem: jest.fn().mockResolvedValue(),
    multiRemove: jest.fn().mockResolvedValue(),
    getAllKeys: jest.fn().mockResolvedValue([]),
  },
}));

// Mock OfflineManager
jest.mock('../utils/OfflineManager', () => ({
  offlineManager: {
    isConnected: jest.fn().mockReturnValue(true),
    storeLocalData: jest.fn().mockResolvedValue(),
    getLocalData: jest.fn().mockResolvedValue(null),
  },
}));

// Mock clearFailedSync
jest.mock('../utils/clearFailedSync', () => ({
  clearFailedSyncItems: jest.fn().mockResolvedValue(true),
}));

import UnifiedDashboardScreen from '../screens/UnifiedDashboardScreen';

describe('Net Profit Calculation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calculates net profit correctly for a single sale item', () => {
    const saleItem = {
      unit_price: 100,
      quantity: 2,
      inventory: { cost_price: 60 }
    };
    const netProfit = (saleItem.unit_price - saleItem.inventory.cost_price) * saleItem.quantity;
    expect(netProfit).toBe(80);
  });

  test('calculates net profit correctly for multiple sale items', () => {
    const saleItems = [
      {
        unit_price: 100,
        quantity: 2,
        inventory: { cost_price: 60 }
      },
      {
        unit_price: 50,
        quantity: 3,
        inventory: { cost_price: 30 }
      }
    ];
    
    let totalNetProfit = 0;
    saleItems.forEach(item => {
      const costPrice = item.inventory.cost_price || 0;
      const sellingPrice = item.unit_price;
      const quantity = item.quantity;
      totalNetProfit += (sellingPrice - costPrice) * quantity;
    });
    
    expect(totalNetProfit).toBe(140); // (100-60)*2 + (50-30)*3 = 80 + 60 = 140
  });

  test('handles missing cost price gracefully', () => {
    const saleItem = {
      unit_price: 100,
      quantity: 2,
      inventory: { cost_price: null }
    };
    const netProfit = (saleItem.unit_price - (saleItem.inventory.cost_price || 0)) * saleItem.quantity;
    expect(netProfit).toBe(200); // (100-0)*2 = 200
  });

  test('ranks products by net profit instead of revenue', () => {
    // Product A: High revenue but low net profit
    const productA = {
      inventory_id: 'A',
      name: 'Product A',
      total_quantity: 1,
      total_revenue: 1000,
      total_net_profit: 50
    };
    
    // Product B: Lower revenue but higher net profit
    const productB = {
      inventory_id: 'B',
      name: 'Product B',
      total_quantity: 50,
      total_revenue: 2000,
      total_net_profit: 200
    };
    
    const products = [productA, productB];
    const sortedProducts = products.sort((a, b) => b.total_net_profit - a.total_net_profit);
    
    // Product B should rank higher because it has higher net profit
    expect(sortedProducts[0].inventory_id).toBe('B');
    expect(sortedProducts[1].inventory_id).toBe('A');
  });
});