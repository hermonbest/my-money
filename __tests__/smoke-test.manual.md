# 🧪 Smoke Test Checklist - Main User Flows

## Overview
Manual smoke tests to validate the complete SQLite storage migration works in real app scenarios.

---

## ✅ **Test 1: Owner Login & Store Management**

### **Steps:**
1. **Fresh App Start**
   ```
   npm start
   ```
   - ✅ App loads without crashes
   - ✅ No AsyncStorage errors in console
   - ✅ SQLite initializes properly

2. **Owner Authentication**
   - ✅ Login with owner credentials
   - ✅ Session cached to secure storage (not AsyncStorage)
   - ✅ User profile stored in SQLite
   - ✅ Navigate to dashboard without errors

3. **Store Creation**
   - ✅ Add new store via "Store Management"
   - ✅ Store data persists to SQLite
   - ✅ Store appears in store list
   - ✅ No AsyncStorage calls in network tab

4. **Store Selection**
   - ✅ Select store from dropdown
   - ✅ Store ID cached properly
   - ✅ Dashboard loads store-specific data

### **Expected Results:**
- No AsyncStorage usage except in Supabase internals
- All data flows through centralizedStorage
- Session/auth data in expo-secure-store
- Store data in SQLite tables

---

## ✅ **Test 2: Worker Sale Offline Flow**

### **Steps:**
1. **Worker Login**
   - ✅ Login with worker credentials
   - ✅ Assigned to specific store
   - ✅ Navigate to POS screen

2. **Go Offline**
   ```
   // Simulate offline in browser dev tools
   // Or disconnect WiFi on device
   ```
   - ✅ App detects offline status
   - ✅ Offline indicator shows
   - ✅ POS remains functional

3. **Create Sale Offline**
   - ✅ Add items to cart
   - ✅ Complete sale transaction
   - ✅ Sale data stores to SQLite with temp IDs
   - ✅ Operations added to sync queue
   - ✅ No Supabase API calls attempted

4. **Verify Offline Data**
   - ✅ Sale appears in local sales list
   - ✅ Inventory quantities updated locally
   - ✅ Sync queue has pending operations

### **Expected Results:**
- Sale completes successfully offline
- Temp IDs generated for new records
- Sync queue populated with operations
- Local SQLite data updated immediately

---

## ✅ **Test 3: Reconnect & Sync Validation**

### **Steps:**
1. **Go Back Online**
   ```
   // Re-enable network connection
   ```
   - ✅ App detects online status
   - ✅ Sync process automatically triggers
   - ✅ Dispatcher processes pending operations

2. **Sync Queue Processing**
   - ✅ Pending operations sync to Supabase
   - ✅ Temp IDs resolved to real server IDs
   - ✅ Local SQLite updated with real IDs
   - ✅ Sync queue cleared of completed operations

3. **Data Consistency Check**
   - ✅ Sale appears in Supabase dashboard
   - ✅ Inventory quantities correct on server
   - ✅ All temp IDs replaced with real IDs
   - ✅ No duplicate data created

### **Expected Results:**
- Seamless offline→online transition
- All offline data synced correctly
- No data loss or corruption
- Server and local data consistent

---

## ✅ **Test 4: Inventory Management Flow**

### **Steps:**
1. **Add Inventory Items**
   - ✅ Navigate to inventory screen
   - ✅ Add new items online
   - ✅ Items stored to SQLite cache
   - ✅ Items visible immediately

2. **Edit Items Offline**
   - ✅ Go offline
   - ✅ Update item quantities/prices
   - ✅ Changes stored locally with sync flags
   - ✅ Operations queued for sync

3. **Verify Updates Sync**
   - ✅ Go back online
   - ✅ Updates sync to Supabase
   - ✅ Server data matches local changes
   - ✅ Other users see updates

### **Expected Results:**
- CRUD operations work offline
- Changes queue properly for sync
- No data conflicts on sync
- Real-time updates across users

---

## ✅ **Test 5: Dashboard Data Updates**

### **Steps:**
1. **Dashboard Loading**
   - ✅ Dashboard loads from SQLite cache
   - ✅ Fast initial load times
   - ✅ Data shows immediately (cached)

2. **Real-time Updates**
   - ✅ Make changes in POS
   - ✅ Dashboard reflects changes immediately
   - ✅ Cache updates properly
   - ✅ No stale data issues

3. **Cross-Session Consistency**
   - ✅ Logout and login again
   - ✅ Dashboard shows latest data
   - ✅ Cache persists between sessions
   - ✅ No data loss

### **Expected Results:**
- Fast dashboard loading from cache
- Real-time updates reflected
- Data consistency across sessions
- No caching conflicts

---

## 🔧 **Debug Tools Available**

### **Console Commands:**
```javascript
// Global sync debugger
global.syncDebug.printSyncStatus();
global.syncDebug.forceSyncAll();
global.syncDebug.clearFailedOperations();

// Storage stats
await centralizedStorage.getStorageStats();

// Sync queue inspection
await centralizedStorage.getPendingSyncOperations();
```

### **Log Monitoring:**
- Watch console for SQLite operations
- Monitor network tab for Supabase calls
- Check for AsyncStorage warnings
- Verify sync operation logs

---

## 🎯 **Success Criteria**

### **✅ All Tests Must Pass:**
1. No AsyncStorage usage (except Supabase internals)
2. All data operations use SQLite + secure storage
3. Offline functionality works completely
4. Sync process handles all operation types
5. No data loss or corruption
6. Performance remains good (fast loading)
7. No console errors or warnings

### **✅ Migration Complete When:**
- All manual tests pass
- No AsyncStorage references in app code
- Sync queue processes all operation types
- Data integrity maintained across offline/online
- App ready for production deployment

---

## 🚀 **Ready for Production:**
Once all smoke tests pass, the SQLite migration is complete and the app is ready for production with:
- Unified SQLite storage
- Robust offline support
- Comprehensive sync system
- Regression-tested codebase
