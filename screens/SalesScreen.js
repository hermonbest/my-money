import { useFocusEffect } from "@react-navigation/native";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../utils/supabase";
import { useStore } from "../contexts/StoreContext";
import { useLanguage } from "../contexts/LanguageContext";
// Removed useNetwork import - using direct offlineManager
import { offlineManager } from "../utils/OfflineManager";
import { formatCurrency } from "../utils/helpers";
import { getTranslation } from "../utils/translations";
import { offlineDataService } from "../utils/OfflineDataService";
import { getCurrentUser, getUserProfile } from "../utils/authUtils";
import { handleSaleError, showErrorAlert, showSuccessAlert } from "../utils/errorHandling";
import StoreSelector from "../components/StoreSelector";

export default function SalesScreen({ navigation }) {
  const { language } = useLanguage();
  // Get network status directly from offlineManager
  const isOnline = offlineManager.isConnected();
  const [inventory, setInventory] = useState([]);
  const [sales, setSales] = useState([]);
  const [cart, setCart] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [showStoreSelector, setShowStoreSelector] = useState(false);
  const { selectedStore, userRole, selectStore } = useStore();
  
  // Sale completion states
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [completingSale, setCompletingSale] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' or 'history'
  
  // Search state
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [salesSearchQuery, setSalesSearchQuery] = useState('');

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: 'money' },
    { value: 'card', label: 'Card', icon: 'credit-card' },
    { value: 'bank_transfer', label: 'Bank Transfer', icon: 'account-balance' },
    { value: 'check', label: 'Check', icon: 'description' },
    { value: 'other', label: 'Other', icon: 'more-horiz' },
  ];

  const loadData = async () => {
    try {
      setError(null);
      setLoading(true);
      
      // Get current user
      const { user, error: userError } = await getCurrentUser();
      
      if (userError || !user) {
        throw new Error('User not authenticated');
      }
      setUser(user);

      // Use selectedStore from context for consistency with finalizeSale
      const storeId = selectedStore?.id || null;
      console.log('🔍 Loading data with selectedStore ID:', storeId, 'userRole:', userRole);
      const [inventoryData, salesData] = await Promise.all([
        offlineDataService.getInventory(storeId, user.id, userRole),
        offlineDataService.getSales(storeId, user.id, userRole)
      ]);
      
      console.log('🔍 Loaded inventory items:', inventoryData?.length || 0);
      console.log('🔍 Loaded sales items:', salesData?.length || 0);
      
      // If no inventory found and we're using user.id, try with selectedStore?.id as fallback
      if ((!inventoryData || inventoryData.length === 0) && storeId === user.id && selectedStore?.id) {
        console.log('🔍 No inventory found with user.id, trying selectedStore.id as fallback');
        const fallbackInventory = await offlineDataService.getInventory(selectedStore.id, user.id, userRole);
        if (fallbackInventory && fallbackInventory.length > 0) {
          console.log('🔍 Found inventory with selectedStore.id fallback:', fallbackInventory.length);
          setInventory(fallbackInventory);
        } else {
          setInventory(inventoryData || []);
        }
      } else {
        setInventory(inventoryData || []);
      }
      
      setSales(salesData || []);
      
    } catch (error) {
      const errorMessage = handleSaleError(error, 'Loading sales data');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [selectedStore, userRole]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleStoreSelect = (store) => {
    selectStore(store);
  };

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount).toFixed(2)}`;
  };

  const addToCart = (item) => {
    if (item.quantity <= 0) {
      Alert.alert('Out of Stock', 'This item is currently out of stock.');
      return;
    }

    const existingItem = cart.find(cartItem => cartItem.id === item.id);
    
    if (existingItem) {
      // Calculate available stock: original quantity minus what's already in cart
      const alreadyInCart = existingItem.quantity;
      const availableStock = item.quantity - alreadyInCart;
      
      if (availableStock <= 0) {
        Alert.alert('Insufficient Stock', `Only ${availableStock} units available.`);
        return;
      }
      
      setCart(prev => 
        prev.map(cartItem => 
          cartItem.id === item.id 
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        )
      );
    } else {
      // Check if there's at least 1 unit available
      if (item.quantity <= 0) {
        Alert.alert('Insufficient Stock', 'No units available.');
        return;
      }
      setCart(prev => [...prev, {
        ...item,
        quantity: 1,
        unit_price: item.selling_price
      }]);
    }
  };

  const removeFromCart = (itemId) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const updateCartQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    const cartItem = cart.find(cartItem => cartItem.id === itemId);
    if (!cartItem) {
      Alert.alert('Error', 'Item not found in cart');
      return;
    }

    // Find the original inventory item to get total stock
    const inventoryItem = inventory.find(inv => inv.id === itemId);
    if (!inventoryItem) {
      Alert.alert('Error', 'Item not found in inventory');
      return;
    }

    // Calculate available stock: original quantity minus what's already in cart (excluding current item)
    const otherItemsInCart = cart.filter(cartItem => cartItem.id !== itemId);
    const alreadyInCart = otherItemsInCart.reduce((sum, item) => sum + item.quantity, 0);
    const availableStock = inventoryItem.quantity - alreadyInCart;
    
    if (newQuantity > availableStock) {
      Alert.alert('Insufficient Stock', `Only ${availableStock} units available.`);
      return;
    }

    setCart(prev => 
      prev.map(cartItem => 
        cartItem.id === itemId 
          ? { ...cartItem, quantity: newQuantity }
          : cartItem
      )
    );
  };

  const calculateSubtotal = () => {
    return cart.reduce((total, item) => total + (item.quantity * item.unit_price), 0);
  };

  const calculateTotal = () => {
    return calculateSubtotal(); // No tax calculation
  };

  // Filter functions for search
  const getFilteredInventory = () => {
    if (inventorySearchQuery.trim() === '') return inventory;
    return inventory.filter(item => 
      item.name?.toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
      item.category?.toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(inventorySearchQuery.toLowerCase())
    );
  };

  const getFilteredSales = () => {
    if (salesSearchQuery.trim() === '') return sales;
    return sales.filter(sale => 
      sale.sale_number?.toLowerCase().includes(salesSearchQuery.toLowerCase()) ||
      sale.customer_name?.toLowerCase().includes(salesSearchQuery.toLowerCase()) ||
      sale.payment_method?.toLowerCase().includes(salesSearchQuery.toLowerCase()) ||
      sale.sale_items?.some(item => 
        item.item_name?.toLowerCase().includes(salesSearchQuery.toLowerCase())
      )
    );
  };

  const generateSaleNumber = () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `SALE-${dateStr}-${timeStr}`;
  };

  const handleDeleteSale = async (sale) => {
    Alert.alert(
      'Delete Sale',
      `Are you sure you want to delete sale #${sale.sale_number}?\n\nThis will:\n• Restore inventory quantities\n• Remove from revenue calculations\n• This action cannot be undone`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSale(sale)
        }
      ]
    );
  };

  const deleteSale = async (sale) => {
    try {
      console.log('Starting sale deletion process for sale:', sale.id);
      
      // First, get all sale items to restore inventory
      const { data: saleItems, error: itemsError } = await supabase
        .from('sale_items')
        .select('inventory_id, quantity, item_name')
        .eq('sale_id', sale.id);

      if (itemsError) {
        throw new Error(`Failed to fetch sale items: ${itemsError.message}`);
      }

      console.log('Found sale items to restore:', saleItems);

      // Restore inventory quantities
      if (saleItems && saleItems.length > 0) {
        console.log('Restoring inventory quantities...');
        
        for (const item of saleItems) {
          try {
            // Get current inventory quantity
            const { data: currentItem, error: fetchError } = await supabase
              .from('inventory')
              .select('quantity, name')
              .eq('id', item.inventory_id)
              .single();

            if (fetchError) {
              console.error(`Failed to fetch current quantity for ${item.item_name}:`, fetchError);
              continue;
            }

            // Calculate new quantity (add back the sold quantity)
            const newQuantity = currentItem.quantity + item.quantity;
            
            // Update inventory
            const { error: updateError } = await supabase
              .from('inventory')
              .update({ 
                quantity: newQuantity,
                updated_at: new Date().toISOString()
              })
              .eq('id', item.inventory_id);

            if (updateError) {
              console.error(`Failed to restore inventory for ${item.item_name}:`, updateError);
            } else {
              console.log(`✅ Restored ${item.item_name}: ${currentItem.quantity} -> ${newQuantity} (+${item.quantity})`);
            }
          } catch (itemError) {
            console.error(`Error restoring item ${item.item_name}:`, itemError);
          }
        }
      }

      // Delete sale items first (due to foreign key constraints)
      const { error: deleteItemsError } = await supabase
        .from('sale_items')
        .delete()
        .eq('sale_id', sale.id);

      if (deleteItemsError) {
        throw new Error(`Failed to delete sale items: ${deleteItemsError.message}`);
      }

      console.log('Sale items deleted successfully');

      // Delete the sale record
      const { error: deleteSaleError } = await supabase
        .from('sales')
        .delete()
        .eq('id', sale.id);

      if (deleteSaleError) {
        throw new Error(`Failed to delete sale: ${deleteSaleError.message}`);
      }

      console.log('Sale deleted successfully');

      // Reload data to reflect changes
      await loadData();

      Alert.alert(
        'Sale Deleted',
        `Sale #${sale.sale_number} has been deleted successfully.\n\nInventory quantities have been restored.`,
        [{ text: 'OK' }]
      );

    } catch (error) {
      console.error('Error deleting sale:', error);
      Alert.alert(
        'Delete Failed',
        `Failed to delete sale: ${error.message}`,
        [{ text: 'OK' }]
      );
    }
  };

  // ... existing code ...

