import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { supabase } from '../utils/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useStore } from '../contexts/StoreContext';
// AsyncStorage removed - using centralized storage
import { getCurrentUser, clearCachedAuth } from '../utils/authUtils';
// Removed useAuth import - using direct Supabase auth
import { getTranslation } from '../utils/translations';
import { 
  TIME_FILTERS, 
  getDateRange, 
  getDateRangeDescription,
  getTimeFilterOptions,
  getTimeFilterLabels,
  formatCurrency,
  formatNumber
} from '../utils/timeFilters';
import { getStoreComparisonData, calculatePerformanceMetrics } from '../utils/chartDataUtils';
import { getItemsExpiringSoon, getExpiredItems, getExpirationSummary } from '../utils/expirationUtils';
import StoreComparisonChart from '../components/StoreComparisonChart';
import HeaderWithLogout from '../components/HeaderWithLogout';
import LanguageToggleMenu from '../components/LanguageToggleMenu';
import { clearFailedSyncItems } from '../utils/clearFailedSync';
import { offlineManager } from '../utils/OfflineManager';

const { width } = Dimensions.get('window');

export default function UnifiedDashboardScreen({ navigation }) {
  const { language } = useLanguage();
  const { selectedStore, userRole, selectStore, stores } = useStore();

  // Helper function for time filter icons
  const getTimeFilterIcon = (filter) => {
    switch (filter) {
      case TIME_FILTERS.TODAY:
        return 'today';
      case TIME_FILTERS.WEEK:
        return 'date-range';
      case TIME_FILTERS.MONTH:
        return 'calendar-month';
      case TIME_FILTERS.ALL_TIME:
        return 'all-inclusive';
      default:
        return 'schedule';
    }
  };
  // Logout function - implemented directly
  const handleLogout = async () => {
    try {
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
      }
      
      // Clear cached authentication data using centralized storage
      await clearCachedAuth();
      
      console.log('Logout completed');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };
  const [financialSummary, setFinancialSummary] = useState({});
  const [topProducts, setTopProducts] = useState([]);
  const [bestCustomers, setBestCustomers] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showAllStores, setShowAllStores] = useState(false);
  const [timeFilter, setTimeFilter] = useState(TIME_FILTERS.ALL_TIME);
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [storeComparisonData, setStoreComparisonData] = useState([]);
  const [chartMetric, setChartMetric] = useState('revenue');
  const [showCharts, setShowCharts] = useState(false);
  const [expiringItems, setExpiringItems] = useState([]);
  const [expiredItems, setExpiredItems] = useState([]);

  // Load cached dashboard data for offline mode
  const loadCachedDashboardData = async (userId) => {
    try {
      console.log('📱 Loading cached dashboard data...');
      
      // Load basic financial summary from cache
      const cachedSummary = await AsyncStorage.getItem(`financial_summary_${userId}`);
      if (cachedSummary) {
        setFinancialSummary(JSON.parse(cachedSummary));
        console.log('✅ Loaded cached financial summary');
      }
      
      // Load store comparison data from cache
      const cachedStoreData = await AsyncStorage.getItem(`store_comparison_${userId}`);
      if (cachedStoreData) {
        setStoreComparisonData(JSON.parse(cachedStoreData));
        console.log('✅ Loaded cached store comparison data');
      }
      
      // Load expiration alerts from cache
      const cachedExpiring = await AsyncStorage.getItem(`expiring_items_${userId}`);
      const cachedExpired = await AsyncStorage.getItem(`expired_items_${userId}`);
      
      if (cachedExpiring) {
        setExpiringItems(JSON.parse(cachedExpiring));
        console.log('✅ Loaded cached expiring items');
      }
      
      if (cachedExpired) {
        setExpiredItems(JSON.parse(cachedExpired));
        console.log('✅ Loaded cached expired items');
      }
      
    } catch (error) {
      console.error('Error loading cached dashboard data:', error);
    }
  };

  // Clear failed sync items function

  // Logout function is now handled by AuthContext

  useEffect(() => {
    loadDashboardData();
  }, [selectedStore, userRole, timeFilter]);

  useEffect(() => {
    if (userRole === 'owner') {
      const loadChartData = async () => {
        const { user } = await getCurrentUser();
        if (user) {
          await loadStoreComparisonData(user.id);
        }
      };
      loadChartData();
    }
  }, [chartMetric]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const { user } = await getCurrentUser();
      if (!user) return;

      // Check if online
      if (offlineManager.isConnected()) {
        console.log('🌐 Online - loading dashboard data from database');
        
        // Load data based on user role and selected store from context
        if (userRole === 'individual') {
          await loadIndividualData(user.id);
        } else if (selectedStore) {
          await loadStoreData(selectedStore.id);
        }

        // Load store comparison data for owners
        if (userRole === 'owner') {
          await loadStoreComparisonData(user.id);
        }

        // Load expiration alerts for all users
        await loadExpirationAlerts();
      } else {
        console.log('📱 Offline - loading dashboard data from cache');
        
        // Load cached data for offline mode
        await loadCachedDashboardData(user.id);
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStoreData = async (storeId) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Get date range for current time filter
      const { startDate, endDate } = getDateRange(timeFilter);
      
      // Build queries with time filtering
      let salesQuery = supabase.from('sales').select('*, sale_items(*, inventory:inventory_id(*))').eq('store_id', storeId);
      let expensesQuery = supabase.from('expenses').select('amount, expense_date').eq('store_id', storeId);
      
      // Apply date filtering if not "all time"
      if (startDate && endDate) {
        salesQuery = salesQuery.gte('created_at', startDate).lte('created_at', endDate);
        expensesQuery = expensesQuery.gte('expense_date', startDate).lte('expense_date', endDate);
      }
      
      // Load store-specific data
      const [salesData, expensesData, inventoryData] = await Promise.all([
        salesQuery,
        expensesQuery,
        supabase.from('inventory').select('name, quantity, cost_price').eq('store_id', storeId)
      ]);

      // Log any errors for debugging
      if (salesData.error) {
        console.error('Error loading sales data:', salesData.error);
      }
      if (expensesData.error) {
        console.error('Error loading expenses data:', expensesData.error);
      }
      if (inventoryData.error) {
        console.error('Error loading inventory data:', inventoryData.error);
      }

      // Calculate net profit from sales data
      let totalNetProfit = 0;
      if (salesData.data) {
        salesData.data.forEach(sale => {
          if (sale.sale_items) {
            sale.sale_items.forEach(item => {
              if (item.unit_price && item.quantity) {
                // Handle cases where inventory data might be missing
                const costPrice = (item.inventory && item.inventory.cost_price) || 0;
                const sellingPrice = item.unit_price;
                const quantity = item.quantity;
                totalNetProfit += (sellingPrice - costPrice) * quantity;
              }
            });
          }
        });
      }

      const totalRevenue = salesData.data?.reduce((sum, sale) => sum + (sale.total_amount || 0), 0) || 0;
      const totalExpenses = expensesData.data?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
      const inventoryValue = inventoryData.data?.reduce((sum, item) => sum + (item.quantity * (item.cost_price || 0)), 0) || 0;

      setFinancialSummary({
        totalRevenue,
        totalExpenses,
        profitLoss: totalRevenue - totalExpenses,
        netProfit: totalNetProfit,
        inventoryValue,
        inventoryCount: inventoryData.data?.length || 0,
        timeFilter: getDateRangeDescription(timeFilter)
      });

      // Extract top products from sales data instead of making a separate query
      extractTopProductsFromSalesData(salesData.data);

      // Load additional data with time filtering (excluding top products since we already have them)
      await loadAdditionalData(storeId, false, false, startDate, endDate, false); // Pass false to indicate we don't need top products
    } catch (error) {
      console.error('Error loading store data:', error);
    }
};

