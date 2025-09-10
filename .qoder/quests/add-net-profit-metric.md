# Add Net Profit Metric to Dashboard

## Overview

This document outlines the implementation plan for adding a net profit metric to the dashboard that calculates the actual profit margin based on the difference between cost price and selling price of items, rather than just revenue minus expenses. This feature will integrate with all other stats like revenue, expense, profit, and inventory value, and will be used to calculate the best performing products based on their actual net profit contribution.

## Architecture

The solution involves modifying the data processing pipeline to calculate net profit at the item level by joining sale items with inventory data to access cost prices. The key components that need modification are:

1. **Dashboard Data Processing** - Update financial summary calculations to include net profit
2. **Top Products Calculation** - Modify ranking algorithm to use net profit instead of revenue
3. **UI Integration** - Add net profit card to dashboard and update related components

## Data Models & ORM Mapping

### Current Database Schema

The application uses the following relevant tables:

1. **inventory** table:
   - `id` (UUID)
   - `cost_price` (DECIMAL) - Purchase price of the item
   - `unit_price` (DECIMAL) - Selling price of the item

2. **sale_items** table:
   - `id` (UUID)
   - `sale_id` (UUID) - Foreign key to sales
   - `inventory_id` (UUID) - Foreign key to inventory
   - `quantity` (INTEGER) - Number of items sold
   - `unit_price` (DECIMAL) - Selling price at time of sale

### Data Relationships

The application already has a mechanism to join sale items with inventory data through the `OfflineDataService.getSales()` method which uses this query:

```javascript
let query = supabase.from('sales').select(`
  *,
  sale_items(
    *,
    inventory:inventory_id(*)
  )
`);
```

This provides access to both the selling price (`sale_items.unit_price`) and cost price (`sale_items.inventory.cost_price`) needed for net profit calculation.

## Business Logic Layer

### Net Profit Calculation

Net profit for each sale item will be calculated as:
```
Net Profit = (Selling Price - Cost Price) * Quantity
```

For a sale with multiple items:
```
Total Net Profit = Σ[(Selling Price_i - Cost Price_i) * Quantity_i]
```

### Implementation Details

1. **Financial Summary Enhancement**
   - Modify dashboard data loading functions to calculate net profit
   - Update `financialSummary` state to include net profit value
   - Maintain existing metrics (revenue, expenses, profit, inventory value)

2. **Top Products Ranking**
   - Change ranking algorithm from revenue-based to net profit-based
   - Calculate total net profit per product across all sales
   - Maintain existing display information (quantity sold, revenue)

3. **Data Processing Functions**
   - Update `loadAdditionalData` function in `UnifiedDashboardScreen.js` to calculate net profit
   - Modify top products aggregation to use net profit for sorting

## API Endpoints Reference

No new API endpoints are required. The implementation leverages existing data fetching mechanisms:

- `OfflineDataService.getSales()` - Already provides joined sale items with inventory data
- `OfflineDataService.getInventory()` - Used for inventory value calculations

## Middleware & Interceptors

No new middleware or interceptors are required for this feature.

## Testing

### Unit Tests

1. **Net Profit Calculation Tests**
   ```javascript
   // Test net profit calculation with various scenarios
   test('calculates net profit correctly', () => {
     const saleItem = {
       unit_price: 100,
       quantity: 2,
       inventory: { cost_price: 60 }
     };
     const netProfit = (saleItem.unit_price - saleItem.inventory.cost_price) * saleItem.quantity;
     expect(netProfit).toBe(80);
   });
   ```

2. **Top Products Ranking Tests**
   ```javascript
   // Test that products are ranked by net profit, not revenue
   test('ranks products by net profit', () => {
     // Product A: 1 sale at $1000 profit
     // Product B: 50 sales at $2000 total profit
     // Product B should rank higher
   });
   ```

3. **Financial Summary Tests**
   ```javascript
   // Test that net profit is correctly added to financial summary
   test('includes net profit in financial summary', () => {
     const summary = calculateFinancialSummary(salesData);
     expect(summary).toHaveProperty('netProfit');
   });
   ```

