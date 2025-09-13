# Complete App Testing Checklist

## 🔄 **Reset Steps (Do First)**

### 1. Database Reset
- [ ] Run `COMPLETE_DATABASE_RESET.sql` in Supabase SQL Editor
- [ ] Verify all tables are empty
- [ ] Delete users from Supabase Auth (Dashboard > Authentication > Users)

### 2. App Cache Reset
- [ ] Add `clearAllAppData()` function to App.js temporarily
- [ ] Call the function once
- [ ] Restart the app
- [ ] Remove the function after clearing

### 3. Device Reset (Optional)
- [ ] Clear app data from device settings
- [ ] Uninstall and reinstall app

---

## 🧪 **Feature Testing Checklist**

### **Authentication & User Management**
- [ ] **Owner Signup**
  - [ ] Email validation
  - [ ] Password requirements
  - [ ] Email confirmation flow
  - [ ] Profile creation
- [ ] **Worker Signup**
  - [ ] Worker assignment check
  - [ ] Auto-profile creation
  - [ ] Store assignment
- [ ] **Login/Logout**
  - [ ] Correct role detection
  - [ ] Profile loading
  - [ ] Session persistence
- [ ] **Role-based Navigation**
  - [ ] Owner tabs vs Worker tabs
  - [ ] Screen access restrictions

### **Store Management (Owner Only)**
- [ ] **Create Store**
  - [ ] Store name validation
  - [ ] Optional address field
  - [ ] Database insertion
  - [ ] Auto-selection of first store
- [ ] **Store Selection**
  - [ ] Multiple store switching
  - [ ] Data filtering by store
- [ ] **Worker Assignment**
  - [ ] Email validation
  - [ ] Assignment creation
  - [ ] Worker profile auto-creation on signup
- [ ] **Worker Removal**
  - [ ] Assignment deactivation
  - [ ] Confirmation dialog

### **Inventory Management**
- [ ] **Add Items**
  - [ ] Name, price, cost, quantity validation
  - [ ] Expiration date (optional)
  - [ ] Category selection
  - [ ] Store association
- [ ] **Edit Items**
  - [ ] Pre-filled form
  - [ ] Update functionality
  - [ ] Real-time UI updates
- [ ] **Delete Items**
  - [ ] Confirmation dialog
  - [ ] Cascade deletion handling
- [ ] **Stock Tracking**
  - [ ] Low stock warnings
  - [ ] Expiration alerts
  - [ ] Stock status colors
- [ ] **Store Filtering**
  - [ ] Owner: See all stores or selected store
  - [ ] Worker: See only assigned store

### **Sales Management**
- [ ] **Add Sales**
  - [ ] Item selection from inventory
  - [ ] Quantity validation against stock
  - [ ] Price calculation
  - [ ] Stock deduction
- [ ] **Sales History**
  - [ ] Chronological listing
  - [ ] Store filtering
  - [ ] Date ranges
- [ ] **Cart Functionality**
  - [ ] Add/remove items
  - [ ] Quantity controls
  - [ ] Stock validation
  - [ ] Checkout process
- [ ] **POS System (Worker)**
  - [ ] Barcode scanning (if implemented)
  - [ ] Quick item selection
  - [ ] Receipt generation

### **Expense Management (Owner Only)**
- [ ] **Add Expenses**
  - [ ] Description, amount, category
  - [ ] Date selection
  - [ ] Store association
- [ ] **Expense Categories**
  - [ ] Predefined categories
  - [ ] Custom categories
- [ ] **Expense History**
  - [ ] Filtering by date/store
  - [ ] Total calculations

### **Dashboard & Analytics**
- [ ] **Revenue Metrics**
  - [ ] Total revenue calculation
  - [ ] Period comparisons
  - [ ] Store-wise breakdown
- [ ] **Profit Analysis**
  - [ ] Net profit calculations
  - [ ] Profit margins
  - [ ] Top performing items
- [ ] **Expense Tracking**
  - [ ] Total expenses
  - [ ] Category breakdown
  - [ ] Expense vs revenue ratio
- [ ] **Store Comparison**
  - [ ] Multi-store analytics
  - [ ] Performance metrics
  - [ ] Visual charts
- [ ] **Data Refresh**
  - [ ] Real-time updates
  - [ ] Pull-to-refresh
  - [ ] Offline data sync

### **Offline Functionality**
- [ ] **Data Caching**
  - [ ] Profile caching
  - [ ] Inventory caching
  - [ ] Sales/expense caching
- [ ] **Offline Operations**
  - [ ] Add items offline
  - [ ] Record sales offline
  - [ ] View cached data
- [ ] **Sync on Reconnect**
  - [ ] Automatic sync
  - [ ] Conflict resolution
  - [ ] Sync status indicators

### **UI/UX Testing**
- [ ] **Navigation**
  - [ ] Tab navigation
  - [ ] Screen transitions
  - [ ] Back navigation
- [ ] **Forms**
  - [ ] Input validation
  - [ ] Error messages
  - [ ] Success feedback
- [ ] **Loading States**
  - [ ] Spinners/indicators
  - [ ] Skeleton screens
  - [ ] Empty states
- [ ] **Responsive Design**
  - [ ] Different screen sizes
  - [ ] Orientation changes
  - [ ] Text scaling

### **Error Handling**
- [ ] **Network Errors**
  - [ ] Connection loss handling
  - [ ] Retry mechanisms
  - [ ] User feedback
- [ ] **Validation Errors**
  - [ ] Form validation
  - [ ] Business rule validation
  - [ ] Clear error messages
- [ ] **Permission Errors**
  - [ ] Role-based restrictions
  - [ ] Access denied messages
  - [ ] Graceful fallbacks

### **Performance Testing**
- [ ] **App Startup**
  - [ ] Initial load time
  - [ ] Data preloading
  - [ ] Smooth transitions
- [ ] **Large Data Sets**
  - [ ] Many inventory items
  - [ ] Extensive sales history
  - [ ] Multiple stores
- [ ] **Memory Usage**
  - [ ] No memory leaks
  - [ ] Efficient caching
  - [ ] Background processing

---

## 🎯 **Test Scenarios**

### **Scenario 1: New Owner Setup**
1. Sign up as owner
2. Create first store
3. Add inventory items
4. Assign a worker
5. Test worker signup with assignment

### **Scenario 2: Multi-Store Owner**
1. Create multiple stores
2. Switch between stores
3. Add different inventory per store
4. Compare store performance
5. Assign different workers to each store

### **Scenario 3: Worker Operations**
1. Sign up as worker with assignment
2. View assigned store inventory
3. Process sales through POS
4. Verify stock deductions
5. Test restricted access to owner features

### **Scenario 4: Offline Operations**
1. Disconnect from internet
2. Add inventory items
3. Record sales
4. Reconnect and verify sync
5. Test conflict resolution

### **Scenario 5: Data Migration**
1. Create substantial test data
2. Export/backup data
3. Reset database
4. Import/restore data
5. Verify data integrity

---

## 📝 **Bug Tracking Template**

For each bug found:
- **Screen/Feature**: 
- **Steps to Reproduce**: 
- **Expected Behavior**: 
- **Actual Behavior**: 
- **Error Messages**: 
- **User Role**: 
- **Device/Platform**: 
- **Severity**: Critical/High/Medium/Low
