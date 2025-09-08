/**
 * Chart Data Utilities
 * Provides data processing functions for dashboard charts and analytics
 */

/**
 * Get store comparison data for charts
 * @param {Array} stores - Array of store objects
 * @param {Array} sales - Array of sales data
 * @param {Array} expenses - Array of expenses data
 * @param {string} timeFilter - Time filter to apply
 * @returns {Array} - Processed data for store comparison charts
 */
export const getStoreComparisonData = (stores, sales, expenses = [], timeFilter) => {
  try {
    if (!stores || !sales || stores.length === 0) {
      return [];
    }

    const storeData = stores.map(store => {
      const storeSales = sales.filter(sale => sale.store_id === store.id);
      const storeExpenses = expenses.filter(expense => expense.store_id === store.id);
      
      // Calculate metrics based on time filter
      const filteredSales = filterSalesByTime(storeSales, timeFilter);
      const filteredExpenses = filterExpensesByTime(storeExpenses, timeFilter);
      
      const totalRevenue = filteredSales.reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
      const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
      const totalProfit = totalRevenue - totalExpenses;
      const totalSales = filteredSales.length;
      const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
      const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
      
      return {
        id: store.id,
        name: store.name,
        revenue: totalRevenue,
        expenses: totalExpenses,
        profit: totalProfit,
        profitMargin: profitMargin,
        salesCount: totalSales,
        averageOrderValue: averageOrderValue,
        color: getStoreColor(store.id)
      };
    });

    return storeData.sort((a, b) => b.revenue - a.revenue);
  } catch (error) {
    console.error('Error getting store comparison data:', error);
    return [];
  }
};

/**
 * Calculate performance metrics for dashboard
 * @param {Array} sales - Array of sales data
 * @param {Array} expenses - Array of expenses data
 * @param {string} timeFilter - Time filter to apply
 * @returns {Object} - Performance metrics object
 */
export const calculatePerformanceMetrics = (sales, expenses, timeFilter) => {
  try {
    const filteredSales = filterSalesByTime(sales, timeFilter);
    const filteredExpenses = filterExpensesByTime(expenses, timeFilter);
    
    const totalRevenue = filteredSales.reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    
    // Calculate growth metrics (compare with previous period)
    const previousPeriodSales = getPreviousPeriodSales(sales, timeFilter);
    const previousPeriodExpenses = getPreviousPeriodExpenses(expenses, timeFilter);
    
    const revenueGrowth = calculateGrowthRate(totalRevenue, previousPeriodSales);
    const expenseGrowth = calculateGrowthRate(totalExpenses, previousPeriodExpenses);
    
    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      profitMargin,
      revenueGrowth,
      expenseGrowth,
      salesCount: filteredSales.length,
      expenseCount: filteredExpenses.length
    };
  } catch (error) {
    console.error('Error calculating performance metrics:', error);
    return {
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      profitMargin: 0,
      revenueGrowth: 0,
      expenseGrowth: 0,
      salesCount: 0,
      expenseCount: 0
    };
  }
};

/**
 * Filter sales data by time period
 * @param {Array} sales - Array of sales data
 * @param {string} timeFilter - Time filter to apply
 * @returns {Array} - Filtered sales data
 */
const filterSalesByTime = (sales, timeFilter) => {
  if (!sales || sales.length === 0) return [];
  
  if (timeFilter === 'all_time') {
    return sales;
  }
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (timeFilter) {
    case 'today':
      return sales.filter(sale => {
        const saleDate = new Date(sale.created_at || sale.sale_date);
        return saleDate >= today && saleDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
      });
      
    case 'week':
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      
      return sales.filter(sale => {
        const saleDate = new Date(sale.created_at || sale.sale_date);
        return saleDate >= startOfWeek && saleDate <= endOfWeek;
      });
      
    case 'month':
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);
      
      return sales.filter(sale => {
        const saleDate = new Date(sale.created_at || sale.sale_date);
        return saleDate >= startOfMonth && saleDate <= endOfMonth;
      });
      
    default:
      return sales;
  }
};

/**
 * Filter expenses data by time period
 * @param {Array} expenses - Array of expenses data
 * @param {string} timeFilter - Time filter to apply
 * @returns {Array} - Filtered expenses data
 */
