# Inventory Item Creation, Sales Page Cart Functionality, and Low Stock Alert Configuration Fixes

## 1. Overview

This document outlines the design and implementation plan for fixing three critical issues in the inventory and sales management system:

1. **Inventory Item Editing Issue**: When editing an inventory item as an owner, a new item is created instead of updating the existing one.
2. **Cart Functionality Issues**: In the sales page cart, the quantity adjustment (+/-) buttons are not working, and the cancel button is unnecessary.
3. **Low Stock Alert Configuration**: When adding inventory items, users should be able to set a custom low stock alert amount instead of using a fixed default value.

## 2. Current Implementation Analysis

### 2.1 Inventory Item Editing Issue

In the `AddItemScreen.js` component, when editing an existing item:
- The component correctly receives the `editingItem` through route parameters
- Form data is pre-populated with existing item values
- However, in the `handleSave` function, the code doesn't properly differentiate between creating a new item and updating an existing one when calling the data service

### 2.2 Cart Functionality Issues

In the `CartScreen.js` component:
- The quantity adjustment buttons (+/-) exist but may not be properly connected to state update functions
- The "cancel" button is present but doesn't serve a clear purpose in the cart context

### 2.3 Low Stock Alert Configuration

In the `AddItemScreen.js` component:
- The `minimum_stock_level` is hardcoded to 5 when creating new inventory items
- There is no UI field for users to set a custom low stock alert threshold

## 3. Proposed Solutions

### 3.1 Fix Inventory Item Editing

**Problem**: The `handleSave` function in `AddItemScreen.js` correctly identifies when an item is being edited but may not be passing the correct parameters to the data service.

**Solution**:
1. Ensure the `updateInventoryItem` function is called with the correct item ID when editing
2. Verify that the item ID is properly passed from the route parameters to the update function
3. Confirm that the UI correctly navigates to the edit screen with the item data

### 3.2 Fix Cart Functionality

**Problem**: The cart quantity adjustment buttons may not be properly updating the cart state, and the cancel button is unnecessary.

**Solution**:
1. Implement proper state management for quantity adjustments in the cart
2. Remove the unnecessary cancel button from cart items
3. Ensure the remove functionality works correctly

### 3.3 Add Low Stock Alert Configuration

**Problem**: Users cannot set custom low stock alert thresholds when adding inventory items.

**Solution**:
1. Add a new input field in the `AddItemScreen.js` for minimum stock level
2. Modify the form validation to include this new field
3. Update the item data structure to include the user-defined minimum stock level
4. Ensure the value is properly saved to the database

## 4. Detailed Implementation Plan

### 4.1 Inventory Item Editing Fix

#### 4.1.1 Component Changes (AddItemScreen.js)

```javascript
// In the handleSave function, ensure proper differentiation between add and update:
if (editingItem) {
  // Update existing item using offline service
  const result = await offlineDataService.updateInventoryItem(editingItem.id, itemData, userRole);
} else {
  // Insert new item using offline service
  const result = await offlineDataService.addInventoryItem(itemData, userRole);
}
```

#### 4.1.2 Data Service Verification (OfflineDataService.js)

Ensure the `updateInventoryItem` function properly:
1. Receives the correct item ID
2. Updates the item in both the database and local cache
3. Returns appropriate success/failure status

### 4.2 Cart Functionality Fixes

#### 4.2.1 Component Changes (CartScreen.js)

1. Verify the `updateQuantity` function properly updates the cart state:
```javascript
const updateQuantity = async (itemId, newQuantity) => {
  if (newQuantity <= 0) {
    removeFromCart(itemId);
    return;
  }

  // Validate stock availability
  // Update cart state
  setCart(prev => 
    prev.map(cartItem => 
      cartItem.id === itemId 
        ? { ...cartItem, quantity: newQuantity }
        : cartItem
    )
  );
};
```

2. Remove the cancel button from the cart item UI as it's redundant

### 4.3 Low Stock Alert Configuration

#### 4.3.1 UI Changes (AddItemScreen.js)

1. Add a new input field for minimum stock level:
```jsx
{renderInputField(
  "Minimum Stock Level",
  "minStockLevel",
  "Enter minimum stock level for alerts",
  "numeric"
)}
```

