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
  Modal,
  FlatList,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../utils/supabase";
import { useStore } from "../contexts/StoreContext";
// Removed useNetwork import - using direct offlineManager
import { offlineManager } from "../utils/OfflineManager";
import { offlineDataService } from "../utils/OfflineDataService";
import { getCurrentUser } from "../utils/authUtils";
import { formatCurrency } from "../utils/helpers";

export default function AddSaleScreen({ navigation }) {
  const { selectedStore, userRole } = useStore();
  // Get network status directly from offlineManager
  const isOnline = offlineManager.isConnected();
  const [formData, setFormData] = useState({
    itemId: "",
    itemName: "",
    category: "",
    quantity: "",
    unitPrice: "",
    customerName: "",
    description: "",
  });
  const [inventory, setInventory] = useState([]);
  const [showItemSelector, setShowItemSelector] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      const { user } = await getCurrentUser();
      if (!user) return;
      
      const storeId = selectedStore?.id;
      const data = await offlineDataService.getInventory(storeId, user.id, userRole);
      setInventory(data || []);
    } catch (error) {
      console.error("Error loading inventory:", error);
    }
  };

  const handleInputChange = (field, value) => {
    // SECURITY: Prevent manual price editing - only allow quantity changes
    if (field === "unitPrice") {
      console.warn(
        "SECURITY: Attempted to modify locked price field - blocked",
      );
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Auto-calculate total when quantity changes (price is locked from inventory)
    if (field === "quantity") {
      const quantity = parseFloat(value) || 0;
      const price = parseFloat(formData.unitPrice) || 0;

      if (quantity > 0 && price > 0) {
        const total = quantity * price;
        // Note: total will be calculated when saving
      }
    }
  };

  const selectInventoryItem = (item) => {
    // SECURITY: Lock price to inventory value - cannot be changed by user
    setFormData((prev) => ({
      ...prev,
      itemId: item.id,
      itemName: item.item_name || item.name,
      category: item.category || "General",
      unitPrice: item.selling_price?.toString() || "0", // Locked from inventory
    }));
    setShowItemSelector(false);
  };

  const validateForm = () => {
    if (!formData.itemId) {
      Alert.alert("Error", "Please select an item from inventory");
      return false;
    }
    if (!formData.quantity.trim()) {
      Alert.alert("Error", "Please enter quantity");
      return false;
    }
    if (isNaN(formData.quantity) || parseInt(formData.quantity) <= 0) {
      Alert.alert("Error", "Please enter a valid quantity");
      return false;
    }
    // SECURITY: Price validation - ensure price is from inventory
    if (!formData.unitPrice.trim()) {
      Alert.alert("Error", "Please select an item to get the price");
      return false;
    }
    if (isNaN(formData.unitPrice) || parseFloat(formData.unitPrice) <= 0) {
      Alert.alert(
        "Error",
        "Invalid price from inventory - please select a valid item",
      );
      return false;
    }

    // Check if enough stock is available
    const selectedItem = inventory.find((item) => item.id === formData.itemId);
    if (selectedItem && parseInt(formData.quantity) > selectedItem.quantity) {
      Alert.alert(
        "Error",
        `Only ${selectedItem.quantity} units available in stock`,
      );
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

      const selectedItem = inventory.find(
        (item) => item.id === formData.itemId,
      );

      if (!selectedItem) {
        Alert.alert("Error", "Selected item not found in inventory");
        return;
      }

      const total = parseFloat(formData.quantity) * parseFloat(formData.unitPrice);
      const costPrice = parseFloat(selectedItem.cost_price) || 0;
      const cogs = parseInt(formData.quantity) * costPrice;

      // Create sale data
      const saleData = {
        sale_number: `SALE-${Date.now()}`,
        customer_name: formData.customerName || 'Walk-in Customer',
        total_amount: total,
        payment_method: 'cash',
        notes: formData.description,
        user_id: user.id,
        store_id: selectedStore?.id,
      };

      // Create sale items
      const saleItems = [{
        inventory_id: formData.itemId,
        name: formData.itemName,
        quantity: parseInt(formData.quantity),
        unit_price: parseFloat(formData.unitPrice),
      }];

      // Process sale using offline service
      const result = await offlineDataService.processSale(saleData, saleItems, userRole);
      
      if (result.offline) {
        Alert.alert("Offline Mode", "Sale will be recorded when you're back online");
      } else {
        Alert.alert("Success", "Sale recorded successfully!");
      }
      
      if (navigation && navigation.goBack) {
        navigation.goBack();
      } else {
        // Navigation fallback - this is expected in some contexts
        console.log('Navigation goBack not available - sale completed successfully');
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
    editable = true,
  ) => (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.multilineInput,
          !editable && styles.disabledInput,
        ]}
        value={formData[field]}
        onChangeText={(value) => handleInputChange(field, value)}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        editable={editable}
      />
    </View>
  );

  const renderInventoryItem = ({ item }) => (
    <TouchableOpacity
      style={styles.inventoryItem}
      onPress={() => selectInventoryItem(item)}
    >
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.item_name || item.name}</Text>
        <Text style={styles.itemCategory}>{item.category || "General"}</Text>
      </View>
      <View style={styles.itemDetails}>
        <Text style={styles.itemPrice}>
          {`$${parseFloat(item.selling_price || 0).toFixed(2)}`}
        </Text>
        <Text style={styles.itemStock}>Stock: {item.quantity} units</Text>
      </View>
    </TouchableOpacity>
  );

  const getTotalAmount = () => {
    const quantity = parseFloat(formData.quantity) || 0;
    const price = parseFloat(formData.unitPrice) || 0;
    return quantity * price;
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
          <Text style={styles.headerTitle}>Record Sale</Text>
          <Text style={styles.headerSubtitle}>
            Record a new sale transaction
          </Text>
        </View>

        <View style={styles.form}>
          <TouchableOpacity
            style={styles.itemSelector}
            onPress={() => setShowItemSelector(true)}
          >
            <View style={styles.selectorContent}>
              <Text style={styles.selectorLabel}>Select Item *</Text>
              <Text style={styles.selectorValue}>
                {formData.itemName || "Choose from inventory"}
              </Text>
            </View>
            <MaterialIcons
              name="keyboard-arrow-down"
              size={20}
              color="#6b7280"
            />
          </TouchableOpacity>

          {renderInputField(
            "Category",
            "category",
            "Category",
            "default",
            false,
            false,
          )}
          {renderInputField(
            "Quantity *",
            "quantity",
            "Enter quantity",
            "numeric",
          )}
          {/* SECURITY: Price field is now display-only, locked to inventory value */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Unit Price (ETB) *</Text>
            <View style={[styles.input, styles.lockedPriceField]}>
              <Text style={styles.lockedPriceText}>
                {formData.unitPrice && formData.itemId
                  ? formatCurrency(
                      parseFloat(formData.unitPrice),
                    )
                  : "Select an item to see price"}
              </Text>
              <MaterialIcons name="lock" size={16} color="#6b7280" />
            </View>
            <Text style={styles.securityNote}>
              🔒 Price locked to inventory value for security
            </Text>
          </View>
          {renderInputField(
            "Customer Name",
            "customerName",
            "Enter customer name",
          )}
          {renderInputField(
            "Description",
            "description",
            "Enter sale description",
            "default",
            true,
          )}
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Sale Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Item:</Text>
              <Text style={styles.summaryValue}>
                {formData.itemName || "Not selected"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Quantity:</Text>
              <Text style={styles.summaryValue}>
                {formData.quantity || "0"} units
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Unit Price:</Text>
              <Text style={styles.summaryValue}>
                {formData.unitPrice
                  ? formatCurrency(
                      parseFloat(formData.unitPrice),
                    )
                  : "ETB 0.00"}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total Amount:</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(getTotalAmount())}
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
            } else {
              console.log('Navigation goBack not available');
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
            <Text style={styles.saveButtonText}>Recording...</Text>
          ) : (
            <>
              <MaterialIcons name="check" size={20} color="#ffffff" />
              <Text style={styles.saveButtonText}>Record Sale</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={showItemSelector}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Inventory Item</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowItemSelector(false)}
            >
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={inventory}
            renderItem={renderInventoryItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.modalList}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </Modal>
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
  form: {
    padding: 20,
  },
  itemSelector: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  selectorContent: {
    flex: 1,
  },
  selectorLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  selectorValue: {
    fontSize: 16,
    color: "#1f2937",
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
  disabledInput: {
    backgroundColor: "#f9fafb",
    color: "#6b7280",
  },
  multilineInput: {
    height: 100,
    textAlignVertical: "top",
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
  modalContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  modalHeader: {
    backgroundColor: "#ffffff",
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
  },
  closeButton: {
    padding: 4,
  },
  modalList: {
    padding: 20,
  },
  inventoryItem: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  itemCategory: {
    fontSize: 14,
    color: "#6b7280",
  },
  itemDetails: {
    alignItems: "flex-end",
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#10b981",
    marginBottom: 4,
  },
  itemStock: {
    fontSize: 12,
    color: "#6b7280",
  },
  // SECURITY: Styles for locked price field
  lockedPriceField: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderColor: "#d1d5db",
  },
  lockedPriceText: {
    fontSize: 16,
    color: "#1f2937",
    fontWeight: "600",
  },
  securityNote: {
    fontSize: 12,
    color: "#6b7280",
    fontStyle: "italic",
    marginTop: 4,
  },
});