### Integration Tests

1. **Dashboard Data Loading**
   - Verify that net profit is calculated and displayed correctly
   - Confirm top products are ranked by net profit
   - Ensure existing metrics remain accurate

2. **Offline Mode Compatibility**
   - Test that net profit calculations work with cached data
   - Verify that offline sales data produces correct net profit values

## UI/UX Design

### Dashboard Financial Cards

Add a new card to display net profit alongside existing metrics:

```
[ TRENDING UP ICON ]
$2,450.00
Net Profit
```

### Top Products List

Update the ranking of products in the "Top Products" section to be based on net profit rather than revenue. The display will still show quantity sold and revenue, but the order will be determined by net profit.

## Implementation Details

### 1. Update Dashboard Data Loading

Modify the `loadAdditionalData` function in `UnifiedDashboardScreen.js` to calculate net profit:

```javascript
// In the top products processing section
const productMap = new Map();
topProductsData.forEach(item => {
  const key = item.inventory_id;
  const costPrice = item.inventory?.cost_price || 0;
  const netProfit = (item.unit_price - costPrice) * item.quantity;
  
  if (productMap.has(key)) {
    const existing = productMap.get(key);
    existing.total_quantity += item.quantity;
    existing.total_revenue += item.quantity * item.unit_price;
    existing.total_net_profit += netProfit;
  } else {
    productMap.set(key, {
      inventory_id: item.inventory_id,
      name: item.inventory?.name || 'Unknown Product',
      total_quantity: item.quantity,
      total_revenue: item.quantity * item.unit_price,
      total_net_profit: netProfit
    });
  }
});

// Sort by net profit instead of quantity
const topProducts = Array.from(productMap.values())
  .sort((a, b) => b.total_net_profit - a.total_net_profit)
  .slice(0, 5);
```

### 2. Update Financial Summary Calculation

Modify the financial summary calculation to include net profit:

```javascript
// In loadStoreData and loadIndividualData functions
const totalNetProfit = salesData.data?.reduce((sum, sale) => {
  return sum + (sale.sale_items?.reduce((itemSum, item) => {
    const costPrice = item.inventory?.cost_price || 0;
    return itemSum + (item.unit_price - costPrice) * item.quantity;
  }, 0) || 0);
}, 0) || 0;

setFinancialSummary({
  totalRevenue,
  totalExpenses,
  profitLoss: totalRevenue - totalExpenses,
  inventoryValue,
  inventoryCount: inventoryData.data?.length || 0,
  timeFilter: getDateRangeDescription(timeFilter),
  totalNetProfit  // Add this new field
});
```

### 3. Add Net Profit Card to Dashboard

Add a new card component in the `renderFinancialCards` function:

```jsx
<View style={styles.card}>
  <MaterialIcons name="show-chart" size={32} color="#10b981" />
  <Text style={[styles.cardValue, { color: (financialSummary.totalNetProfit || 0) >= 0 ? '#10b981' : '#ef4444' }]}>
    {formatCurrency(financialSummary.totalNetProfit)}
  </Text>
  <Text style={styles.cardLabel}>Net Profit</Text>
</View>
```

## Performance Considerations

1. **Calculation Efficiency**
   - Net profit calculations will be performed during data loading
   - Calculations are simple arithmetic operations with minimal performance impact
   - Aggregation is done once during data processing, not on every render

2. **Data Fetching**
   - No additional database queries required
   - Leveraging existing joined data from `getSales()` method
   - Maintaining existing caching mechanisms for offline support

## Error Handling

1. **Missing Cost Price Data**
   - Handle cases where inventory items might not have cost price
   - Default to zero profit calculation if cost price is missing
   - Log warnings for data integrity issues

2. **Data Consistency**
   - Ensure calculations work with both online and offline data
   - Handle cases where inventory data might be stale
   - Maintain consistency with existing error handling patterns