2. Update the form data initialization to include minStockLevel:
```javascript
const [formData, setFormData] = useState({
  name: "",
  category: "",
  quantity: "",
  price: "",
  costPrice: "",
  description: "",
  expirationDate: null,
  minStockLevel: "5" // Default value
});
```

3. Update the useEffect that populates form data when editing:
```javascript
useEffect(() => {
  if (editingItem) {
    setFormData({
      name: editingItem.item_name || editingItem.name || "",
      category: editingItem.category || "",
      quantity: editingItem.quantity?.toString() || "",
      price: editingItem.price?.toString() || "",
      costPrice: editingItem.cost_price?.toString() || "",
      description: editingItem.description || "",
      expirationDate: editingItem.expiration_date ? new Date(editingItem.expiration_date) : null,
      minStockLevel: editingItem.minimum_stock_level?.toString() || "5"
    });
  }
}, [editingItem]);
```

#### 4.3.2 Backend Changes

1. Update the itemData object in handleSave to include the minimum_stock_level:
```javascript
const itemData = {
  name: formData.name.trim(),
  category: formData.category.trim(),
  selling_price: parseFloat(formData.price),
  cost_price: parseFloat(formData.costPrice) || 0,
  quantity: parseInt(formData.quantity),
  minimum_stock_level: parseInt(formData.minStockLevel) || 5,
  description: formData.description.trim(),
  expiration_date: formData.expirationDate ? formData.expirationDate.toISOString().split('T')[0] : null,
  user_id: user.id,
  store_id: storeId
};
```

2. Add validation for the minimum stock level field

## 5. Data Models

### 5.1 Inventory Item Model

The inventory item model will be updated to include a configurable minimum stock level:

```javascript
{
  id: string,
  name: string,
  category: string,
  quantity: integer,
  selling_price: decimal,
  cost_price: decimal,
  minimum_stock_level: integer, // New field
  description: string,
  expiration_date: date,
  store_id: string,
  user_id: string,
  created_at: datetime,
  updated_at: datetime
}
```

## 6. UI/UX Considerations

### 6.1 Inventory Editing Flow

1. Maintain consistent navigation patterns between add and edit modes
2. Clearly indicate when a user is editing vs. creating an item
3. Preserve all existing item data during the edit process

### 6.2 Cart Functionality

1. Ensure quantity adjustments provide immediate visual feedback
2. Add proper error handling for stock validation
3. Simplify the cart interface by removing unnecessary elements

### 6.3 Low Stock Configuration

1. Add clear labeling for the minimum stock level field
2. Provide helpful placeholder text explaining the purpose
3. Implement proper validation to ensure only positive integers are accepted

## 7. Testing Strategy

### 7.1 Inventory Editing Tests

1. Verify that editing an item updates the existing record rather than creating a new one
2. Confirm that all item properties are correctly preserved during editing
3. Test editing workflow for different user roles (owner, worker)

### 7.2 Cart Functionality Tests

1. Verify that quantity adjustment buttons properly update the cart state
2. Confirm that stock validation works correctly when adjusting quantities
3. Test removing items from the cart

### 7.3 Low Stock Configuration Tests

1. Verify that the minimum stock level field appears in the add/edit item form
2. Confirm that custom minimum stock levels are properly saved
3. Test that the default value is applied when no custom value is provided

## 8. Error Handling

### 8.1 Inventory Editing Errors

- Handle cases where the item to be edited no longer exists
- Manage conflicts when multiple users attempt to edit the same item
- Provide clear error messages for database connectivity issues

### 8.2 Cart Functionality Errors

- Handle insufficient stock scenarios when adjusting quantities
- Manage offline scenarios where stock information may be stale
- Provide user feedback when cart updates fail

### 8.3 Low Stock Configuration Errors

- Validate that minimum stock level is a positive integer
- Handle cases where the minimum stock level is higher than the current quantity
- Provide clear error messages for invalid input

## 9. Performance Considerations

1. Ensure that inventory updates don't cause unnecessary re-renders of the entire inventory list
2. Optimize cart updates to only modify the affected items
3. Implement proper debouncing for quantity adjustments to prevent excessive API calls