const loadIndividualData = async (userId) => {
  try {
    // Get date range for current time filter
    const { startDate, endDate } = getDateRange(timeFilter);
    
    // Build queries with time filtering
    let salesQuery = supabase.from('sales').select('*, sale_items(*, inventory:inventory_id(*))').eq('user_id', userId);
    let expensesQuery = supabase.from('expenses').select('amount, expense_date').eq('user_id', userId);
    
    // Apply date filtering if not "all time"
    if (startDate && endDate) {
      salesQuery = salesQuery.gte('created_at', startDate).lte('created_at', endDate);
      expensesQuery = expensesQuery.gte('expense_date', startDate).lte('expense_date', endDate);
    }
    
    // Load individual user data
    const [salesData, expensesData, inventoryData] = await Promise.all([
      salesQuery,
      expensesQuery,
      supabase.from('inventory').select('name, quantity, cost_price').eq('user_id', userId)
    ]);

    // Log any errors for debugging
    if (salesData.error) {
      console.error('Error loading sales data:', salesData.error);
    }
    if (expensesData.error) {
      console.error('Error loading expenses data:', expensesData.error);
    }
    if (inventoryData.error) {
      console.error('Error loading inventory data:', inventoryData.error);
    }

    // Calculate net profit from sales data
    let totalNetProfit = 0;
    if (salesData.data) {
      salesData.data.forEach(sale => {
        if (sale.sale_items) {
          sale.sale_items.forEach(item => {
            if (item.unit_price && item.quantity) {
              // Handle cases where inventory data might be missing
              const costPrice = (item.inventory && item.inventory.cost_price) || 0;
              const sellingPrice = item.unit_price;
              const quantity = item.quantity;
              totalNetProfit += (sellingPrice - costPrice) * quantity;
            }
          });
        }
      });
    }

    const totalRevenue = salesData.data?.reduce((sum, sale) => sum + (sale.total_amount || 0), 0) || 0;
    const totalExpenses = expensesData.data?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
    const inventoryValue = inventoryData.data?.reduce((sum, item) => sum + (item.quantity * (item.cost_price || 0)), 0) || 0;

    setFinancialSummary({
      totalRevenue,
      totalExpenses,
      profitLoss: totalRevenue - totalExpenses,
      netProfit: totalNetProfit,
      inventoryValue,
      inventoryCount: inventoryData.data?.length || 0,
      timeFilter: getDateRangeDescription(timeFilter)
    });

    // Extract top products from sales data instead of making a separate query
    extractTopProductsFromSalesData(salesData.data);

    // Load additional data with time filtering (excluding top products since we already have them)
    await loadAdditionalData(userId, true, false, startDate, endDate, false); // Pass false to indicate we don't need top products
  } catch (error) {
    console.error('Error loading individual data:', error);
  }
};

