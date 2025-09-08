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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from '../utils/authUtils';
// Removed useAuth import - using direct Supabase auth
import { getTranslation } from '../utils/translations';
import { 
  TIME_FILTERS, 
  TIME_FILTER_LABELS, 
  getDateRange, 
  getDateRangeDescription,
  getTimeFilterOptions,
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
      
      // Clear cached data
      await AsyncStorage.multiRemove([
        'cached_user_session',
        ...(await AsyncStorage.getAllKeys()).filter(key => key.startsWith('user_profile_'))
      ]);
      
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
  const handleClearFailedSync = async () => {
    try {
      const success = await clearFailedSyncItems();
      if (success) {
        Alert.alert('Success', 'Failed sync items cleared successfully!');
      } else {
        Alert.alert('Error', 'Failed to clear sync items');
      }
    } catch (error) {
      console.error('Error clearing sync items:', error);
      Alert.alert('Error', 'Failed to clear sync items');
    }
  };

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
      let salesQuery = supabase.from('sales').select('total_amount, created_at').eq('store_id', storeId);
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

      const totalRevenue = salesData.data?.reduce((sum, sale) => sum + (sale.total_amount || 0), 0) || 0;
      const totalExpenses = expensesData.data?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
      const inventoryValue = inventoryData.data?.reduce((sum, item) => sum + (item.quantity * item.cost_price), 0) || 0;

      setFinancialSummary({
        totalRevenue,
        totalExpenses,
        profitLoss: totalRevenue - totalExpenses,
        inventoryValue,
        inventoryCount: inventoryData.data?.length || 0,
        timeFilter: getDateRangeDescription(timeFilter)
      });

      // Load additional data with time filtering
      await loadAdditionalData(storeId, startDate, endDate);
    } catch (error) {
      console.error('Error loading store data:', error);
    }
  };

  const loadIndividualData = async (userId) => {
    try {
      // Get date range for current time filter
      const { startDate, endDate } = getDateRange(timeFilter);
      
      // Build queries with time filtering
      let salesQuery = supabase.from('sales').select('total_amount, created_at').eq('user_id', userId);
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

      const totalRevenue = salesData.data?.reduce((sum, sale) => sum + (sale.total_amount || 0), 0) || 0;
      const totalExpenses = expensesData.data?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
      const inventoryValue = inventoryData.data?.reduce((sum, item) => sum + (item.quantity * item.cost_price), 0) || 0;

      setFinancialSummary({
        totalRevenue,
        totalExpenses,
        profitLoss: totalRevenue - totalExpenses,
        inventoryValue,
        inventoryCount: inventoryData.data?.length || 0,
        timeFilter: getDateRangeDescription(timeFilter)
      });

      // Load additional data with time filtering
      await loadAdditionalData(userId, true, false, startDate, endDate);
    } catch (error) {
      console.error('Error loading individual data:', error);
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

  const loadAdditionalData = async (storeIdOrUserId, isIndividual = false, isAllStores = false, startDate = null, endDate = null) => {
    try {
      let topProductsQuery, bestCustomersQuery, lowStockQuery, recentSalesQuery, recentExpensesQuery;

      if (isAllStores) {
        // For all stores mode, get all store IDs first
        const { data: userStores } = await supabase
          .from('stores')
          .select('id')
          .eq('owner_id', storeIdOrUserId);
        
        const storeIds = userStores?.map(store => store.id) || [];
        
        if (storeIds.length === 0) {
          setTopProducts([]);
          setBestCustomers([]);
          setLowStockItems([]);
          setRecentActivity([]);
          return;
        }

        // Load top products for all stores
        topProductsQuery = supabase
          .from('sale_items')
          .select(`
            inventory_id,
            inventory:inventory_id(name),
            quantity,
            unit_price
          `)
          .in('sale.store_id', storeIds)
          .limit(50);

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
        // Original logic for single store or individual
        topProductsQuery = supabase
          .from('sale_items')
          .select(`
            inventory_id,
            inventory:inventory_id(name),
            quantity,
            unit_price
          `)
          .eq(isIndividual ? 'sale.user_id' : 'sale.store_id', storeIdOrUserId)
          .limit(50);

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
      const [topProductsResult, bestCustomersResult, lowStockResult, recentSalesResult, recentExpensesResult] = await Promise.all([
        topProductsQuery,
        bestCustomersQuery,
        lowStockQuery,
        recentSalesQuery,
        recentExpensesQuery
      ]);

      // Process top products data
      const topProductsData = topProductsResult.data;
      if (topProductsData) {
        const productMap = new Map();
        topProductsData.forEach(item => {
          const key = item.inventory_id;
          if (productMap.has(key)) {
            const existing = productMap.get(key);
            existing.total_quantity += item.quantity;
            existing.total_revenue += item.quantity * item.unit_price;
          } else {
            productMap.set(key, {
              inventory_id: item.inventory_id,
              name: item.inventory?.name || 'Unknown Product',
              total_quantity: item.quantity,
              total_revenue: item.quantity * item.unit_price
            });
          }
        });
        const topProducts = Array.from(productMap.values())
          .sort((a, b) => b.total_quantity - a.total_quantity)
          .slice(0, 5);
        setTopProducts(topProducts);
      } else {
        setTopProducts([]);
      }

      // Process best customers data
      const bestCustomersData = bestCustomersResult.data;
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
      const inventoryData = lowStockResult.data;
      setLowStockItems(inventoryData || []);

      // Process recent activity
      const recentSales = recentSalesResult.data || [];
      const recentExpenses = recentExpensesResult.data || [];

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
          inventoryValue: 0,
          inventoryCount: 0
        });
        return;
      }

      const storeIds = userStores.map(store => store.id);

      // Load aggregated data from all stores
      const [salesData, expensesData, inventoryData] = await Promise.all([
        supabase.from('sales').select('total_amount').in('store_id', storeIds),
        supabase.from('expenses').select('amount').in('store_id', storeIds),
        supabase.from('inventory').select('name, quantity, cost_price').in('store_id', storeIds)
      ]);

      const totalRevenue = salesData.data?.reduce((sum, sale) => sum + (sale.total_amount || 0), 0) || 0;
      const totalExpenses = expensesData.data?.reduce((sum, expense) => sum + (expense.amount || 0), 0) || 0;
      const inventoryValue = inventoryData.data?.reduce((sum, item) => sum + (item.quantity * item.cost_price), 0) || 0;

      setFinancialSummary({
        totalRevenue,
        totalExpenses,
        profitLoss: totalRevenue - totalExpenses,
        inventoryValue,
        inventoryCount: inventoryData.data?.length || 0
      });

      // Load additional aggregated data
      await loadAdditionalData(user.id, false, true); // Pass true for all stores mode

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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const renderStoreSelector = () => {
    if (userRole !== 'owner' || stores.length <= 1) return null;

    return (
      <View style={styles.storeSelector}>
        <Text style={styles.sectionTitle}>Store Selection</Text>
        
        <TouchableOpacity
          style={[styles.storeOption, showAllStores && styles.storeOptionSelected]}
          onPress={handleShowAllStores}
        >
          <MaterialIcons name="dashboard" size={24} color={showAllStores ? '#2563eb' : '#6b7280'} />
          <Text style={[styles.storeOptionText, showAllStores && styles.storeOptionTextSelected]}>
            All Stores
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
        <Text style={styles.cardLabel}>Revenue</Text>
      </View>
      
      <View style={styles.card}>
        <MaterialIcons name="trending-down" size={32} color="#ef4444" />
        <Text style={styles.cardValue}>{formatCurrency(financialSummary.totalExpenses)}</Text>
        <Text style={styles.cardLabel}>Expenses</Text>
      </View>
      
      <View style={styles.card}>
        <MaterialIcons name="account-balance-wallet" size={32} color="#2563eb" />
        <Text style={[styles.cardValue, { color: (financialSummary.profitLoss || 0) >= 0 ? '#10b981' : '#ef4444' }]}>
          {formatCurrency(financialSummary.profitLoss)}
        </Text>
        <Text style={styles.cardLabel}>Profit</Text>
      </View>
      
      <View style={styles.card}>
        <MaterialIcons name="inventory" size={32} color="#8b5cf6" />
        <Text style={styles.cardValue}>{formatCurrency(financialSummary.inventoryValue)}</Text>
        <Text style={styles.cardLabel}>Inventory Value</Text>
      </View>
    </View>
  );

  const renderTopProducts = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Top Products</Text>
      {topProducts.length === 0 ? (
        <Text style={styles.noDataText}>No sales data available</Text>
      ) : (
        topProducts.map((product, index) => (
          <View key={product.inventory_id || index} style={styles.listItem}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankNumber}>{index + 1}</Text>
            </View>
            <View style={styles.listContent}>
              <Text style={styles.listTitle}>{product.inventory?.name || 'Unknown Product'}</Text>
              <Text style={styles.listSubtitle}>
                {product.total_quantity} units • {formatCurrency(product.total_revenue)}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderBestCustomers = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Best Customers</Text>
      {bestCustomers.length === 0 ? (
        <Text style={styles.noDataText}>No customer data available</Text>
      ) : (
        bestCustomers.map((customer, index) => (
          <View key={customer.customer_email || index} style={styles.listItem}>
            <View style={[styles.rankBadge, { backgroundColor: '#10b981' }]}>
              <Text style={styles.rankNumber}>{index + 1}</Text>
            </View>
            <View style={styles.listContent}>
              <Text style={styles.listTitle}>{customer.customer_name || 'Unknown Customer'}</Text>
              <Text style={styles.listSubtitle}>
                {customer.total_orders} orders • {formatCurrency(customer.total_spent)}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderLowStockAlerts = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Low Stock Alerts</Text>
      {lowStockItems.length === 0 ? (
        <Text style={styles.noDataText}>All items are well stocked</Text>
      ) : (
        lowStockItems.slice(0, 3).map((item, index) => (
          <View key={index} style={styles.listItem}>
            <View style={styles.stockIndicator}>
              <View style={[styles.stockDot, { backgroundColor: '#ef4444' }]} />
            </View>
            <View style={styles.listContent}>
              <Text style={styles.listTitle}>{item.name}</Text>
              <Text style={styles.listSubtitle}>Quantity: {item.quantity} units</Text>
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
          <Text style={styles.sectionTitle}>Store Comparison</Text>
          <View style={styles.chartControls}>
            <TouchableOpacity
              style={[styles.metricButton, chartMetric === 'revenue' && styles.metricButtonActive]}
              onPress={() => setChartMetric('revenue')}
            >
              <Text style={[styles.metricButtonText, chartMetric === 'revenue' && styles.metricButtonTextActive]}>
                Revenue
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.metricButton, chartMetric === 'profit' && styles.metricButtonActive]}
              onPress={() => setChartMetric('profit')}
            >
              <Text style={[styles.metricButtonText, chartMetric === 'profit' && styles.metricButtonTextActive]}>
                Profit
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.metricButton, chartMetric === 'expenses' && styles.metricButtonActive]}
              onPress={() => setChartMetric('expenses')}
            >
              <Text style={[styles.metricButtonText, chartMetric === 'expenses' && styles.metricButtonTextActive]}>
                Expenses
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.metricButton, chartMetric === 'profitMargin' && styles.metricButtonActive]}
              onPress={() => setChartMetric('profitMargin')}
            >
              <Text style={[styles.metricButtonText, chartMetric === 'profitMargin' && styles.metricButtonTextActive]}>
                Margin %
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
            {showCharts ? 'Hide Charts' : 'Show Charts'}
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
          <Text style={styles.sectionTitle}>Expiration Alerts</Text>
          <View style={styles.alertBadge}>
            <Text style={styles.alertBadgeText}>{totalAlerts}</Text>
          </View>
        </View>

        {expiredItems.length > 0 && (
          <View style={styles.alertGroup}>
            <Text style={styles.alertGroupTitle}>Expired Items ({expiredItems.length})</Text>
            {expiredItems.slice(0, 3).map((item, index) => (
              <View key={index} style={styles.alertItem}>
                <View style={[styles.alertDot, { backgroundColor: '#ef4444' }]} />
                <View style={styles.alertContent}>
                  <Text style={styles.alertItemName}>{item.name}</Text>
                  <Text style={styles.alertItemDetails}>
                    Stock: {item.quantity} • Expired
                  </Text>
                </View>
              </View>
            ))}
            {expiredItems.length > 3 && (
              <Text style={styles.alertMoreText}>
                +{expiredItems.length - 3} more expired items
              </Text>
            )}
          </View>
        )}

        {expiringItems.length > 0 && (
          <View style={styles.alertGroup}>
            <Text style={styles.alertGroupTitle}>Expiring Soon ({expiringItems.length})</Text>
            {expiringItems.slice(0, 3).map((item, index) => (
              <View key={index} style={styles.alertItem}>
                <View style={[styles.alertDot, { backgroundColor: '#f59e0b' }]} />
                <View style={styles.alertContent}>
                  <Text style={styles.alertItemName}>{item.name}</Text>
                  <Text style={styles.alertItemDetails}>
                    Stock: {item.quantity} • Expires in {Math.ceil((new Date(item.expiration_date) - new Date()) / (1000 * 60 * 60 * 24))} days
                  </Text>
                </View>
              </View>
            ))}
            {expiringItems.length > 3 && (
              <Text style={styles.alertMoreText}>
                +{expiringItems.length - 3} more expiring items
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
        <Text style={styles.loadingText}>Loading dashboard...</Text>
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
            <Text style={styles.timeFilterTitle}>Time Period</Text>
          </View>
          <TouchableOpacity 
            style={[styles.timeFilterButton, showTimeFilter && styles.timeFilterButtonActive]}
            onPress={() => setShowTimeFilter(!showTimeFilter)}
          >
            <Text style={[styles.timeFilterText, showTimeFilter && styles.timeFilterTextActive]}>
              {TIME_FILTER_LABELS[timeFilter]}
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
              {getTimeFilterOptions().map((option) => (
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
                {getDateRangeDescription(timeFilter)}
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
            {showAllStores ? 'All Stores Overview' : selectedStore?.name || 'Business Overview'}
          </Text>
          {financialSummary.timeFilter && (
            <Text style={styles.timeFilterDescription}>
              {financialSummary.timeFilter}
            </Text>
          )}
          
          {/* Debug Section - Remove in production */}
          <View style={styles.debugSection}>
            <TouchableOpacity
              style={styles.debugButton}
              onPress={handleClearFailedSync}
            >
              <MaterialIcons name="clear-all" size={20} color="#ffffff" />
              <Text style={styles.debugButtonText}>Clear Failed Sync</Text>
            </TouchableOpacity>
          </View>
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
    );
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
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 20,
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
    color: '#6b7280',
  },
  storeSelector: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  storeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  storeOptionSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  storeOptionText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  storeOptionTextSelected: {
    color: '#2563eb',
    fontWeight: '600',
  },
  cardsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    width: '48%',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 8,
  },
  cardLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#ffffff',
    marginBottom: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankNumber: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  listContent: {
    flex: 1,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  listSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  stockIndicator: {
    marginRight: 12,
  },
  stockDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  noDataText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    padding: 20,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '48%',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  timeFilterContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  timeFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeFilterTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeFilterTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
  },
  timeFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  timeFilterButtonActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  timeFilterText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginRight: 8,
  },
  timeFilterTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  timeFilterDropdown: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  timeFilterOptions: {
    paddingVertical: 8,
  },
  timeFilterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
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
    marginLeft: 12,
  },
  timeFilterOptionTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  timeFilterDescription: {
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  timeFilterDescriptionText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  debugSection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  debugButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  debugButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  chartToggleContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  chartToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  chartToggleButtonActive: {
    backgroundColor: '#2563eb',
  },
  chartToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
    marginLeft: 8,
  },
  chartToggleTextActive: {
    color: '#ffffff',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartControls: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 4,
  },
  metricButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  metricButtonActive: {
    backgroundColor: '#2563eb',
  },
  metricButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  metricButtonTextActive: {
    color: '#ffffff',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  alertBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  alertGroup: {
    marginBottom: 16,
  },
  alertGroupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    marginBottom: 6,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 2,
  },
  alertItemDetails: {
    fontSize: 12,
    color: '#6b7280',
  },
  alertMoreText: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
});
