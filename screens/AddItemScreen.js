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
import { useLanguage } from "../contexts/LanguageContext"; // Import useLanguage hook
import { getTranslation } from "../utils/translations"; // Import getTranslation function
import { formatCurrency } from "../utils/helpers"; // Import formatting helpers

export default function AddItemScreen({ navigation, route }) {
  const editingItem = route.params?.itemToEdit;
  const { selectedStore, userRole } = useStore();
  const { language } = useLanguage(); // Use language context
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
    minStockLevel: "5" // Default minimum stock level
  });
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        name: editingItem.name || editingItem.item_name || "",
        category: editingItem.category || "",
        quantity: editingItem.quantity?.toString() || "",
        price: editingItem.selling_price?.toString() || editingItem.price?.toString() || "",
        costPrice: editingItem.cost_price?.toString() || "",
        description: editingItem.description || "",
        expirationDate: editingItem.expiration_date ? new Date(editingItem.expiration_date) : null,
        minStockLevel: editingItem.minimum_stock_level?.toString() || "5"
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
      required: ['name', 'quantity', 'price', 'minStockLevel'],
      numbers: ['quantity', 'minStockLevel'],
      currency: ['price', 'costPrice']
    };
    
    return validateForm(formData, rules, language); // Pass language parameter
  };

  const handleSave = async () => {
    if (!validateFormData()) return;

    setLoading(true);
    try {
      // Get current user with offline support
      const { user, error: userError } = await getCurrentUser();
      
      if (userError || !user) {
        throw new Error(getTranslation('userNotAuthenticated', language));
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
        minimum_stock_level: parseInt(formData.minStockLevel) || 5, // Use user-defined minimum stock level
        description: formData.description.trim(),
        expiration_date: formData.expirationDate ? formData.expirationDate.toISOString().split('T')[0] : null,
        user_id: user.id,
        store_id: storeId, // Add store_id
      };

      if (editingItem) {
        // Update existing item using offline service
        const result = await offlineDataService.updateInventoryItem(editingItem.id, itemData, userRole);
        
        if (result.offline) {
          showSuccessAlert(
            getTranslation('offlineMode', language), 
            getTranslation('itemWillBeUpdatedWhenOnline', language)
          );
        } else {
          showSuccessAlert(
            getTranslation('success', language), 
            getTranslation('itemUpdatedSuccessfully', language)
          );
        }
      } else {
        // Insert new item using offline service
        const result = await offlineDataService.addInventoryItem(itemData, userRole);
        
        if (result.offline) {
          showSuccessAlert(
            getTranslation('offlineMode', language), 
            getTranslation('itemWillBeAddedWhenOnline', language)
          );
        } else {
          showSuccessAlert(
            getTranslation('success', language), 
            getTranslation('itemAddedSuccessfully', language)
          );
        }
      }

      // Navigate back and refresh the inventory screen
      if (navigation && navigation.goBack) {
        navigation.goBack();
      } else {
        console.log('Navigation not available');
      }
    } catch (error) {
      const errorMessage = handleInventoryError(error, getTranslation('savingItem', language));
      showErrorAlert(getTranslation('error', language), errorMessage);
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
            {editingItem ? getTranslation('editItem', language) : getTranslation('addItem', language)}
          </Text>
          <Text style={styles.headerSubtitle}>
            {editingItem
              ? getTranslation('updateInventoryItemDetails', language)
              : getTranslation('addNewItemToInventory', language)}
          </Text>
        </View>

        <View style={styles.form}>
          {renderInputField(
            `${getTranslation('itemName', language)} *`, 
            "name", 
            getTranslation('enterItemName', language)
          )}
          {renderInputField(
            getTranslation('category', language),
            "category",
            getTranslation('enterCategoryOptional', language),
          )}
          {renderInputField(
            `${getTranslation('quantity', language)} *`,
            "quantity",
            getTranslation('enterQuantity', language),
            "numeric",
          )}
          {renderInputField(
            `${getTranslation('sellingPrice', language)} (ETB) *`,
            "price",
            getTranslation('enterSellingPriceInETB', language),
            "decimal-pad",
          )}
          {renderInputField(
            `${getTranslation('costPrice', language)} (ETB) *`,
            "costPrice",
            getTranslation('enterCostPriceSupplier', language),
            "decimal-pad",
          )}
          {renderInputField(
            `${getTranslation('minimumStockLevel', language)} *`,
            "minStockLevel",
            getTranslation('enterMinimumStockLevelForAlerts', language),
            "numeric",
          )}
          {renderInputField(
            getTranslation('description', language),
            "description",
            getTranslation('enterItemDescription', language),
            "default",
            true,
          )}
          
          {/* Expiration Date Field */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{getTranslation('expirationDateOptional', language)}</Text>
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
                  : getTranslation('selectExpirationDateOptional', language)
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
          <Text style={styles.previewTitle}>{getTranslation('preview', language)}</Text>
          <View style={styles.previewCard}>
            <Text style={styles.previewName}>
              {formData.name || getTranslation('itemName', language)}
            </Text>
            <Text style={styles.previewCategory}>
              {formData.category || getTranslation('general', language)}
            </Text>
            <View style={styles.previewDetails}>
              <Text style={styles.previewDetail}>
                {getTranslation('quantity', language)}: {formData.quantity || "0"} {getTranslation('units', language)}
              </Text>
              <Text style={styles.previewDetail}>
                {getTranslation('sellingPrice', language)}:{" "}
                {formData.price
                  ? formatCurrency(parseFloat(formData.price))
                  : formatCurrency(0)}
              </Text>
              <Text style={styles.previewDetail}>
                {getTranslation('costPrice', language)}:{" "}
                {formData.costPrice
                  ? formatCurrency(parseFloat(formData.costPrice))
                  : formatCurrency(0)}
              </Text>
              <Text style={styles.previewDetail}>
                {getTranslation('minimumStockLevel', language)}: {formData.minStockLevel || "5"} {getTranslation('units', language)}
              </Text>
              {formData.expirationDate && (
                <Text style={styles.previewDetail}>
                  {getTranslation('expires', language)}: {formatExpirationDate(formData.expirationDate.toISOString())}
                </Text>
              )}
              {formData.price && formData.costPrice && (
                <Text style={[styles.previewDetail, styles.profitMargin]}>
                  {getTranslation('profitMargin', language)}:{" "}
                  {formatCurrency(parseFloat(formData.price) - parseFloat(formData.costPrice))}{" "}
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
                  {getTranslation('totalValue', language)}:{" "}
                  {formatCurrency(parseInt(formData.quantity) * parseFloat(formData.price))}
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
          <Text style={styles.cancelButtonText}>{getTranslation('cancel', language)}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <Text style={styles.saveButtonText}>{getTranslation('saving', language)}...</Text>
          ) : (
            <>
              <MaterialIcons name="check" size={20} color="#ffffff" />
              <Text style={styles.saveButtonText}>
                {editingItem ? getTranslation('update', language) : getTranslation('save', language)}
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
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  form: {
    padding: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f172a',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  multilineInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  datePickerText: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
    marginLeft: 12,
  },
  datePickerPlaceholder: {
    color: '#9ca3af',
  },
  clearButton: {
    padding: 4,
  },
  preview: {
    padding: 20,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
  },
  previewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  previewName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  previewCategory: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 16,
    fontWeight: '500',
  },
  previewDetails: {
    gap: 12,
    marginBottom: 16,
  },
  previewDetail: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
  },
  profitMargin: {
    color: '#059669',
    fontWeight: '600',
  },
  previewDescription: {
    fontSize: 15,
    color: '#64748b',
    lineHeight: 22,
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#059669',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#047857',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
    borderColor: '#6b7280',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 8,
  },
});