// New function to extract top products from existing sales data
const extractTopProductsFromSalesData = (salesData) => {
  try {
    if (!salesData || salesData.length === 0) {
      setTopProducts([]);
      return;
    }

    const productMap = new Map();
    salesData.forEach(sale => {
      if (sale.sale_items) {
        sale.sale_items.forEach(item => {
          const key = item.inventory_id;
          // Handle cases where inventory data might be missing
          const itemName = (item.inventory && item.inventory.name) || 'Unknown Product';
          const costPrice = (item.inventory && item.inventory.cost_price) || 0;
          const sellingPrice = item.unit_price || 0;
          const quantity = item.quantity || 0;
          const netProfit = (sellingPrice - costPrice) * quantity;
          const revenue = sellingPrice * quantity;
          
          if (productMap.has(key)) {
            const existing = productMap.get(key);
            existing.total_quantity += quantity;
            existing.total_revenue += revenue;
            existing.total_net_profit += netProfit;
          } else {
            productMap.set(key, {
              inventory_id: item.inventory_id,
              name: itemName,
              total_quantity: quantity,
              total_revenue: revenue,
              total_net_profit: netProfit
            });
          }
        });
      }
    });

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.total_net_profit - a.total_net_profit) // Sort by net profit instead of quantity
      .slice(0, 5);
    
    setTopProducts(topProducts);
    console.log('Top products extracted from sales data:', topProducts);
  } catch (error) {
    console.error('Error extracting top products from sales data:', error);
    setTopProducts([]);
  }
};

const loadStoreComparisonData = async (userId) => {
  try {
    // Check if online
    if (!offlineManager.isConnected()) {
      console.log('📱 Offline - skipping store comparison data');
      setStoreComparisonData([]);
      return;
    }

    console.log('🌐 Online - loading store comparison data');
    // Get stores, sales, and expenses data
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', userId);
      
    if (storesError) {
      console.error('Error loading stores:', storesError);
      setStoreComparisonData([]);
      return;
    }

    const storeIds = stores?.map(s => s.id) || [];
    
    const [salesResult, expensesResult] = await Promise.all([
      supabase.from('sales').select('*').in('store_id', storeIds),
      supabase.from('expenses').select('*').in('store_id', storeIds)
    ]);
      
    if (salesResult.error) {
      console.error('Error loading sales:', salesResult.error);
      setStoreComparisonData([]);
      return;
    }

    if (expensesResult.error) {
      console.error('Error loading expenses:', expensesResult.error);
      setStoreComparisonData([]);
      return;
    }

    const data = getStoreComparisonData(
      stores || [], 
      salesResult.data || [], 
      expensesResult.data || [], 
      timeFilter
    );
    setStoreComparisonData(data);
  } catch (error) {
    console.error('Error loading store comparison data:', error);
    setStoreComparisonData([]);
  }
};

const loadExpirationAlerts = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let inventoryQuery = supabase
      .from('inventory')
      .select('id, name, expiration_date, quantity')
      .not('expiration_date', 'is', null);

    // Apply store filtering based on user role
    if (userRole === 'individual') {
      inventoryQuery = inventoryQuery.eq('user_id', user.id);
    } else if (selectedStore) {
      inventoryQuery = inventoryQuery.eq('store_id', selectedStore.id);
    }

    const { data: inventoryData, error } = await inventoryQuery;
    if (error) throw error;

    const expiring = getItemsExpiringSoon(inventoryData || [], 7);
    const expired = getExpiredItems(inventoryData || []);

    setExpiringItems(expiring);
    setExpiredItems(expired);
  } catch (error) {
    console.error('Error loading expiration alerts:', error);
    setExpiringItems([]);
    setExpiredItems([]);
  }
};

