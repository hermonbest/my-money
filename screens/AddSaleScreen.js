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
import { useLanguage } from "../contexts/LanguageContext"; // Import useLanguage hook
import { getTranslation } from "../utils/translations"; // Import getTranslation function

export default function AddSaleScreen({ navigation }) {
  const { selectedStore, userRole } = useStore();
  const { language } = useLanguage(); // Use language context
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
      console.error(getTranslation('errorLoadingInventory', language), error);
    }
  };

  const handleInputChange = (field, value) => {
    // SECURITY: Prevent manual price editing - only allow quantity changes
    if (field === "unitPrice") {
      console.warn(
        getTranslation('securityAttemptedToModifyLockedPriceField', language),
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
      category: item.category || getTranslation('general', language),
      unitPrice: item.selling_price?.toString() || "0", // Locked from inventory
    }));
    setShowItemSelector(false);
  };

  const validateForm = () => {
    if (!formData.itemId) {
      Alert.alert(getTranslation('error', language), getTranslation('pleaseSelectItemFromInventory', language));
      return false;
    }
    if (!formData.quantity.trim()) {
      Alert.alert(getTranslation('error', language), getTranslation('pleaseEnterQuantity', language));
      return false;
    }
    if (isNaN(formData.quantity) || parseInt(formData.quantity) <= 0) {
      Alert.alert(getTranslation('error', language), getTranslation('pleaseEnterValidQuantity', language));
      return false;
    }
    // SECURITY: Price validation - ensure price is from inventory
    if (!formData.unitPrice.trim()) {
      Alert.alert(getTranslation('error', language), getTranslation('pleaseSelectItemToGetPrice', language));
      return false;
    }
    if (isNaN(formData.unitPrice) || parseFloat(formData.unitPrice) <= 0) {
      Alert.alert(
        getTranslation('error', language),
        getTranslation('invalidPriceFromInventory', language),
      );
      return false;
    }

    // Check if enough stock is available
    const selectedItem = inventory.find((item) => item.id === formData.itemId);
    if (selectedItem && parseInt(formData.quantity) > selectedItem.quantity) {
      Alert.alert(
        getTranslation('error', language),
        `${getTranslation('only', language)} ${selectedItem.quantity} ${getTranslation('unitsAvailableInStock', language)}`,
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
        throw new Error(getTranslation('userNotAuthenticated', language));
      }

      const selectedItem = inventory.find(
        (item) => item.id === formData.itemId,
      );

      if (!selectedItem) {
        Alert.alert(getTranslation('error', language), getTranslation('selectedItemNotFoundInInventory', language));
        return;
      }

      const total = parseFloat(formData.quantity) * parseFloat(formData.unitPrice);
      const costPrice = parseFloat(selectedItem.cost_price) || 0;
      const cogs = parseInt(formData.quantity) * costPrice;

      // Create sale data
      const saleData = {
        sale_number: `SALE-${Date.now()}`,
        customer_name: formData.customerName || getTranslation('walkInCustomer', language),
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
        Alert.alert(getTranslation('offlineMode', language), getTranslation('saleWillBeRecordedWhenOnline', language));
      } else {
        Alert.alert(getTranslation('success', language), getTranslation('saleRecordedSuccessfully', language));
      }
      
      if (navigation && navigation.goBack) {
        navigation.goBack();
      } else {
        // Navigation fallback - this is expected in some contexts
        console.log(getTranslation('navigationGoBackNotAvailable', language));
      }
    } catch (error) {
      console.error(getTranslation('errorRecordingSale', language), error);
      Alert.alert(getTranslation('error', language), getTranslation('failedToRecordSale', language));
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
        <Text style={styles.itemCategory}>{item.category || getTranslation('general', language)}</Text>
      </View>
      <View style={styles.itemDetails}>
        <Text style={styles.itemPrice}>
          {formatCurrency(parseFloat(item.selling_price || 0))}
        </Text>
        <Text style={styles.itemStock}>{getTranslation('stock', language)}: {item.quantity} {getTranslation('units', language)}</Text>
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
          <Text style={styles.headerTitle}>{getTranslation('recordSale', language)}</Text>
          <Text style={styles.headerSubtitle}>
            {getTranslation('recordNewSaleTransaction', language)}
          </Text>
        </View>

        <View style={styles.form}>
          <TouchableOpacity
            style={styles.itemSelector}
            onPress={() => setShowItemSelector(true)}
          >
            <View style={styles.selectorContent}>
              <Text style={styles.selectorLabel}>{getTranslation('selectItem', language)} *</Text>
              <Text style={styles.selectorValue}>
                {formData.itemName || getTranslation('chooseFromInventory', language)}
              </Text>
            </View>
            <MaterialIcons
              name="keyboard-arrow-down"
              size={20}
              color="#6b7280"
            />
          </TouchableOpacity>

          {renderInputField(
            getTranslation('category', language),
            "category",
            getTranslation('category', language),
            "default",
            false,
            false,
          )}
          {renderInputField(
            `${getTranslation('quantity', language)} *`,
            "quantity",
            getTranslation('enterQuantity', language),
            "numeric",
          )}
          {/* SECURITY: Price field is now display-only, locked to inventory value */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{getTranslation('unitPrice', language)} (ETB) *</Text>
            <View style={[styles.input, styles.lockedPriceField]}>
              <Text style={styles.lockedPriceText}>
                {formData.unitPrice && formData.itemId
                  ? formatCurrency(
                      parseFloat(formData.unitPrice),
                    )
                  : getTranslation('selectItemToSeePrice', language)}
              </Text>
              <MaterialIcons name="lock" size={16} color="#6b7280" />
            </View>
            <Text style={styles.securityNote}>
              {getTranslation('priceLockedToInventoryValueForSecurity', language)}
            </Text>
          </View>
          {renderInputField(
            getTranslation('customerName', language),
            "customerName",
            getTranslation('enterCustomerName', language),
          )}
          {renderInputField(
            getTranslation('description', language),
            "description",
            getTranslation('enterSaleDescription', language),
            "default",
            true,
          )}
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{getTranslation('saleSummary', language)}</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{getTranslation('item', language)}:</Text>
              <Text style={styles.summaryValue}>
                {formData.itemName || getTranslation('notSelected', language)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{getTranslation('quantity', language)}:</Text>
              <Text style={styles.summaryValue}>
                {formData.quantity || "0"} {getTranslation('units', language)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{getTranslation('unitPrice', language)}:</Text>
              <Text style={styles.summaryValue}>
                {formData.unitPrice
                  ? formatCurrency(
                      parseFloat(formData.unitPrice),
                    )
                  : formatCurrency(0)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>{getTranslation('totalAmount', language)}:</Text>
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
              console.log(getTranslation('navigationGoBackNotAvailable', language));
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
            <Text style={styles.saveButtonText}>{getTranslation('recording', language)}...</Text>
          ) : (
            <>
              <MaterialIcons name="check" size={20} color="#ffffff" />
              <Text style={styles.saveButtonText}>{getTranslation('recordSale', language)}</Text>
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
            <Text style={styles.modalTitle}>{getTranslation('selectInventoryItem', language)}</Text>
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

// ... existing styles ...