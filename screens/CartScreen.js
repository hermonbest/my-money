import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useStore } from '../contexts/StoreContext';
import { getCurrentUser, getUserProfile } from '../utils/authUtils';
import { offlineDataService } from '../utils/OfflineDataService';
import { offlineManager } from '../utils/OfflineManager';
import { useLanguage } from '../contexts/LanguageContext'; // Import useLanguage hook
import { getTranslation } from '../utils/translations'; // Import getTranslation function

export default function CartScreen({ navigation, route }) {
  const { cart, setCart } = route.params;
  const { selectedStore, userRole } = useStore();
  const { language } = useLanguage(); // Use language context
  const [processing, setProcessing] = useState(false);
  const [remainingStock, setRemainingStock] = useState({});

  // Load remaining stock for all items when component mounts
  useEffect(() => {
    const loadRemainingStock = async () => {
      const stockData = {};
      for (const item of cart) {
        const stock = await getRemainingStock(item.id);
        stockData[item.id] = stock;
      }
      setRemainingStock(stockData);
    };
    
    if (cart.length > 0) {
      loadRemainingStock();
    }
  }, [cart]);

  const updateQuantity = async (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    const cartItem = cart.find(cartItem => cartItem.id === itemId);
    if (!cartItem) {
      Alert.alert(getTranslation('error', language), getTranslation('itemNotFoundInCart', language));
      return;
    }

    try {
      // Get current inventory to check available stock
      const { user } = await getCurrentUser();
      if (!user) {
        Alert.alert(getTranslation('error', language), getTranslation('userNotAuthenticated', language));
        return;
      }

      const profile = await getUserProfile(user.id);
      if (!profile) {
        Alert.alert(getTranslation('error', language), getTranslation('userProfileNotFound', language));
        return;
      }

      const storeId = selectedStore?.id || profile.store_id;
      const currentInventory = await offlineDataService.getInventory(storeId, user.id, profile.role);
      const inventoryItem = currentInventory.find(inv => inv.id === itemId);
      
      if (!inventoryItem) {
        Alert.alert(getTranslation('error', language), getTranslation('itemNotFoundInInventory', language));
        return;
      }

      // Calculate how much of this item is already in the cart (excluding current item)
      const otherItemsInCart = cart.filter(item => item.id !== itemId);
      const alreadyInCart = otherItemsInCart.reduce((sum, item) => sum + item.quantity, 0);
      const availableStock = inventoryItem.quantity - alreadyInCart;

      if (newQuantity > availableStock) {
        Alert.alert(getTranslation('insufficientStock', language), 
          `${getTranslation('onlyUnitsAvailable', language)} ${availableStock} ${getTranslation('unitsAvailable', language)}. ${getTranslation('currentStock', language)}: ${inventoryItem.quantity}, ${getTranslation('alreadyInCart', language)}: ${alreadyInCart}`);
        return;
      }

      setCart(prev => 
        prev.map(cartItem => 
          cartItem.id === itemId 
            ? { ...cartItem, quantity: newQuantity }
            : cartItem
        )
      );
    } catch (error) {
      console.error('Error updating quantity:', error);
      Alert.alert(getTranslation('error', language), getTranslation('operationFailed', language));
    }
  };

  const removeFromCart = (itemId) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + ((item.unit_price || 0) * item.quantity), 0);
  };

  const getRemainingStock = async (itemId) => {
    try {
      const { user } = await getCurrentUser();
      if (!user) return 0;

      const profile = await getUserProfile(user.id);
      if (!profile) return 0;

      const storeId = selectedStore?.id || profile.store_id;
      const currentInventory = await offlineDataService.getInventory(storeId, user.id, profile.role);
      const inventoryItem = currentInventory.find(inv => inv.id === itemId);
      
      if (!inventoryItem) return 0;

      // Calculate how much of this item is already in the cart (excluding current item)
      const otherItemsInCart = cart.filter(item => item.id !== itemId);
      const alreadyInCart = otherItemsInCart.reduce((sum, item) => sum + item.quantity, 0);
      return inventoryItem.quantity - alreadyInCart;
    } catch (error) {
      console.error('Error getting remaining stock:', error);
      return 0;
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      Alert.alert(getTranslation('error', language), getTranslation('emptyCart', language));
      return;
    }

    // Validate stock availability before checkout
    try {
      const { user } = await getCurrentUser();
      if (!user) {
        Alert.alert(getTranslation('error', language), getTranslation('userNotAuthenticated', language));
        return;
      }

      const profile = await getUserProfile(user.id);
      if (!profile) {
        Alert.alert(getTranslation('error', language), getTranslation('userProfileNotFound', language));
        return;
      }

      const storeId = selectedStore?.id || profile.store_id;
      
      // Get current inventory to validate stock
      const currentInventory = await offlineDataService.getInventory(storeId, user.id, profile.role);
      
      // Check if all items have sufficient stock
      for (const cartItem of cart) {
        const inventoryItem = currentInventory.find(inv => inv.id === cartItem.id);
        if (!inventoryItem) {
          Alert.alert(getTranslation('error', language), `${cartItem.name} ${getTranslation('noLongerAvailable', language)}`);
          return;
        }
        
        if (inventoryItem.quantity < cartItem.quantity) {
          Alert.alert(getTranslation('insufficientStock', language), 
            `${cartItem.name} ${getTranslation('onlyHas', language)} ${inventoryItem.quantity} ${getTranslation('unitsAvailable', language)}, ${getTranslation('butYoureTryingToSell', language)} ${cartItem.quantity} ${getTranslation('units', language)}.`);
          return;
        }
      }
    } catch (error) {
      console.error('Error validating stock:', error);
      Alert.alert(getTranslation('warning', language), getTranslation('couldNotValidateStock', language));
    }

    try {
      setProcessing(true);
      
      const { user } = await getCurrentUser();
      if (!user) {
        Alert.alert(getTranslation('error', language), getTranslation('userNotAuthenticated', language));
        return;
      }

      // Get user profile for store assignment
      const profile = await getUserProfile(user.id);
      if (!profile) {
        Alert.alert(getTranslation('error', language), getTranslation('userProfileNotFound', language));
        return;
      }

      // Prepare sale data
      const saleData = {
        store_id: selectedStore?.id || profile.store_id,
        user_id: user.id,
        total_amount: getCartTotal(),
        subtotal: getCartTotal(),
        tax_amount: 0,
        discount_amount: 0,
        payment_method: 'cash', // Default to cash
        notes: getTranslation('posSale', language),
        sale_date: new Date().toISOString(),
      };

      // Prepare sale items
      const saleItems = cart.map(item => ({
        inventory_id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }));

      // Process the sale
      const result = await offlineDataService.processSale(saleData, saleItems, profile.role);

      if (result.success) {
        // Navigate to Final Sold Section with sale details
        navigation.navigate('FinalSoldScreen', {
          saleData: result.saleData,
          saleItems: result.saleItems,
          onComplete: () => {
            setCart([]); // Clear cart
            navigation.navigate('WorkerPOSScreen'); // Go back to POS
          }
        });
      } else {
        Alert.alert(getTranslation('error', language), result.error || getTranslation('failedToProcessSale', language));
      }

    } catch (error) {
      console.error('Error processing sale:', error);
      const offlineMessage = !offlineManager.isConnected() ? `\n\n⚠️ ${getTranslation('currentlyOffline', language)}. ${getTranslation('saleWillProcess', language)}.` : '';
      Alert.alert(getTranslation('saleProcessing', language), `${getTranslation('saleQueued', language)}.${offlineMessage}`);
      
      // Navigate to Final Sold Section even for offline sales
      navigation.navigate('FinalSoldScreen', {
        saleData: {
          id: `temp_${Date.now()}`,
          total_amount: getCartTotal(),
          sale_date: new Date().toISOString(),
          payment_method: 'cash',
          is_offline: true,
        },
        saleItems: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: (item.unit_price || 0) * item.quantity,
        })),
        onComplete: () => {
          setCart([]); // Clear cart
          navigation.navigate('WorkerPOSScreen'); // Go back to POS
        }
      });
    } finally {
      setProcessing(false);
    }
  };

  const renderCartItem = ({ item }) => {
    const stock = remainingStock[item.id] || 0;
    const isLowStock = stock <= 5;
    
    return (
      <View style={styles.cartItem}>
        <View style={styles.cartItemInfo}>
          <Text style={styles.cartItemName}>{item.name}</Text>
          <Text style={styles.cartItemPrice}>
            ${(item.unit_price || 0).toFixed(2)} {getTranslation('each', language)}
          </Text>
          <Text style={[styles.stockText, isLowStock && styles.lowStockText]}>
            {getTranslation('stock', language)}: {stock} {getTranslation('unitsRemaining', language)}
          </Text>
          <Text style={styles.cartItemTotal}>
            {getTranslation('total', language)}: ${((item.unit_price || 0) * item.quantity).toFixed(2)}
          </Text>
        </View>
        
        <View style={styles.cartItemActions}>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => updateQuantity(item.id, item.quantity - 1)}
            >
              <MaterialIcons name="remove" size={18} color="#6b7280" />
            </TouchableOpacity>
            
            <Text style={styles.quantityText}>{item.quantity}</Text>
            
            <TouchableOpacity
              style={[styles.quantityButton, stock <= 0 && styles.disabledButton]}
              onPress={() => updateQuantity(item.id, item.quantity + 1)}
              disabled={stock <= 0}
            >
              <MaterialIcons name="add" size={18} color={stock <= 0 ? "#9ca3af" : "#6b7280"} />
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

  if (processing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>{getTranslation('processingSale', language)}...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#059669" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getTranslation('cart', language)} ({cart.length} {getTranslation('items', language)})</Text>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={() => setCart([])}
        >
          <MaterialIcons name="clear-all" size={24} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* Cart Items */}
      <FlatList
        data={cart}
        keyExtractor={(item) => item.id}
        renderItem={renderCartItem}
        contentContainerStyle={styles.cartList}
        showsVerticalScrollIndicator={false}
      />

      {/* Total and Checkout */}
      <View style={styles.totalSection}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{getTranslation('total', language)}:</Text>
          <Text style={styles.totalAmount}>${getCartTotal().toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={styles.checkoutButton}
          onPress={handleCheckout}
          disabled={cart.length === 0}
        >
          <MaterialIcons name="shopping-cart-checkout" size={20} color="#ffffff" />
          <Text style={styles.checkoutButtonText}>{getTranslation('checkout', language)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  clearButton: {
    padding: 8,
  },
  cartList: {
    padding: 16,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
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
    marginBottom: 4,
  },
  cartItemTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: '#059669',
  },
  stockText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  lowStockText: {
    color: '#ef4444',
    fontWeight: '600',
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
    borderRadius: 6,
    padding: 4,
  },
  quantityButton: {
    padding: 8,
    borderRadius: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    minWidth: 30,
    textAlign: 'center',
  },
  removeButton: {
    padding: 8,
  },
  totalSection: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  checkoutButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});