// Modified loadAdditionalData to optionally skip top products
const loadAdditionalData = async (storeIdOrUserId, isIndividual = false, isAllStores = false, startDate = null, endDate = null, includeTopProducts = true) => {
  try {
    let bestCustomersQuery, lowStockQuery, recentSalesQuery, recentExpensesQuery;

    if (isAllStores) {
      // For all stores mode, get all store IDs first
      const { data: userStores } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', storeIdOrUserId);
    
      const storeIds = userStores?.map(store => store.id) || [];
    
      if (storeIds.length === 0) {
        setBestCustomers([]);
        setLowStockItems([]);
        setRecentActivity([]);
        return;
      }

      // Load best customers for all stores
      bestCustomersQuery = supabase
        .from('sales')
        .select(`
          customer_name,
          customer_email,
          total_amount
        `)
        .in('store_id', storeIds)
        .not('customer_name', 'is', null)
        .limit(50);

      // Load low stock items for all stores
      lowStockQuery = supabase
        .from('inventory')
        .select('name, quantity')
        .in('store_id', storeIds)
        .lt('quantity', 10);

      // Load recent activity for all stores
      recentSalesQuery = supabase
        .from('sales')
        .select('id, sale_number, total_amount, created_at')
        .in('store_id', storeIds)
        .order('created_at', { ascending: false })
        .limit(5);

      recentExpensesQuery = supabase
        .from('expenses')
        .select('id, title, amount, created_at')
        .in('store_id', storeIds)
        .order('created_at', { ascending: false })
        .limit(5);

      // Apply time filtering to recent activity queries
      if (startDate && endDate) {
        recentSalesQuery = recentSalesQuery.gte('created_at', startDate).lte('created_at', endDate);
        recentExpensesQuery = recentExpensesQuery.gte('created_at', startDate).lte('created_at', endDate);
      }

    } else {
      // Load best customers for single store
      bestCustomersQuery = supabase
        .from('sales')
        .select(`
          customer_name,
          customer_email,
          total_amount
        `)
        .eq(isIndividual ? 'user_id' : 'store_id', storeIdOrUserId)
        .not('customer_name', 'is', null)
        .limit(50);

      // Load low stock items for single store
      lowStockQuery = supabase
        .from('inventory')
        .select('name, quantity')
        .eq(isIndividual ? 'user_id' : 'store_id', storeIdOrUserId)
        .lt('quantity', 10);

      // Load recent activity for single store
      recentSalesQuery = supabase
        .from('sales')
        .select('id, sale_number, total_amount, created_at')
        .eq(isIndividual ? 'user_id' : 'store_id', storeIdOrUserId)
        .order('created_at', { ascending: false })
        .limit(5);

      recentExpensesQuery = supabase
        .from('expenses')
        .select('id, title, amount, created_at')
        .eq(isIndividual ? 'user_id' : 'store_id', storeIdOrUserId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Apply time filtering to recent activity queries
      if (startDate && endDate) {
        recentSalesQuery = recentSalesQuery.gte('created_at', startDate).lte('created_at', endDate);
        recentExpensesQuery = recentExpensesQuery.gte('created_at', startDate).lte('created_at', endDate);
      }
    }

    // Execute queries
    const [bestCustomersResult, lowStockResult, recentSalesResult, recentExpensesResult] = await Promise.all([
      bestCustomersQuery,
      lowStockQuery,
      recentSalesQuery,
      recentExpensesQuery
    ]);

    // Process best customers data
    const bestCustomersData = bestCustomersResult?.data;
    if (bestCustomersData) {
      const customerMap = new Map();
      bestCustomersData.forEach(sale => {
        const key = sale.customer_email || sale.customer_name;
        if (customerMap.has(key)) {
          const existing = customerMap.get(key);
          existing.total_spent += sale.total_amount;
          existing.total_orders += 1;
        } else {
          customerMap.set(key, {
            customer_name: sale.customer_name,
            customer_email: sale.customer_email,
            total_spent: sale.total_amount,
            total_orders: 1
          });
        }
      });
      const bestCustomers = Array.from(customerMap.values())
        .sort((a, b) => b.total_spent - a.total_spent)
        .slice(0, 5);
      setBestCustomers(bestCustomers);
    } else {
      setBestCustomers([]);
    }

    // Process low stock items
    const inventoryData = lowStockResult?.data;
    setLowStockItems(inventoryData || []);

    // Process recent activity
    const recentSales = recentSalesResult?.data || [];
    const recentExpenses = recentExpensesResult?.data || [];

    const activity = [
      ...recentSales.map(s => ({
        id: `sale-${s.id}`,
        type: 'sale',
        description: s.sale_number,
        amount: s.total_amount,
        createdAt: s.created_at
      })),
      ...recentExpenses.map(e => ({
        id: `expense-${e.id}`,
        type: 'expense',
        description: e.title,
        amount: e.amount,
        createdAt: e.created_at
      }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    setRecentActivity(activity.slice(0, 5));

  } catch (error) {
    console.error('Error loading additional data:', error);
  }
};

  const handleStoreSelect = async (store) => {
    selectStore(store);
    setShowAllStores(false);
  };

  const handleShowAllStores = async () => {
    setShowAllStores(true);
    selectStore(null);
    
    // Load aggregated data for all stores
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // Get all stores owned by the user
      const { data: userStores } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', user.id);

      if (!userStores || userStores.length === 0) {
        setFinancialSummary({
          totalRevenue: 0,
          totalExpenses: 0,
          profitLoss: 0,
          netProfit: 0,
          inventoryValue: 0,
          inventoryCount: 0
        });
        return;
      }

      const storeIds = userStores.map(store => store.id);

      // Load aggregated data from all stores
      const [salesData, expensesData, inventoryData] = await Promise.all([
        supabase.from('sales').select('*, sale_items(*, inventory:inventory_id(*))').in('store_id', storeIds),
        supabase.from('expenses').select('amount').in('store_id', storeIds),
        supabase.from('inventory').select('name, quantity, cost_price').in('store_id', storeIds)
      ]);

      // Log any errors for debugging
      if (salesData.error) {
        console.error('Error loading sales data for all stores:', salesData.error);
      }
      if (expensesData.error) {
        console.error('Error loading expenses data for all stores:', expensesData.error);
      }
      if (inventoryData.error) {
        console.error('Error loading inventory data for all stores:', inventoryData.error);
      }

      // Calculate net profit from sales data
      let totalNetProfit = 0;
      if (salesData.data) {
        salesData.data.forEach(sale => {
          if (sale.sale_items) {
            sale.sale_items.forEach(item => {
              if (item.unit_price && item.quantity) {
                // Handle cases where inventory data might be missing
                const costPrice = (item.inventory && item.inventory.cost_price) || 0;
                const sellingPrice = item.unit_price;
                const quantity = item.quantity;
                totalNetProfit += (sellingPrice - costPrice) * quantity;
              }
            });
          }
        });
      }

      const totalRevenue = salesData.data?.reduce((sum, sale) => sum + (sale.total_amount || 0), 0) || 0;
      const totalExpenses = expensesData.data?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
      const inventoryValue = inventoryData.data?.reduce((sum, item) => sum + (item.quantity * (item.cost_price || 0)), 0) || 0;

      setFinancialSummary({
        totalRevenue,
        totalExpenses,
        profitLoss: totalRevenue - totalExpenses,
        netProfit: totalNetProfit,
        inventoryValue,
        inventoryCount: inventoryData.data?.length || 0
      });

      // Load additional aggregated data (excluding top products since we already have them)
      await loadAdditionalData(user.id, false, true, null, null, false); // Pass false to indicate we don't need top products

    } catch (error) {
      console.error('Error loading all stores data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const formatCurrency = (amount) => {
    const value = amount || 0;
    
    // For very large numbers, use abbreviated format
    if (Math.abs(value) >= 1000000) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);
    }
    
    // For smaller numbers, use standard format
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const renderStoreSelector = () => {
    if (userRole !== 'owner' || stores.length <= 1) return null;

    return (
      <View style={styles.storeSelector}>
        <Text style={styles.sectionTitle}>{getTranslation('selectStore', language)}</Text>
        
        <TouchableOpacity
          style={[styles.storeOption, showAllStores && styles.storeOptionSelected]}
          onPress={handleShowAllStores}
        >
          <MaterialIcons name="dashboard" size={24} color={showAllStores ? '#2563eb' : '#6b7280'} />
          <Text style={[styles.storeOptionText, showAllStores && styles.storeOptionTextSelected]}>
            {getTranslation('allStores', language)}
          </Text>
        </TouchableOpacity>

        {stores.map((store) => (
          <TouchableOpacity
            key={store.id}
            style={[
              styles.storeOption,
              selectedStore?.id === store.id && !showAllStores && styles.storeOptionSelected
            ]}
            onPress={() => handleStoreSelect(store)}
          >
            <MaterialIcons 
              name="store" 
              size={24} 
              color={selectedStore?.id === store.id && !showAllStores ? '#2563eb' : '#6b7280'} 
            />
            <Text style={[
              styles.storeOptionText,
              selectedStore?.id === store.id && !showAllStores && styles.storeOptionTextSelected
            ]}>
              {store.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderFinancialCards = () => (
    <View style={styles.cardsContainer}>
      <View style={styles.card}>
        <MaterialIcons name="trending-up" size={32} color="#10b981" />
        <Text style={styles.cardValue}>{formatCurrency(financialSummary.totalRevenue)}</Text>
        <Text style={styles.cardLabel}>{getTranslation('totalRevenue', language)}</Text>
      </View>
      
      <View style={styles.card}>
        <MaterialIcons name="trending-down" size={32} color="#ef4444" />
        <Text style={styles.cardValue}>{formatCurrency(financialSummary.totalExpenses)}</Text>
        <Text style={styles.cardLabel}>{getTranslation('totalExpenses', language)}</Text>
      </View>
      
      <View style={styles.card}>
        <MaterialIcons name="account-balance-wallet" size={32} color="#2563eb" />
        <Text style={[styles.cardValue, { color: (financialSummary.profitLoss || 0) >= 0 ? '#10b981' : '#ef4444' }]}>
          {formatCurrency(financialSummary.profitLoss)}
        </Text>
        <Text style={styles.cardLabel}>{getTranslation('netProfit', language)}</Text>
      </View>
      
      <View style={styles.card}>
        <MaterialIcons name="show-chart" size={32} color="#8b5cf6" />
        <Text style={[styles.cardValue, { color: (financialSummary.netProfit || 0) >= 0 ? '#10b981' : '#ef4444' }]}>
          {formatCurrency(financialSummary.netProfit)}
        </Text>
        <Text style={styles.cardLabel}>{getTranslation('profit', language)}</Text>
      </View>
      
      <View style={styles.card}>
        <MaterialIcons name="inventory" size={32} color="#f59e0b" />
        <Text style={styles.cardValue}>{formatCurrency(financialSummary.inventoryValue)}</Text>
        <Text style={styles.cardLabel}>{getTranslation('inventoryValue', language)}</Text>
      </View>
    </View>
  );

  const renderTopProducts = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{getTranslation('topProducts', language)}</Text>
      {topProducts.length === 0 ? (
        <Text style={styles.noDataText}>{getTranslation('noDataAvailable', language)}</Text>
      ) : (
        topProducts.map((product, index) => (
          <View key={product.inventory_id || index} style={styles.listItem}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankNumber}>{index + 1}</Text>
            </View>
            <View style={styles.listContent}>
              <Text style={styles.listTitle}>{product.name || getTranslation('unknownProduct', language)}</Text>
              <Text style={styles.listSubtitle}>
                {product.total_quantity} {getTranslation('units', language)} • {formatCurrency(product.total_revenue)}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderBestCustomers = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{getTranslation('bestCustomers', language)}</Text>
      {bestCustomers.length === 0 ? (
        <Text style={styles.noDataText}>{getTranslation('noDataAvailable', language)}</Text>
      ) : (
        bestCustomers.map((customer, index) => (
          <View key={customer.customer_email || index} style={styles.listItem}>
            <View style={[styles.rankBadge, { backgroundColor: '#10b981' }]}>
              <Text style={styles.rankNumber}>{index + 1}</Text>
            </View>
            <View style={styles.listContent}>
              <Text style={styles.listTitle}>{customer.customer_name || getTranslation('unknownCustomer', language)}</Text>
              <Text style={styles.listSubtitle}>
                {customer.total_orders} {getTranslation('orders', language)} • {formatCurrency(customer.total_spent)}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderLowStockAlerts = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{getTranslation('lowStockItems', language)}</Text>
      {lowStockItems.length === 0 ? (
        <Text style={styles.noDataText}>{getTranslation('allItemsWellStocked', language)}</Text>
      ) : (
        lowStockItems.slice(0, 3).map((item, index) => (
          <View key={index} style={styles.listItem}>
            <View style={styles.stockIndicator}>
              <View style={[styles.stockDot, { backgroundColor: '#ef4444' }]} />
            </View>
            <View style={styles.listContent}>
              <Text style={styles.listTitle}>{item.name}</Text>
              <Text style={styles.listSubtitle}>{getTranslation('quantity', language)}: {item.quantity} {getTranslation('units', language)}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderStoreComparisonCharts = () => {
    if (userRole !== 'owner' || storeComparisonData.length === 0) {
      return null;
    }

    return (
      <View style={styles.section}>
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>{getTranslation('storeComparison', language)}</Text>
          <View style={styles.chartControls}>
            <TouchableOpacity
              style={[styles.metricButton, chartMetric === 'revenue' && styles.metricButtonActive]}
              onPress={() => setChartMetric('revenue')}
            >
              <Text style={[styles.metricButtonText, chartMetric === 'revenue' && styles.metricButtonTextActive]}>
                {getTranslation('revenue', language)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.metricButton, chartMetric === 'profit' && styles.metricButtonActive]}
              onPress={() => setChartMetric('profit')}
            >
              <Text style={[styles.metricButtonText, chartMetric === 'profit' && styles.metricButtonTextActive]}>
                {getTranslation('profit', language)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.metricButton, chartMetric === 'expenses' && styles.metricButtonActive]}
              onPress={() => setChartMetric('expenses')}
            >
              <Text style={[styles.metricButtonText, chartMetric === 'expenses' && styles.metricButtonTextActive]}>
                {getTranslation('expenses', language)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.metricButton, chartMetric === 'profitMargin' && styles.metricButtonActive]}
              onPress={() => setChartMetric('profitMargin')}
            >
              <Text style={[styles.metricButtonText, chartMetric === 'profitMargin' && styles.metricButtonTextActive]}>
                {getTranslation('marginPercentage', language)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <StoreComparisonChart
          data={storeComparisonData}
          metric={chartMetric}
          chartType="bar"
          onMetricChange={setChartMetric}
        />
      </View>
    );
  };

  const renderChartToggle = () => {
    if (userRole !== 'owner') {
      return null;
    }

    return (
      <View style={styles.chartToggleContainer}>
        <TouchableOpacity
          style={[styles.chartToggleButton, showCharts && styles.chartToggleButtonActive]}
          onPress={() => setShowCharts(!showCharts)}
        >
          <MaterialIcons 
            name={showCharts ? "bar-chart" : "bar-chart"} 
            size={20} 
            color={showCharts ? "#ffffff" : "#2563eb"} 
          />
          <Text style={[styles.chartToggleText, showCharts && styles.chartToggleTextActive]}>
            {showCharts ? getTranslation('hideCharts', language) : getTranslation('showCharts', language)}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderExpirationAlerts = () => {
    const totalAlerts = expiringItems.length + expiredItems.length;
    
    if (totalAlerts === 0) {
      return null;
    }

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="warning" size={24} color="#f59e0b" />
          <Text style={styles.sectionTitle}>{getTranslation('expirationAlerts', language)}</Text>
          <View style={styles.alertBadge}>
            <Text style={styles.alertBadgeText}>{totalAlerts}</Text>
          </View>
        </View>

        {expiredItems.length > 0 && (
          <View style={styles.alertGroup}>
            <Text style={styles.alertGroupTitle}>{getTranslation('expiredItems', language)} ({expiredItems.length})</Text>
            {expiredItems.slice(0, 3).map((item, index) => (
              <View key={index} style={styles.alertItem}>
                <View style={[styles.alertDot, { backgroundColor: '#ef4444' }]} />
                <View style={styles.alertContent}>
                  <Text style={styles.alertItemName}>{item.name}</Text>
                  <Text style={styles.alertItemDetails}>
                    {getTranslation('stock', language)}: {item.quantity} • {getTranslation('expired', language)}
                  </Text>
                </View>
              </View>
            ))}
            {expiredItems.length > 3 && (
              <Text style={styles.alertMoreText}>
                +{expiredItems.length - 3} {getTranslation('moreExpiredItems', language)}
              </Text>
            )}
          </View>
        )}

        {expiringItems.length > 0 && (
          <View style={styles.alertGroup}>
            <Text style={styles.alertGroupTitle}>{getTranslation('expiringSoon', language)} ({expiringItems.length})</Text>
            {expiringItems.slice(0, 3).map((item, index) => (
              <View key={index} style={styles.alertItem}>
                <View style={[styles.alertDot, { backgroundColor: '#f59e0b' }]} />
                <View style={styles.alertContent}>
                  <Text style={styles.alertItemName}>{item.name}</Text>
                  <Text style={styles.alertItemDetails}>
                    {getTranslation('stock', language)}: {item.quantity} • {getTranslation('expiresIn', language)} {Math.ceil((new Date(item.expiration_date) - new Date()) / (1000 * 60 * 60 * 24))} {getTranslation('days', language)}
                  </Text>
                </View>
              </View>
            ))}
            {expiringItems.length > 3 && (
              <Text style={styles.alertMoreText}>
                +{expiringItems.length - 3} {getTranslation('moreExpiringItems', language)}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>{getTranslation('loadingDashboard', language)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderWithLogout
        title={getTranslation('dashboard', language)}
        onLogout={handleLogout}
        userRole={userRole}
        currentStore={selectedStore}
        onLanguageToggle={() => setShowLanguageMenu(true)}
      />
      
      {/* Enhanced Time Filter Section */}
      <View style={styles.timeFilterContainer}>
        <View style={styles.timeFilterHeader}>
          <View style={styles.timeFilterTitleContainer}>
            <MaterialIcons name="schedule" size={22} color="#2563eb" />
            <Text style={styles.timeFilterTitle}>{getTranslation('timePeriod', language)}</Text>
          </View>
          <TouchableOpacity 
            style={[styles.timeFilterButton, showTimeFilter && styles.timeFilterButtonActive]}
            onPress={() => setShowTimeFilter(!showTimeFilter)}
          >
            <Text style={[styles.timeFilterText, showTimeFilter && styles.timeFilterTextActive]}>
              {getTimeFilterLabels(language)[timeFilter]}
            </Text>
            <MaterialIcons 
              name={showTimeFilter ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
              size={22} 
              color={showTimeFilter ? "#2563eb" : "#6b7280"} 
            />
          </TouchableOpacity>
        </View>
        
        {showTimeFilter && (
          <View style={styles.timeFilterDropdown}>
            <View style={styles.timeFilterOptions}>
              {getTimeFilterOptions(language).map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.timeFilterOption,
                    timeFilter === option.value && styles.timeFilterOptionActive
                  ]}
                  onPress={() => {
                    setTimeFilter(option.value);
                    setShowTimeFilter(false);
                  }}
                >
                  <View style={styles.timeFilterOptionContent}>
                    <MaterialIcons 
                      name={getTimeFilterIcon(option.value)} 
                      size={20} 
                      color={timeFilter === option.value ? "#2563eb" : "#6b7280"} 
                    />
                    <Text style={[
                      styles.timeFilterOptionText,
                      timeFilter === option.value && styles.timeFilterOptionTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </View>
                  {timeFilter === option.value && (
                    <MaterialIcons name="check" size={20} color="#2563eb" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.timeFilterDescription}>
              <Text style={styles.timeFilterDescriptionText}>
                {getDateRangeDescription(timeFilter, language)}
              </Text>
            </View>
          </View>
        )}
      </View>
      
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.content}>
          <Text style={styles.subtitle}>
            {showAllStores ? getTranslation('allStoresOverview', language) : selectedStore?.name || getTranslation('businessOverview', language)}
          </Text>
          {financialSummary.timeFilter && (
            <Text style={styles.timeFilterDescription}>
              {getDateRangeDescription(timeFilter, language)}
            </Text>
          )}
          
          {/* Debug Section - Remove in production */}

        </View>

        {renderStoreSelector()}
        {renderChartToggle()}
        {renderFinancialCards()}
        {showCharts && renderStoreComparisonCharts()}
        {renderExpirationAlerts()}
        {renderTopProducts()}
        {renderBestCustomers()}
        {renderLowStockAlerts()}
      </ScrollView>
        
      <LanguageToggleMenu
        visible={showLanguageMenu}
        onClose={() => setShowLanguageMenu(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 24,
    letterSpacing: 0.3,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  storeSelector: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 20,
    letterSpacing: 0.2,
  },
  storeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    transition: 'all 0.2s ease',
  },
  storeOptionSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  storeOptionText: {
    marginLeft: 16,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  storeOptionTextSelected: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  card: {
    width: '48%',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    transition: 'all 0.2s ease',
    minHeight: 120,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 12,
    marginBottom: 6,
    textAlign: 'center',
    numberOfLines: 1,
    adjustsFontSizeToFit: true,
    minimumFontScale: 0.7,
  },
  cardLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    numberOfLines: 2,
    lineHeight: 16,
  },
  section: {
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    marginBottom: 16,
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    transition: 'all 0.2s ease',
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  rankNumber: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  listContent: {
    flex: 1,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 6,
  },
  listSubtitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '400',
  },
  stockIndicator: {
    marginRight: 16,
  },
  stockDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  noDataText: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 32,
    fontStyle: 'italic',
    fontWeight: '400',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  actionButton: {
    width: '48%',
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  actionText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  timeFilterContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 20,
    paddingVertical: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  timeFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timeFilterTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeFilterTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginLeft: 10,
  },
  timeFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minWidth: 160,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    transition: 'all 0.2s ease',
  },
  timeFilterButtonActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  timeFilterText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginRight: 10,
  },
  timeFilterTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  timeFilterDropdown: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden',
  },
  timeFilterOptions: {
    paddingVertical: 8,
  },
  timeFilterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    transition: 'all 0.2s ease',
  },
  timeFilterOptionActive: {
    backgroundColor: '#eff6ff',
  },
  timeFilterOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  timeFilterOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginLeft: 14,
  },
  timeFilterOptionTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  timeFilterDescription: {
    backgroundColor: '#f8fafc',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  timeFilterDescriptionText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    fontStyle: 'italic',
    fontWeight: '400',
  },
  debugSection: {
    marginBottom: 24,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  debugButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    transition: 'all 0.2s ease',
  },
  debugButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  chartToggleContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 20,
  },
  chartToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3b82f6',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    transition: 'all 0.2s ease',
  },
  chartToggleButtonActive: {
    backgroundColor: '#3b82f6',
  },
  chartToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 10,
  },
  chartToggleTextActive: {
    color: '#ffffff',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  chartControls: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginHorizontal: 4,
    transition: 'all 0.2s ease',
  },
  metricButtonActive: {
    backgroundColor: '#3b82f6',
  },
  metricButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  metricButtonTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  alertBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 16,
  },
  alertBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  alertGroup: {
    marginBottom: 24,
  },
  alertGroupTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: '#fffbeb',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fef3c7',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  alertDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 18,
  },
  alertContent: {
    flex: 1,
  },
  alertItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  alertItemDetails: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '400',
  },
  alertMoreText: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '400',
  },
});
