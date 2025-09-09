import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
  RefreshControl,
  SafeAreaView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { offlineManager } from '../utils/OfflineManager';
import { offlineDataService } from '../utils/OfflineDataService';
import { getCurrentUser } from '../utils/authUtils';
import { handleSupabaseError, handleInventoryError, handleSaleError, showErrorAlert, logError } from '../utils/errorHandling';
import { useStore } from '../contexts/StoreContext';
import HeaderWithLogout from '../components/HeaderWithLogout';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function WorkerPOSScreen({ navigation, route }) {
  // Core state management
  const { selectedStore, userRole, loading: storeLoading } = useStore();
  const [inventory, setInventory] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [processing, setProcessing] = useState(false);
  
  // No modal state needed - using navigation to checkout screen
  
  // Network status
  const isOnline = offlineManager.isConnected();
  
  // Component initialization
  useEffect(() => {
    initializePOS();
  }, [selectedStore, storeLoading]); // Add storeLoading as dependency
  
  // Reload inventory when screen gains focus (e.g., returning from checkout)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (selectedStore) {
        loadInventory(true); // Force refresh when returning
      }
    });
    
    return unsubscribe;
  }, [navigation, selectedStore, loadInventory]);
  
  // Handle cart clearing when returning from checkout
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      const { clearCart } = route.params || {};
      if (clearCart) {
        setCart([]);
        // Clear the param to avoid clearing again
        navigation.setParams({ clearCart: undefined });
      }
    });
    
    return unsubscribe;
  }, [navigation, route.params]);
  
  const initializePOS = async () => {
    // Wait for store context to finish loading
    if (storeLoading) {
      console.log('🔄 Waiting for store context to load...');
      return;
    }
    
    // Workers are automatically assigned to their store, no selection needed
    if (selectedStore) {
      console.log('🏪 Store loaded, initializing inventory for:', selectedStore.name);
      await loadInventory();
    } else {
      console.log('⚠️ No store assigned to worker yet');
    }
  };
  
  // Logout function following the centralized authentication pattern
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

  // Load inventory for the current store
  const loadInventory = useCallback(async (forceRefresh = false) => {
    try {
      console.log('📦 Loading inventory...', { forceRefresh, store: selectedStore?.name, userRole });
      
      // Debugging: Check if userRole is null
      if (userRole === null || userRole === undefined) {
        console.warn('⚠️ userRole is null/undefined in loadInventory - this may cause cache issues');
      }
      
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      const { user } = await getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      if (!selectedStore?.id) {
        throw new Error('Worker store not loaded yet. Please wait for store assignment.');
      }
      
      // Load inventory for the selected store
      const inventoryData = await offlineDataService.getInventory(
        selectedStore.id, 
        user.id, 
        userRole
      );
      
      const processedInventory = (inventoryData || []).map(item => ({
        ...item,
        unit_price: item.unit_price || item.selling_price || 0,
        selling_price: item.selling_price || item.unit_price || 0,
        quantity: Math.max(0, item.quantity || 0)
      }));
      
      setInventory(processedInventory);
      console.log('✅ Inventory loaded:', processedInventory.length, 'items');
      
    } catch (error) {
      console.error('❌ Error loading inventory:', error);
      const errorMessage = handleSupabaseError(error, 'Load inventory');
      logError(error, { context: 'loadInventory', store: selectedStore?.id });
      
      showErrorAlert({
        title: 'Inventory Load Failed',
        message: errorMessage,
        action: 'Retry'
      }, null, () => loadInventory(forceRefresh));
      
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedStore, userRole]);

  // Cart management functions
  const addToCart = useCallback((item, customQuantity = 1) => {
    try {
      if (!item || !item.id) {
        showErrorAlert({
          title: 'Invalid Item',
          message: 'The selected item is invalid.',
          action: 'OK'
        });
        return;
      }
      
      if (customQuantity <= 0 || !Number.isInteger(customQuantity)) {
        showErrorAlert({
          title: 'Invalid Quantity',
          message: 'Quantity must be a positive whole number.',
          action: 'OK'
        });
        return;
      }
      
      // Check stock availability
      const existingCartItem = cart.find(cartItem => cartItem.id === item.id);
      const currentCartQuantity = existingCartItem ? existingCartItem.quantity : 0;
      const requestedQuantity = currentCartQuantity + customQuantity;
      
      if (requestedQuantity > item.quantity) {
        showErrorAlert({
          title: 'Insufficient Stock',
          message: `Only ${item.quantity} units of "${item.name}" are available.`,
          action: 'OK'
        });
        return;
      }
      
      // Add or update cart item
      if (existingCartItem) {
        setCart(prevCart => 
          prevCart.map(cartItem =>
            cartItem.id === item.id
              ? { ...cartItem, quantity: requestedQuantity }
              : cartItem
          )
        );
      } else {
        setCart(prevCart => [...prevCart, { 
          ...item, 
          quantity: customQuantity,
          cartId: `${item.id}_${Date.now()}` // Unique cart identifier
        }]);
      }
      
      console.log(`✅ Added ${customQuantity} x ${item.name} to cart`);
      
    } catch (error) {
      console.error('Error adding item to cart:', error);
      showErrorAlert({
        title: 'Add to Cart Failed',
        message: 'Unable to add item to cart. Please try again.',
        action: 'OK'
      });
    }
  }, [cart]);
  
  const updateCartQuantity = useCallback((itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    
    const inventoryItem = inventory.find(item => item.id === itemId);
    if (!inventoryItem) {
      showErrorAlert({
        title: 'Item Not Found',
        message: 'Item not found in inventory.',
        action: 'OK'
      });
      return;
    }
    
    if (newQuantity > inventoryItem.quantity) {
      showErrorAlert({
        title: 'Insufficient Stock',
        message: `Only ${inventoryItem.quantity} units available.`,
        action: 'OK'
      });
      return;
    }
    
    setCart(prevCart =>
      prevCart.map(cartItem =>
        cartItem.id === itemId
          ? { ...cartItem, quantity: newQuantity }
          : cartItem
      )
    );
  }, [inventory]);
  
  const removeFromCart = useCallback((itemId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId));
  }, []);
  
  const clearCart = useCallback(() => {
    Alert.alert(
      'Clear Cart',
      'Are you sure you want to remove all items from cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => setCart([]) }
      ]
    );
  }, []);
  
  // Cart utility functions
  const getCartTotal = useCallback(() => {
    return cart.reduce((total, item) => total + (item.unit_price * item.quantity), 0);
  }, [cart]);
  
  const getCartItemCount = useCallback(() => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart]);
  
  // Filter inventory based on search query
  const getFilteredInventory = useCallback(() => {
    if (!searchQuery.trim()) return inventory;
    
    const query = searchQuery.toLowerCase();
    return inventory.filter(item => 
      item.name?.toLowerCase().includes(query) ||
      item.category?.toLowerCase().includes(query) ||
      item.sku?.toLowerCase().includes(query)
    );
  }, [inventory, searchQuery]);

  // Navigation to checkout screen - no processing needed here

  // Render functions
  const renderInventoryItem = ({ item }) => {
    const isOutOfStock = item.quantity <= 0;
    const isLowStock = item.quantity <= 5 && item.quantity > 0;
    const cartItem = cart.find(cartItem => cartItem.id === item.id);
    const inCartQuantity = cartItem ? cartItem.quantity : 0;
    
    return (
      <TouchableOpacity
        style={[styles.inventoryItem, isOutOfStock && styles.outOfStockItem]}
        onPress={() => !isOutOfStock && addToCart(item, 1)}
        disabled={isOutOfStock}
      >
        <View style={styles.itemInfo}>
          <Text style={[styles.itemName, isOutOfStock && styles.outOfStockText]}>
            {item.name}
          </Text>
          <Text style={styles.itemCategory}>{item.category || 'General'}</Text>
          <Text style={styles.itemPrice}>${(item.unit_price || 0).toFixed(2)}</Text>
          <Text style={[
            styles.itemStock, 
            isOutOfStock && styles.outOfStockText,
            isLowStock && styles.lowStockText
          ]}>
            {isOutOfStock ? 'Out of Stock' : `Stock: ${item.quantity}`}
            {inCartQuantity > 0 && ` (${inCartQuantity} in cart)`}
          </Text>
        </View>
        <View style={styles.itemActions}>
          {inCartQuantity > 0 && (
            <View style={styles.cartIndicator}>
              <Text style={styles.cartIndicatorText}>{inCartQuantity}</Text>
            </View>
          )}
          {isOutOfStock ? (
            <MaterialIcons name="block" size={24} color="#9ca3af" />
          ) : (
            <MaterialIcons name="add-shopping-cart" size={24} color="#2563eb" />
          )}
        </View>
      </TouchableOpacity>
    );
  };
  
  const renderCartItem = ({ item }) => {
    return (
      <View style={styles.cartItem}>
        <View style={styles.cartItemInfo}>
          <Text style={styles.cartItemName}>{item.name}</Text>
          <Text style={styles.cartItemPrice}>${item.unit_price.toFixed(2)} each</Text>
          <Text style={styles.cartItemTotal}>
            Total: ${(item.unit_price * item.quantity).toFixed(2)}
          </Text>
        </View>
        <View style={styles.cartItemActions}>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => updateCartQuantity(item.id, item.quantity - 1)}
            >
              <MaterialIcons name="remove" size={18} color="#6b7280" />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => updateCartQuantity(item.id, item.quantity + 1)}
            >
              <MaterialIcons name="add" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => removeFromCart(item.id)}
          >
            <MaterialIcons name="delete" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Loading state - show loading when inventory is loading OR store context is loading
  if (loading || storeLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>
          {storeLoading ? 'Loading store information...' : 'Loading POS system...'}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <HeaderWithLogout
        title="Worker POS"
        onLogout={handleLogout}
        userRole={userRole}
        currentStore={selectedStore}
      />
      
      {/* Show message if no store selected */}
      {!selectedStore ? (
        <View style={styles.noStoreContainer}>
          <MaterialIcons name="store" size={48} color="#9ca3af" />
          <Text style={styles.noStoreTitle}>Please select a store</Text>
          <Text style={styles.noStoreMessage}>A store needs to be selected to use the POS system.</Text>
        </View>
      ) : (
        <>
          {/* Offline Indicator */}
          {!isOnline && (
            <View style={styles.offlineIndicator}>
              <MaterialIcons name="wifi-off" size={16} color="#ef4444" />
              <Text style={styles.offlineText}>Offline Mode - Sales will sync when online</Text>
            </View>
          )}
          
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color="#6b7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search inventory..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9ca3af"
            />
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => loadInventory(true)}
            >
              <MaterialIcons name="refresh" size={24} color="#2563eb" />
            </TouchableOpacity>
          </View>
          
          {/* Cart Summary */}
          {cart.length > 0 && (
            <View style={styles.cartSummary}>
              <View style={styles.cartSummaryLeft}>
                <Text style={styles.cartSummaryText}>
                  {getCartItemCount()} items • ${getCartTotal().toFixed(2)}
                </Text>
              </View>
              <View style={styles.cartSummaryRight}>
                <TouchableOpacity style={styles.clearCartButton} onPress={clearCart}>
                  <MaterialIcons name="clear" size={20} color="#ef4444" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.checkoutButton}
                  onPress={() => navigation.navigate('POSCheckoutScreen', { 
                    cartItems: cart
                  })}
                >
                  <MaterialIcons name="shopping-cart-checkout" size={20} color="#ffffff" />
                  <Text style={styles.checkoutButtonText}>Checkout</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {/* Main Content */}
          <View style={styles.mainContent}>
            {/* Inventory List */}
            <View style={styles.inventorySection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Inventory ({getFilteredInventory().length})
                </Text>
              </View>
              
              <FlatList
                data={getFilteredInventory()}
                keyExtractor={(item) => item.id}
                renderItem={renderInventoryItem}
                style={styles.inventoryList}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => loadInventory(true)}
                    colors={['#2563eb']}
                  />
                }
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <MaterialIcons name="inventory-2" size={48} color="#9ca3af" />
                    <Text style={styles.emptyStateTitle}>
                      {searchQuery ? 'No items found' : 'No inventory available'}
                    </Text>
                    <Text style={styles.emptyStateText}>
                      {searchQuery ? 'Try a different search term' : 'Add items to inventory to get started'}
                    </Text>
                  </View>
                }
              />
            </View>
            
            {/* Cart Section */}
            {cart.length > 0 && (
              <View style={styles.cartSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Cart ({cart.length})</Text>
                </View>
                
                <FlatList
                  data={cart}
                  keyExtractor={(item) => item.cartId || item.id}
                  renderItem={renderCartItem}
                  style={styles.cartList}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  
  // Loading and error states
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
  
  // No store state
  noStoreContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noStoreTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  noStoreMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Offline indicator
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  offlineText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '500',
    marginLeft: 8,
  },
  
  // Search bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#1f2937',
  },
  refreshButton: {
    marginLeft: 8,
    padding: 8,
  },
  
  // Cart summary
  cartSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eff6ff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  cartSummaryLeft: {
    flex: 1,
  },
  cartSummaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  cartSummaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearCartButton: {
    padding: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  checkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  checkoutButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Main content
  mainContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  
  // Section headers
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  
  // Inventory section
  inventorySection: {
    flex: 1,
  },
  inventoryList: {
    flex: 1,
  },
  inventoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  outOfStockItem: {
    opacity: 0.5,
    backgroundColor: '#f9fafb',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  itemCategory: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
    marginBottom: 4,
  },
  itemStock: {
    fontSize: 14,
    color: '#6b7280',
  },
  lowStockText: {
    color: '#f59e0b',
    fontWeight: '500',
  },
  outOfStockText: {
    color: '#ef4444',
  },
  itemActions: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cartIndicator: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  cartIndicatorText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Cart section
  cartSection: {
    maxHeight: 300,
    marginTop: 16,
  },
  cartList: {
    flex: 1,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  cartItemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  cartItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  quantityButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    paddingHorizontal: 12,
    minWidth: 40,
    textAlign: 'center',
  },
  removeButton: {
    padding: 8,
  },
  
  // Empty states
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
});
