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
      Alert.alert(getTranslation('outOfStock', language), getTranslation('itemOutOfStock', language));
      return;
    }

    const existingItem = cart.find(cartItem => cartItem.id === item.id);
    
    if (existingItem) {
      // Calculate available stock: original quantity minus what's already in cart
      const alreadyInCart = existingItem.quantity;
      const availableStock = item.quantity - alreadyInCart;
      
      if (availableStock <= 0) {
        Alert.alert(getTranslation('insufficientStock', language), `${getTranslation('onlyUnitsAvailable', language)} ${availableStock}.`);
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
        Alert.alert(getTranslation('insufficientStock', language), getTranslation('noUnitsAvailable', language));
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
      Alert.alert(getTranslation('error', language), getTranslation('itemNotFoundInCart', language));
      return;
    }

    // Find the original inventory item to get total stock
    const inventoryItem = inventory.find(inv => inv.id === itemId);
    if (!inventoryItem) {
      Alert.alert(getTranslation('error', language), getTranslation('itemNotFoundInInventory', language));
      return;
    }

    // Calculate available stock: original quantity minus what's already in cart (excluding current item)
    const otherItemsInCart = cart.filter(cartItem => cartItem.id !== itemId);
    const alreadyInCart = otherItemsInCart.reduce((sum, item) => sum + item.quantity, 0);
    const availableStock = inventoryItem.quantity - alreadyInCart;
    
    if (newQuantity > availableStock) {
      Alert.alert(getTranslation('insufficientStock', language), `${getTranslation('onlyUnitsAvailable', language)} ${availableStock}.`);
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
      getTranslation('deleteSale', language),
      `${getTranslation('confirmDeleteSale', language)} #${sale.sale_number}?\n\n${getTranslation('thisWill', language)}:\n• ${getTranslation('restoreInventoryQuantities', language)}\n• ${getTranslation('removeFromRevenue', language)}\n• ${getTranslation('operationCannotBeUndone', language)}`,
      [
        { text: getTranslation('cancel', language), style: 'cancel' },
        {
          text: getTranslation('delete', language),
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
        throw new Error(`${getTranslation('failedToFetchSaleItems', language)}: ${itemsError.message}`);
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
              console.error(`${getTranslation('failedToFetchCurrentQuantity', language)} ${item.item_name}:`, fetchError);
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
              console.error(`${getTranslation('failedToRestoreInventory', language)} ${item.item_name}:`, updateError);
            } else {
              console.log(`✅ ${getTranslation('restored', language)} ${item.item_name}: ${currentItem.quantity} -> ${newQuantity} (+${item.quantity})`);
            }
          } catch (itemError) {
            console.error(`${getTranslation('errorRestoringItem', language)} ${item.item_name}:`, itemError);
          }
        }
      }

      // Delete sale items first (due to foreign key constraints)
      const { error: deleteItemsError } = await supabase
        .from('sale_items')
        .delete()
        .eq('sale_id', sale.id);

      if (deleteItemsError) {
        throw new Error(`${getTranslation('failedToDeleteSaleItems', language)}: ${deleteItemsError.message}`);
      }

      console.log('Sale items deleted successfully');

      // Delete the sale record
      const { error: deleteSaleError } = await supabase
        .from('sales')
        .delete()
        .eq('id', sale.id);

      if (deleteSaleError) {
        throw new Error(`${getTranslation('failedToDeleteSale', language)}: ${deleteSaleError.message}`);
      }

      console.log('Sale deleted successfully');

      // Reload data to reflect changes
      await loadData();

      Alert.alert(
        getTranslation('saleDeleted', language),
        `${getTranslation('saleDeletedSuccessfully', language)} #${sale.sale_number}.\n\n${getTranslation('inventoryQuantitiesRestored', language)}.`,
        [{ text: getTranslation('ok', language) }]
      );

    } catch (error) {
      console.error('Error deleting sale:', error);
      Alert.alert(
        getTranslation('deleteFailed', language),
        `${getTranslation('failedToDeleteSale', language)}: ${error.message}`,
        [{ text: getTranslation('ok', language) }]
      );
    }
  };

  const finalizeSale = async () => {
    if (cart.length === 0) {
      Alert.alert(getTranslation('emptyCart', language), getTranslation('addItemToCart', language));
      return;
    }

    if (!paymentMethod) {
      Alert.alert(getTranslation('validationError', language), getTranslation('selectPaymentMethod', language));
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
        Alert.alert(getTranslation('error', language), getTranslation('userProfileNotFound', language));
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
        Alert.alert(getTranslation('error', language), getTranslation('noStoreAssociated', language));
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
      const offlineMessage = !isOnline ? `\n\n⚠️ ${getTranslation('saleWillSync', language)}.` : '';
      Alert.alert(
        getTranslation('saleCompletedSuccessfully', language),
        `${getTranslation('sale', language)} #${result.sale_number || getTranslation('pending', language)} ${getTranslation('completedSuccessfully', language)}.\n\n${getTranslation('total', language)}: ${formatCurrency(result.total_amount)}\n${getTranslation('payment', language)}: ${paymentMethods.find(pm => pm.value === paymentMethod)?.label}${offlineMessage}`,
        [{ text: getTranslation('ok', language) }]
      );

    } catch (error) {
      console.error('Error completing sale:', error);
    
      const offlineMessage = !isOnline ? `\n\n⚠️ ${getTranslation('currentlyOffline', language)}. ${getTranslation('saleWillProcess', language)}.` : '';
      Alert.alert(
        getTranslation('saleProcessing', language),
        `${getTranslation('saleQueued', language)}.${offlineMessage}\n\n${getTranslation('checkSalesHistory', language)}.`
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
              {getTranslation('stock', language)}: {item.quantity}
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
                {isOutOfStock ? getTranslation('outOfStock', language) : getTranslation('addToCart', language)}
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
        <Text style={styles.loadingText}>{getTranslation('loading', language)} {getTranslation('sales', language).toLowerCase()} {getTranslation('data', language).toLowerCase()}...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>{getTranslation('error', language)} {getTranslation('loading', language)} {getTranslation('data', language)}</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadData}>
          <MaterialIcons name="refresh" size={20} color="#ffffff" />
          <Text style={styles.retryButtonText}>{getTranslation('retry', language)}</Text>
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
              <Text style={styles.offlineText}>{getTranslation('offlineMode', language)}</Text>
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
              <Text style={styles.cartButtonText}>{getTranslation('cart', language)} ({cart.length})</Text>
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
            {getTranslation('inventory', language)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            {getTranslation('salesHistory', language)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#6b7280" />
        <TextInput
          style={styles.searchInput}
          placeholder={activeTab === 'inventory' ? getTranslation('searchInventory', language) : getTranslation('searchSales', language)}
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
                {inventorySearchQuery ? getTranslation('noItemsMatchSearch', language) : getTranslation('noInventoryItems', language)}
              </Text>
              <Text style={styles.emptySubtitle}>
                {inventorySearchQuery ? getTranslation('adjustSearchTerms', language) : getTranslation('addInventoryItems', language)}
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
                {salesSearchQuery ? getTranslation('noSalesMatchSearch', language) : getTranslation('noSalesRecorded', language)}
              </Text>
              <Text style={styles.emptySubtitle}>
                {salesSearchQuery ? getTranslation('adjustSearchTerms', language) : getTranslation('completeFirstSale', language)}
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
            <Text style={styles.modalTitle}>{getTranslation('completeSale', language)}</Text>
            <TouchableOpacity onPress={() => setShowSaleModal(false)}>
              <MaterialIcons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Cart Items */}
            <View style={styles.cartSection}>
              <Text style={styles.sectionTitle}>{getTranslation('itemsInCart', language)}</Text>
              {cart.map((item) => (
                <View key={item.id} style={styles.cartItem}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    <Text style={styles.cartItemPrice}>{formatCurrency(item.unit_price)} {getTranslation('each', language)}</Text>
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
                      >
                        <MaterialIcons name="add" size={16} color="#059669" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.cartItemTotal}>
                      {formatCurrency(item.quantity * item.unit_price)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Totals */}
            <View style={styles.totalsSection}>
              <View style={[styles.totalRow, styles.grandTotalRow]}>
                <Text style={styles.grandTotalLabel}>{getTranslation('total', language)}:</Text>
                <Text style={styles.grandTotalAmount}>{formatCurrency(calculateTotal())}</Text>
              </View>
            </View>

            {/* Customer Information */}
            <View style={styles.customerSection}>
              <Text style={styles.sectionTitle}>{getTranslation('customerInformation', language)}</Text>
              <TextInput
                style={styles.input}
                placeholder={getTranslation('customerNameOptional', language)}
                value={customerName}
                onChangeText={setCustomerName}
                autoCapitalize="words"
              />
            </View>

            {/* Payment Method */}
            <View style={styles.paymentSection}>
              <Text style={styles.sectionTitle}>{getTranslation('paymentMethod', language)}</Text>
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
                  <Text style={styles.completeButtonText}>{getTranslation('completeSale', language)}</Text>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  storeSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  storeSelectorText: {
    fontSize: 14,
    color: "#3b82f6",
    marginLeft: 6,
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
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cartButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  tab: {
    flex: 1,
    paddingVertical: 18,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#3b82f6",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#94a3b8",
  },
  activeTabText: {
    color: "#3b82f6",
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    marginLeft: 14,
    fontSize: 16,
    color: '#0f172a',
    paddingVertical: 8,
  },
  clearSearchButton: {
    padding: 6,
    marginLeft: 10,
  },
  listContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  inventoryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  outOfStockCard: {
    opacity: 0.7,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  outOfStockText: {
    color: "#94a3b8",
  },
  itemCategory: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "500",
  },
  stockInfo: {
    alignItems: "flex-end",
  },
  stockText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 6,
  },
  priceText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#059669",
  },
  itemDescription: {
    fontSize: 15,
    color: "#64748b",
    marginBottom: 16,
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
    backgroundColor: "#3b82f6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  disabledButton: {
    backgroundColor: "#cbd5e1",
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  quantityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  quantityText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    minWidth: 28,
    textAlign: "center",
  },
  saleCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  saleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  saleInfo: {
    flex: 1,
  },
  saleTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  saleDate: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "500",
  },
  saleAmount: {
    alignItems: "flex-end",
  },
  amountText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#059669",
  },
  saleDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#334155",
  },
  profitText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#059669",
    marginTop: 4,
  },
  saleItemsBreakdown: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 12,
  },
  saleItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  saleItemName: {
    fontSize: 14,
    color: "#64748b",
    flex: 1,
  },
  saleItemDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  saleItemQuantity: {
    fontSize: 13,
    color: "#64748b",
  },
  saleItemPrice: {
    fontSize: 13,
    color: "#64748b",
  },
  saleItemTotal: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    minWidth: 55,
    textAlign: "right",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 20,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 30,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  cartSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 20,
  },
  cartItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 14,
    color: "#64748b",
  },
  cartItemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  cartQuantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartQuantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cartQuantityText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    minWidth: 24,
    textAlign: "center",
  },
  cartItemTotal: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
    minWidth: 70,
    textAlign: "right",
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  totalsSection: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#64748b",
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 16,
    marginTop: 12,
    marginBottom: 0,
  },
  grandTotalLabel: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
  },
  grandTotalAmount: {
    fontSize: 22,
    fontWeight: "700",
    color: "#059669",
  },
  customerSection: {
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  paymentSection: {
    marginBottom: 24,
  },
  paymentMethods: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  paymentMethod: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    minWidth: "45%",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  paymentMethodSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
    shadowColor: "#3b82f6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  paymentMethodText: {
    marginLeft: 10,
    fontSize: 15,
    fontWeight: "500",
    color: "#64748b",
  },
  paymentMethodTextSelected: {
    color: "#3b82f6",
    fontWeight: "600",
  },
  modalFooter: {
    padding: 20,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  completeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#059669",
    paddingVertical: 18,
    borderRadius: 14,
    gap: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  completeButtonDisabled: {
    backgroundColor: "#cbd5e1",
  },
  completeButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  deleteButton: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  offlineText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '500',
    marginLeft: 6,
  },
});