const filterExpensesByTime = (expenses, timeFilter) => {
  if (!expenses || expenses.length === 0) return [];
  
  if (timeFilter === 'all_time') {
    return expenses;
  }
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (timeFilter) {
    case 'today':
      return expenses.filter(expense => {
        const expenseDate = new Date(expense.created_at || expense.expense_date);
        return expenseDate >= today && expenseDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
      });
      
    case 'week':
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      
      return expenses.filter(expense => {
        const expenseDate = new Date(expense.created_at || expense.expense_date);
        return expenseDate >= startOfWeek && expenseDate <= endOfWeek;
      });
      
    case 'month':
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);
      
      return expenses.filter(expense => {
        const expenseDate = new Date(expense.created_at || expense.expense_date);
        return expenseDate >= startOfMonth && expenseDate <= endOfMonth;
      });
      
    default:
      return expenses;
  }
};

/**
 * Get previous period data for comparison
 * @param {Array} sales - Array of sales data
 * @param {string} timeFilter - Current time filter
 * @returns {number} - Previous period total revenue
 */
const getPreviousPeriodSales = (sales, timeFilter) => {
  if (!sales || sales.length === 0) return 0;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (timeFilter) {
    case 'today':
      // Previous day
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBefore = new Date(yesterday);
      dayBefore.setDate(dayBefore.getDate() - 1);
      
      return sales
        .filter(sale => {
          const saleDate = new Date(sale.created_at || sale.sale_date);
          return saleDate >= dayBefore && saleDate < yesterday;
        })
        .reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
        
    case 'week':
      // Previous week
      const lastWeekStart = new Date(today);
      lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
      lastWeekEnd.setHours(23, 59, 59, 999);
      
      return sales
        .filter(sale => {
          const saleDate = new Date(sale.created_at || sale.sale_date);
          return saleDate >= lastWeekStart && saleDate <= lastWeekEnd;
        })
        .reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
        
    case 'month':
      // Previous month
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      lastMonthEnd.setHours(23, 59, 59, 999);
      
      return sales
        .filter(sale => {
          const saleDate = new Date(sale.created_at || sale.sale_date);
          return saleDate >= lastMonth && saleDate <= lastMonthEnd;
        })
        .reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
        
    default:
      return 0;
  }
};

/**
 * Get previous period expenses for comparison
 * @param {Array} expenses - Array of expenses data
 * @param {string} timeFilter - Current time filter
 * @returns {number} - Previous period total expenses
 */
const getPreviousPeriodExpenses = (expenses, timeFilter) => {
  if (!expenses || expenses.length === 0) return 0;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (timeFilter) {
    case 'today':
      // Previous day
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBefore = new Date(yesterday);
      dayBefore.setDate(dayBefore.getDate() - 1);
      
      return expenses
        .filter(expense => {
          const expenseDate = new Date(expense.created_at || expense.expense_date);
          return expenseDate >= dayBefore && expenseDate < yesterday;
        })
        .reduce((sum, expense) => sum + (expense.amount || 0), 0);
        
    case 'week':
      // Previous week
      const lastWeekStart = new Date(today);
      lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
      lastWeekEnd.setHours(23, 59, 59, 999);
      
      return expenses
        .filter(expense => {
          const expenseDate = new Date(expense.created_at || expense.expense_date);
          return expenseDate >= lastWeekStart && expenseDate <= lastWeekEnd;
        })
        .reduce((sum, expense) => sum + (expense.amount || 0), 0);
        
    case 'month':
      // Previous month
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      lastMonthEnd.setHours(23, 59, 59, 999);
      
      return expenses
        .filter(expense => {
          const expenseDate = new Date(expense.created_at || expense.expense_date);
          return expenseDate >= lastMonth && expenseDate <= lastMonthEnd;
        })
        .reduce((sum, expense) => sum + (expense.amount || 0), 0);
        
    default:
      return 0;
  }
};

/**
 * Calculate growth rate percentage
 * @param {number} current - Current period value
 * @param {number} previous - Previous period value
 * @returns {number} - Growth rate percentage
 */
const calculateGrowthRate = (current, previous) => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  
  return ((current - previous) / previous) * 100;
};

/**
 * Get color for store in charts
 * @param {string} storeId - Store ID
 * @returns {string} - Hex color code
 */
const getStoreColor = (storeId) => {
  const colors = [
    '#2563eb', // Blue
    '#dc2626', // Red
    '#059669', // Green
    '#d97706', // Orange
    '#7c3aed', // Purple
    '#db2777', // Pink
    '#0891b2', // Cyan
    '#65a30d', // Lime
  ];
  
  // Simple hash function to consistently assign colors
  let hash = 0;
  for (let i = 0; i < storeId.length; i++) {
    const char = storeId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return colors[Math.abs(hash) % colors.length];
};