const finalizeSale = async () => {
  if (cart.length === 0) {
    Alert.alert('Empty Cart', 'Please add items to cart before completing sale.');
    return;
  }

  if (!paymentMethod) {
    Alert.alert('Validation Error', 'Please select a payment method');
    return;
  }

  setCompletingSale(true);
  
  try {
    const subtotal = calculateSubtotal();
    const grandTotal = calculateTotal();

    console.log('Starting offline-aware sale completion...', {
      subtotal,
      grandTotal,
      itemCount: cart.length,
      isOnline
    });

    // Get user's profile and role using offline-aware method
    const profile = await getUserProfile(user.id);

    if (!profile) {
      Alert.alert('Error', 'User profile not found');
      return;
    }

    // Handle different user roles - use selectedStore from context for consistency
    let storeId = null;
    
    if (profile.role === 'owner') {
      // For owners, use the selectedStore from context, not profile.store_id
      storeId = selectedStore?.id || null;
      console.log('🔍 Owner using selectedStore ID:', storeId);
    } else if (profile.role === 'worker' && profile.store_id) {
      storeId = profile.store_id;
    } else if (profile.role === 'individual') {
      storeId = null;
    } else {
      Alert.alert('Error', 'No store associated with your account. Please contact your administrator.');
      return;
    }

    // Prepare sale data
    const saleNumber = generateSaleNumber();
    const saleData = {
      user_id: user.id,
      sale_number: saleNumber,
      customer_name: customerName.trim() || null,
      customer_email: null,
      customer_phone: null,
      subtotal: grandTotal,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: grandTotal,
      payment_method: paymentMethod,
      payment_status: 'paid',
      store_id: storeId,
    };

    // Prepare sale items
    const saleItems = cart.map(item => ({
      inventory_id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));

    // Use offline data service to process sale
    const result = await offlineDataService.processSale(saleData, saleItems, profile.role);

    console.log('Sale completed successfully:', result);

    // Clear cart and close modal
    setCart([]);
    setShowSaleModal(false);
    setCustomerName('');
    setPaymentMethod('cash');

    // Reload data to show updated sales and inventory
    await loadData();

    // Show success message with offline status
    const offlineMessage = !isOnline ? '\n\n⚠️ This sale will sync when you\'re back online.' : '';
    Alert.alert(
      'Sale Completed Successfully!',
      `Sale #${result.sale_number || 'Pending'} has been completed.\n\nTotal: ${formatCurrency(result.total_amount)}\nPayment: ${paymentMethods.find(pm => pm.value === paymentMethod)?.label}${offlineMessage}`,
      [{ text: 'OK' }]
    );

  } catch (error) {
    console.error('Error completing sale:', error);
    
    const offlineMessage = !isOnline ? '\n\n⚠️ You\'re currently offline. The sale will be processed when you\'re back online.' : '';
    Alert.alert(
      'Sale Processing',
      `Sale has been queued for processing.${offlineMessage}\n\nPlease check your sales history to confirm the sale was processed.`
    );
  } finally {
    setCompletingSale(false);
  }
};

  // Keep the old function name for backward compatibility
  const handleCompleteSale = finalizeSale;

  const renderInventoryItem = ({ item }) => {
    const cartItem = cart.find(cartItem => cartItem.id === item.id);
    const isInCart = !!cartItem;
    const isOutOfStock = item.quantity <= 0;

    return (
      <View style={[styles.inventoryCard, isOutOfStock && styles.outOfStockCard]}>
        <View style={styles.itemHeader}>
          <View style={styles.itemInfo}>
            <Text style={[styles.itemName, isOutOfStock && styles.outOfStockText]}>
              {item.name}
            </Text>
            <Text style={styles.itemCategory}>{item.category}</Text>
          </View>
          <View style={styles.stockInfo}>
            <Text style={[styles.stockText, isOutOfStock && styles.outOfStockText]}>
              Stock: {item.quantity}
            </Text>
            <Text style={styles.priceText}>{formatCurrency(item.selling_price)}</Text>
          </View>
        </View>

        {item.description && (
          <Text style={styles.itemDescription}>{item.description}</Text>
        )}

        <View style={styles.itemActions}>
          {isInCart ? (
            <View style={styles.quantityControls}>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => updateCartQuantity(item.id, cartItem.quantity - 1)}
              >
                <MaterialIcons name="remove" size={20} color="#ef4444" />
              </TouchableOpacity>
              <Text style={styles.quantityText}>{cartItem.quantity}</Text>
              <TouchableOpacity
                style={styles.quantityButton}
                onPress={() => updateCartQuantity(item.id, cartItem.quantity + 1)}
                disabled={cartItem.quantity >= item.quantity}
              >
                <MaterialIcons name="add" size={20} color="#059669" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.addButton, isOutOfStock && styles.disabledButton]}
              onPress={() => addToCart(item)}
              disabled={isOutOfStock}
            >
              <MaterialIcons name="add-shopping-cart" size={20} color="#ffffff" />
              <Text style={styles.addButtonText}>
                {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemInfo}>
        <Text style={styles.cartItemName}>{item.name}</Text>
        <Text style={styles.cartItemPrice}>{formatCurrency(item.unit_price)} each</Text>
      </View>
      <View style={styles.cartItemActions}>
        <View style={styles.cartQuantityControls}>
          <TouchableOpacity
            style={styles.cartQuantityButton}
            onPress={() => updateCartQuantity(item.id, item.quantity - 1)}
          >
            <MaterialIcons name="remove" size={16} color="#ef4444" />
          </TouchableOpacity>
          <Text style={styles.cartQuantityText}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.cartQuantityButton}
            onPress={() => updateCartQuantity(item.id, item.quantity + 1)}
            disabled={item.quantity >= item.quantity}
          >
            <MaterialIcons name="add" size={16} color="#059669" />
          </TouchableOpacity>
        </View>
        <Text style={styles.cartItemTotal}>
          {formatCurrency(item.quantity * item.unit_price)}
        </Text>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => removeFromCart(item.id)}
        >
          <MaterialIcons name="close" size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSaleItem = ({ item }) => {
    const totalItems = item.sale_items?.reduce((sum, saleItem) => sum + saleItem.quantity, 0) || 0;
    const totalProfit = item.sale_items?.reduce((sum, saleItem) => {
      const profit = (saleItem.unit_price - saleItem.cost_price) * saleItem.quantity;
      return sum + profit;
    }, 0) || 0;

    return (
      <View style={styles.saleCard}>
        <View style={styles.saleHeader}>
          <View style={styles.saleInfo}>
            <Text style={styles.saleTitle}>{item.sale_number}</Text>
            <Text style={styles.saleDate}>
              {new Date(item.sale_date).toLocaleDateString()} at {new Date(item.sale_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </Text>
          </View>
          <View style={styles.saleAmount}>
            <Text style={styles.amountText}>{formatCurrency(item.total_amount)}</Text>
            <Text style={styles.profitText}>Profit: {formatCurrency(totalProfit)}</Text>
          </View>
          <TouchableOpacity 
            style={styles.deleteButton}
            onPress={() => handleDeleteSale(item)}
          >
            <MaterialIcons name="delete" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>

        <View style={styles.saleDetails}>
          {item.customer_name && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Customer:</Text>
              <Text style={styles.detailValue}>{item.customer_name}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment:</Text>
            <Text style={styles.detailValue}>{item.payment_method}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Items:</Text>
            <Text style={styles.detailValue}>{totalItems} units ({item.sale_items?.length || 0} products)</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total:</Text>
            <Text style={styles.detailValue}>{formatCurrency(item.total_amount)}</Text>
          </View>
        </View>

        {/* Sale Items Breakdown */}
        {item.sale_items && item.sale_items.length > 0 && (
          <View style={styles.saleItemsBreakdown}>
            <Text style={styles.breakdownTitle}>Items Sold:</Text>
            {item.sale_items.map((saleItem, index) => (
              <View key={`${item.id || 'temp'}_${saleItem.inventory_id || index}`} style={styles.saleItemRow}>
                <Text style={styles.saleItemName}>{saleItem.item_name}</Text>
                <View style={styles.saleItemDetails}>
                  <Text style={styles.saleItemQuantity}>Qty: {saleItem.quantity}</Text>
                  <Text style={styles.saleItemPrice}>{formatCurrency(saleItem.unit_price)}</Text>
                  <Text style={styles.saleItemTotal}>{formatCurrency(saleItem.line_total)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderPaymentMethod = (method) => (
    <TouchableOpacity
      style={[
        styles.paymentMethod,
        paymentMethod === method.value && styles.paymentMethodSelected
      ]}
      onPress={() => setPaymentMethod(method.value)}
    >
      <MaterialIcons 
        name={method.icon} 
        size={20} 
        color={paymentMethod === method.value ? '#2563eb' : '#6b7280'} 
      />
      <Text style={[
        styles.paymentMethodText,
        paymentMethod === method.value && styles.paymentMethodTextSelected
      ]}>
        {method.label}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading sales data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>Error Loading Data</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadData}>
          <MaterialIcons name="refresh" size={20} color="#ffffff" />
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>
            {userRole === 'owner' && selectedStore ? `${getTranslation('sales', language)} - ${selectedStore.name}` : getTranslation('sales', language)}
          </Text>
          {userRole === 'owner' && (
            <TouchableOpacity
              style={styles.storeSelectorButton}
              onPress={() => setShowStoreSelector(true)}
            >
              <MaterialIcons name="store" size={20} color="#2563eb" />
              <Text style={styles.storeSelectorText}>{getTranslation('changeStore', language)}</Text>
            </TouchableOpacity>
          )}
          {!isOnline && (
            <View style={styles.offlineIndicator}>
              <MaterialIcons name="wifi-off" size={16} color="#ef4444" />
              <Text style={styles.offlineText}>Offline Mode</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          {activeTab === 'inventory' && cart.length > 0 && (
            <TouchableOpacity
              style={styles.cartButton}
              onPress={() => setShowSaleModal(true)}
            >
              <MaterialIcons name="shopping-cart" size={20} color="#ffffff" />
              <Text style={styles.cartButtonText}>Cart ({cart.length})</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'inventory' && styles.activeTab]}
          onPress={() => setActiveTab('inventory')}
        >
          <Text style={[styles.tabText, activeTab === 'inventory' && styles.activeTabText]}>
            Inventory
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            Sales History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#6b7280" />
        <TextInput
          style={styles.searchInput}
          placeholder={activeTab === 'inventory' ? 'Search inventory by name, category...' : 'Search sales by number, customer, items...'}
          value={activeTab === 'inventory' ? inventorySearchQuery : salesSearchQuery}
          onChangeText={activeTab === 'inventory' ? setInventorySearchQuery : setSalesSearchQuery}
        />
        {(activeTab === 'inventory' ? inventorySearchQuery : salesSearchQuery).length > 0 && (
          <TouchableOpacity
            onPress={() => activeTab === 'inventory' ? setInventorySearchQuery('') : setSalesSearchQuery('')}
            style={styles.clearSearchButton}
          >
            <MaterialIcons name="clear" size={20} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {activeTab === 'inventory' ? (
        <FlatList
          data={getFilteredInventory()}
          renderItem={renderInventoryItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <MaterialIcons name="inventory-2" size={64} color="#9ca3af" />
              <Text style={styles.emptyTitle}>
                {inventorySearchQuery ? 'No items match your search' : 'No Inventory Items'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {inventorySearchQuery ? 'Try adjusting your search terms' : 'Add inventory items to start selling'}
              </Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={getFilteredSales()}
          renderItem={renderSaleItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <MaterialIcons name="receipt" size={64} color="#9ca3af" />
              <Text style={styles.emptyTitle}>
                {salesSearchQuery ? 'No sales match your search' : 'No Sales Recorded'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {salesSearchQuery ? 'Try adjusting your search terms' : 'Complete your first sale to see it here'}
              </Text>
            </View>
          )}
        />
      )}

      {/* Sale Completion Modal */}
      <Modal
        visible={showSaleModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <KeyboardAvoidingView 
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Complete Sale</Text>
            <TouchableOpacity onPress={() => setShowSaleModal(false)}>
              <MaterialIcons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Cart Items */}
            <View style={styles.cartSection}>
              <Text style={styles.sectionTitle}>Items in Cart</Text>
              {cart.map((item) => (
                <View key={item.id} style={styles.cartItem}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    <Text style={styles.cartItemPrice}>{formatCurrency(item.unit_price)} each</Text>
                  </View>
                  <View style={styles.cartItemActions}>
                    <View style={styles.cartQuantityControls}>
                      <TouchableOpacity
                        style={styles.cartQuantityButton}
                        onPress={() => updateCartQuantity(item.id, item.quantity - 1)}
                      >
                        <MaterialIcons name="remove" size={16} color="#ef4444" />
                      </TouchableOpacity>
                      <Text style={styles.cartQuantityText}>{item.quantity}</Text>
                      <TouchableOpacity
                        style={styles.cartQuantityButton}
                        onPress={() => updateCartQuantity(item.id, item.quantity + 1)}
                        disabled={item.quantity >= item.quantity}
                      >
                        <MaterialIcons name="add" size={16} color="#059669" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.cartItemTotal}>
                      {formatCurrency(item.quantity * item.unit_price)}
                    </Text>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeFromCart(item.id)}
                    >
                      <MaterialIcons name="close" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            {/* Totals */}
            <View style={styles.totalsSection}>
              <View style={[styles.totalRow, styles.grandTotalRow]}>
                <Text style={styles.grandTotalLabel}>Total:</Text>
                <Text style={styles.grandTotalAmount}>{formatCurrency(calculateTotal())}</Text>
              </View>
            </View>

            {/* Customer Information */}
            <View style={styles.customerSection}>
              <Text style={styles.sectionTitle}>Customer Information</Text>
              <TextInput
                style={styles.input}
                placeholder="Customer name (optional)"
                value={customerName}
                onChangeText={setCustomerName}
                autoCapitalize="words"
              />
            </View>

            {/* Payment Method */}
            <View style={styles.paymentSection}>
              <Text style={styles.sectionTitle}>Payment Method</Text>
              <View style={styles.paymentMethods}>
                {paymentMethods.map((method) => (
                  <View key={method.value}>
                    {renderPaymentMethod(method)}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Complete Sale Button */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.completeButton, completingSale && styles.completeButtonDisabled]}
              onPress={handleCompleteSale}
              disabled={completingSale}
            >
              {completingSale ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={20} color="#ffffff" />
                  <Text style={styles.completeButtonText}>Complete Sale</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      <StoreSelector
        visible={showStoreSelector}
        onClose={() => setShowStoreSelector(false)}
        onStoreSelect={handleStoreSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6b7280",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1f2937",
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563eb",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  header: {
    backgroundColor: "#ffffff",
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  storeSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  storeSelectorText: {
    fontSize: 12,
    color: "#2563eb",
    marginLeft: 4,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  cartButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  cartButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#2563eb",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  activeTabText: {
    color: "#2563eb",
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#1f2937',
    paddingVertical: 8,
  },
  clearSearchButton: {
    padding: 4,
    marginLeft: 8,
  },
  listContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  inventoryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  outOfStockCard: {
    opacity: 0.6,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  outOfStockText: {
    color: "#9ca3af",
  },
  itemCategory: {
    fontSize: 14,
    color: "#6b7280",
  },
  stockInfo: {
    alignItems: "flex-end",
  },
  stockText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  priceText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#059669",
  },
  itemDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
    fontStyle: "italic",
  },
  itemActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  disabledButton: {
    backgroundColor: "#9ca3af",
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    minWidth: 24,
    textAlign: "center",
  },
  saleCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  saleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  saleInfo: {
    flex: 1,
  },
  saleTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  saleDate: {
    fontSize: 14,
    color: "#6b7280",
  },
  saleAmount: {
    alignItems: "flex-end",
  },
  amountText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#10b981",
  },
  saleDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  profitText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#059669",
    marginTop: 2,
  },
  saleItemsBreakdown: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  saleItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  saleItemName: {
    fontSize: 13,
    color: "#6b7280",
    flex: 1,
  },
  saleItemDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  saleItemQuantity: {
    fontSize: 12,
    color: "#6b7280",
  },
  saleItemPrice: {
    fontSize: 12,
    color: "#6b7280",
  },
  saleItemTotal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    minWidth: 50,
    textAlign: "right",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1f2937",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  cartSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  cartItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 14,
    color: "#6b7280",
  },
  cartItemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cartQuantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cartQuantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  cartQuantityText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    minWidth: 20,
    textAlign: "center",
  },
  cartItemTotal: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    minWidth: 60,
    textAlign: "right",
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
  },
  totalsSection: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6b7280",
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    paddingTop: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  grandTotalAmount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#059669",
  },
  customerSection: {
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  paymentSection: {
    marginBottom: 20,
  },
  paymentMethods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  paymentMethod: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
    minWidth: "45%",
  },
  paymentMethodSelected: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  paymentMethodText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  paymentMethodTextSelected: {
    color: "#2563eb",
  },
  modalFooter: {
    padding: 20,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  completeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#059669",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  completeButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  completeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  offlineText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '500',
    marginLeft: 4,
  },
});