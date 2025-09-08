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
} from "react-native";
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../utils/supabase";
import { useStore } from "../contexts/StoreContext";
// Removed useNetwork import - using direct offlineManager
import { offlineManager } from "../utils/OfflineManager";
import { formatExpirationDate } from "../utils/expirationUtils";
import { offlineDataService } from "../utils/OfflineDataService";
import { getCurrentUser } from "../utils/authUtils";
import { handleInventoryError, showErrorAlert, showSuccessAlert } from "../utils/errorHandling";
import { validateForm } from "../utils/inputValidation";

export default function AddItemScreen({ navigation, route }) {
  const editingItem = route.params?.item;
  const { selectedStore, userRole } = useStore();
  // Get network status directly from offlineManager
  const isOnline = offlineManager.isConnected();
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    quantity: "",
    price: "",
    costPrice: "",
    description: "",
    expirationDate: null,
  });
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

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
      });
    }
  }, [editingItem]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setFormData((prev) => ({
        ...prev,
        expirationDate: selectedDate,
      }));
    }
  };

  const clearExpirationDate = () => {
    setFormData((prev) => ({
      ...prev,
      expirationDate: null,
    }));
  };

  const validateFormData = () => {
    const rules = {
      required: ['name', 'quantity', 'price'],
      numbers: ['quantity'],
      currency: ['price', 'costPrice']
    };
    
    return validateForm(formData, rules);
  };

  const handleSave = async () => {
    if (!validateFormData()) return;

    setLoading(true);
    try {
      // Get current user with offline support
      const { user, error: userError } = await getCurrentUser();
      
      if (userError || !user) {
        throw new Error('User not authenticated');
      }
      
      let storeId = null;

      // Determine store_id based on user role and selected store
      if (userRole === 'individual') {
        // Individual users don't need store_id
        storeId = null;
      } else if (userRole === 'worker') {
        // Workers use their assigned store
        storeId = selectedStore?.id;
      } else if (userRole === 'owner') {
        // Owners use the selected store
        storeId = selectedStore?.id;
      }

      console.log('Store ID for inventory:', storeId);
      console.log('Selected store:', selectedStore?.name);

      const itemData = {
        name: formData.name.trim(),
        category: formData.category.trim(),
        selling_price: parseFloat(formData.price),
        cost_price: parseFloat(formData.costPrice) || 0,
        quantity: parseInt(formData.quantity),
        minimum_stock_level: 5, // Default minimum stock
        description: formData.description.trim(),
        expiration_date: formData.expirationDate ? formData.expirationDate.toISOString().split('T')[0] : null,
        user_id: user.id,
        store_id: storeId, // Add store_id
      };

      if (editingItem) {
        // Update existing item using offline service
        const result = await offlineDataService.updateInventoryItem(editingItem.id, itemData, userRole);
        
        if (result.offline) {
          showSuccessAlert("Offline Mode", "Item will be updated when you're back online");
        } else {
          showSuccessAlert("Success", "Item updated successfully!");
        }
      } else {
        // Insert new item using offline service
        const result = await offlineDataService.addInventoryItem(itemData, userRole);
        
        if (result.offline) {
          showSuccessAlert("Offline Mode", "Item will be added when you're back online");
        } else {
          showSuccessAlert("Success", "Item added successfully!");
        }
      }

      // Navigate back and refresh the inventory screen
      if (navigation && navigation.goBack) {
        navigation.goBack();
      } else {
        console.log('Navigation not available');
      }
    } catch (error) {
      const errorMessage = handleInventoryError(error, 'Saving item');
      showErrorAlert("Error", errorMessage);
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
        style={[styles.input, multiline && styles.multilineInput]}
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
          <Text style={styles.headerTitle}>
            {editingItem ? "Edit Item" : "Add New Item"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {editingItem
              ? "Update inventory item details"
              : "Add a new item to your inventory"}
          </Text>
        </View>

        <View style={styles.form}>
          {renderInputField("Item Name *", "name", "Enter item name")}
          {renderInputField(
            "Category",
            "category",
            "Enter category (optional)",
          )}
          {renderInputField(
            "Quantity *",
            "quantity",
            "Enter quantity",
            "numeric",
          )}
          {renderInputField(
            "Selling Price (ETB) *",
            "price",
            "Enter selling price in ETB",
            "decimal-pad",
          )}
          {renderInputField(
            "Cost Price (ETB) *",
            "costPrice",
            "Enter cost price (what you paid supplier)",
            "decimal-pad",
          )}
          {renderInputField(
            "Description",
            "description",
            "Enter item description",
            "default",
            true,
          )}
          
          {/* Expiration Date Field */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Expiration Date (Optional)</Text>
            <TouchableOpacity
              style={styles.datePickerButton}
              onPress={() => setShowDatePicker(true)}
            >
              <MaterialIcons name="event" size={20} color="#6b7280" />
              <Text style={[
                styles.datePickerText,
                !formData.expirationDate && styles.datePickerPlaceholder
              ]}>
                {formData.expirationDate 
                  ? formatExpirationDate(formData.expirationDate.toISOString())
                  : "Select expiration date (optional)"
                }
              </Text>
              {formData.expirationDate && (
                <TouchableOpacity
                  onPress={clearExpirationDate}
                  style={styles.clearButton}
                >
                  <MaterialIcons name="clear" size={20} color="#ef4444" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* DateTimePicker Modal */}
        {showDatePicker && (
          <DateTimePicker
            value={formData.expirationDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}

        <View style={styles.preview}>
          <Text style={styles.previewTitle}>Preview</Text>
          <View style={styles.previewCard}>
            <Text style={styles.previewName}>
              {formData.name || "Item Name"}
            </Text>
            <Text style={styles.previewCategory}>
              {formData.category || "General"}
            </Text>
            <View style={styles.previewDetails}>
              <Text style={styles.previewDetail}>
                Quantity: {formData.quantity || "0"} units
              </Text>
              <Text style={styles.previewDetail}>
                Selling Price:{" "}
                {formData.price
                  ? `ETB ${parseFloat(formData.price).toFixed(2)}`
                  : "ETB 0.00"}
              </Text>
              <Text style={styles.previewDetail}>
                Cost Price:{" "}
                {formData.costPrice
                  ? `ETB ${parseFloat(formData.costPrice).toFixed(2)}`
                  : "ETB 0.00"}
              </Text>
              {formData.expirationDate && (
                <Text style={styles.previewDetail}>
                  Expires: {formatExpirationDate(formData.expirationDate.toISOString())}
                </Text>
              )}
              {formData.price && formData.costPrice && (
                <Text style={[styles.previewDetail, styles.profitMargin]}>
                  Profit Margin:{" "}
                  {`ETB ${(parseFloat(formData.price) - parseFloat(formData.costPrice)).toFixed(2)}`}{" "}
                  (
                  {(
                    ((parseFloat(formData.price) -
                      parseFloat(formData.costPrice)) /
                      parseFloat(formData.price)) *
                    100
                  ).toFixed(1)}
                  %)
                </Text>
              )}
              {formData.quantity && formData.price && (
                <Text style={styles.previewDetail}>
                  Total Value:{" "}
                  {`ETB ${(parseInt(formData.quantity) * parseFloat(formData.price)).toFixed(2)}`}
                </Text>
              )}
            </View>
            {formData.description && (
              <Text style={styles.previewDescription}>
                {formData.description}
              </Text>
            )}
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
              console.log('Navigation not available');
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
            <Text style={styles.saveButtonText}>Saving...</Text>
          ) : (
            <>
              <MaterialIcons name="check" size={20} color="#ffffff" />
              <Text style={styles.saveButtonText}>
                {editingItem ? "Update" : "Save"}
              </Text>
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
  preview: {
    padding: 20,
    paddingTop: 0,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 16,
  },
  previewCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  previewName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  previewCategory: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
  },
  previewDetails: {
    marginBottom: 12,
  },
  previewDetail: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  previewDescription: {
    fontSize: 14,
    color: "#6b7280",
    fontStyle: "italic",
  },
  profitMargin: {
    color: "#10b981",
    fontWeight: "600",
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
    backgroundColor: "#2563eb",
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
  datePickerButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  datePickerText: {
    fontSize: 16,
    color: "#1f2937",
    flex: 1,
    marginLeft: 8,
  },
  datePickerPlaceholder: {
    color: "#9ca3af",
  },
  clearButton: {
    padding: 4,
  },
});
