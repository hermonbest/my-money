import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useStore } from "../contexts/StoreContext";
import { offlineDataService } from "../utils/OfflineDataService";
import { getCurrentUser } from "../utils/authUtils";
import { formatCurrency } from "../utils/helpers";

export default function POSCheckoutScreen({ navigation, route }) {
  const { selectedStore, userRole } = useStore();
  const { cartItems } = route.params || { cartItems: [] };
  
  // Local state for cart items (can be modified)
  const [localCartItems, setLocalCartItems] = useState(cartItems);
  
  const [formData, setFormData] = useState({
    customerName: "",
    paymentMethod: "cash",
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateForm = () => {
    if (localCartItems.length === 0) {
      Alert.alert("Error", "Cart is empty");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const { user } = await getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const total = getCartTotal();

      // Create sale data
      const saleData = {
        sale_number: `POS-${Date.now()}`,
        customer_name: formData.customerName || 'Walk-in Customer',
        total_amount: total,
        subtotal: total,
        tax_amount: 0,
        discount_amount: 0,
        payment_method: formData.paymentMethod,
        notes: formData.notes || 'POS Sale',
        user_id: user.id,
        store_id: selectedStore?.id,
        sale_date: new Date().toISOString(),
      };

      // Create sale items from cart
      const saleItems = localCartItems.map(item => ({
        inventory_id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }));

      console.log('💰 Processing POS sale...', { total, items: saleItems.length });

      // Process sale using offline service
      const result = await offlineDataService.processSale(saleData, saleItems, userRole);
      
      if (result.offline) {
        Alert.alert("Offline Mode", "Sale will be recorded when you're back online", [
          {
            text: "OK",
            onPress: () => {
              // Navigate back with success result to clear cart
              navigation.navigate('POS', { clearCart: true });
            }
          }
        ]);
      } else {
        Alert.alert("Success", "Sale recorded successfully!", [
          {
            text: "OK",
            onPress: () => {
              // Navigate back with success result to clear cart
              navigation.navigate('POS', { clearCart: true });
            }
          }
        ]);
      }
    } catch (error) {
      console.error("Error recording sale:", error);
      Alert.alert("Error", "Failed to record sale");
    } finally {
      setLoading(false);
    }
  };

  const renderInputField = (
    label,
    field,
    placeholder,
    keyboardType = "default",
    multiline = false,
  ) => (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.multilineInput,
        ]}
        value={formData[field]}
        onChangeText={(value) => handleInputChange(field, value)}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  );

  const renderPaymentMethodSelector = () => (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>Payment Method *</Text>
      <View style={styles.paymentMethods}>
        {['cash', 'mobile'].map(method => (
          <TouchableOpacity
            key={method}
            style={[
              styles.paymentMethod,
              formData.paymentMethod === method && styles.paymentMethodSelected
            ]}
            onPress={() => handleInputChange('paymentMethod', method)}
          >
            <MaterialIcons 
              name={method === 'cash' ? 'money' : 'phone-android'} 
              size={20} 
              color={formData.paymentMethod === method ? '#ffffff' : '#6b7280'} 
            />
            <Text style={[
              styles.paymentMethodText,
              formData.paymentMethod === method && styles.paymentMethodTextSelected
            ]}>
              {method.charAt(0).toUpperCase() + method.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const updateCartQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      // Remove item if quantity is 0 or less
      setLocalCartItems(prev => prev.filter(item => item.id !== itemId));
      return;
    }
    
    // Update quantity
    setLocalCartItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, quantity: newQuantity }
        : item
    ));
  };

  const removeFromCart = (itemId) => {
    setLocalCartItems(prev => prev.filter(item => item.id !== itemId));
  };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemInfo}>
        <Text style={styles.cartItemName}>{item.name}</Text>
        <Text style={styles.cartItemCategory}>{item.category || "General"}</Text>
        <Text style={styles.cartItemPrice}>
          {formatCurrency(item.unit_price)} each
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
          <MaterialIcons name="delete" size={18} color="#ef4444" />
        </TouchableOpacity>
        
        <View style={styles.cartItemTotalContainer}>
          <Text style={styles.cartItemTotal}>
            {formatCurrency(item.unit_price * item.quantity)}
          </Text>
        </View>
      </View>
    </View>
  );

  const getCartTotal = () => {
    return localCartItems.reduce((total, item) => total + (item.unit_price * item.quantity), 0);
  };

  const getCartItemCount = () => {
    return localCartItems.reduce((total, item) => total + item.quantity, 0);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Checkout</Text>
          <Text style={styles.headerSubtitle}>
            Complete your sale transaction
          </Text>
        </View>

        {/* Cart Items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cart Items ({getCartItemCount()})</Text>
          <FlatList
            data={localCartItems}
            renderItem={renderCartItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            style={styles.cartList}
          />
        </View>

        {/* Customer Information */}
        <View style={styles.form}>
          {renderInputField(
            "Customer Name",
            "customerName",
            "Enter customer name (optional)",
          )}
          
          {renderPaymentMethodSelector()}
          
          {renderInputField(
            "Notes",
            "notes",
            "Enter sale notes (optional)",
            "default",
            true,
          )}
        </View>

        {/* Sale Summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Sale Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Items:</Text>
              <Text style={styles.summaryValue}>
                {getCartItemCount()} units
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal:</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(getCartTotal())}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tax:</Text>
              <Text style={styles.summaryValue}>
                {formatCurrency(0)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total Amount:</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(getCartTotal())}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => {
            if (navigation && navigation.goBack) {
              navigation.goBack();
            }
          }}
          disabled={loading}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <Text style={styles.saveButtonText}>Processing...</Text>
          ) : (
            <>
              <MaterialIcons name="check" size={20} color="#ffffff" />
              <Text style={styles.saveButtonText}>Complete Sale</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: "#ffffff",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: "#6b7280",
  },
  section: {
    backgroundColor: "#ffffff",
    margin: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 12,
  },
  cartList: {
    maxHeight: 200,
  },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cartItemInfo: {
    flex: 2,
    marginRight: 12,
  },
  cartItemName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
    flexWrap: "wrap",
  },
  cartItemCategory: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  cartItemActions: {
    flexDirection: "column",
    alignItems: "flex-end",
    flex: 1,
    gap: 8,
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    padding: 2,
  },
  quantityButton: {
    padding: 8,
    borderRadius: 6,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    minWidth: 35,
    textAlign: "center",
  },
  removeButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: "#fef2f2",
  },
  cartItemTotalContainer: {
    alignItems: "flex-end",
  },
  cartItemTotal: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#10b981",
  },
  form: {
    padding: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: "#1f2937",
  },
  multilineInput: {
    height: 100,
    textAlignVertical: "top",
  },
  paymentMethods: {
    flexDirection: "row",
    gap: 12,
  },
  paymentMethod: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
    gap: 8,
  },
  paymentMethodSelected: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  paymentMethodText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  paymentMethodTextSelected: {
    color: "#ffffff",
  },
  summary: {
    padding: 20,
    paddingTop: 0,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6b7280",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#10b981",
  },
  footer: {
    backgroundColor: "#ffffff",
    padding: 20,
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  saveButton: {
    flex: 2,
    backgroundColor: "#10b981",
    padding: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    marginLeft: 8,
  },
});