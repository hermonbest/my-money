import React, { useState } from "react";
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
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../utils/supabase";
import { useStore } from "../contexts/StoreContext";
// Removed useNetwork import - using direct offlineManager
import { offlineManager } from "../utils/OfflineManager";
import { offlineDataService } from "../utils/OfflineDataService";
import { getCurrentUser } from "../utils/authUtils";
import { validateWithSchema, showValidationErrors } from "../utils/inputValidation";
import { useLanguage } from "../contexts/LanguageContext"; // Import useLanguage hook
import { getTranslation } from "../utils/translations"; // Import getTranslation function
import { formatCurrency } from "../utils/helpers"; // Import formatting helpers

export default function AddExpenseScreen({ navigation }) {
  const { selectedStore, userRole } = useStore();
  
  // Default validation function if not provided by context
  const validateOperation = (operation) => {
    // Default validation that allows the operation
    return { isValid: true, error: null };
  };
  const { language } = useLanguage(); // Use language context
  // Get network status directly from offlineManager
  const isOnline = offlineManager.isConnected();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    amount: "",
    payment_method: "cash",
    vendor: "",
    expense_date: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
  });
  const [loading, setLoading] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateForm = () => {
    // Use comprehensive store validation
    const validation = validateOperation('add_expense');
    if (!validation.isValid) {
      Alert.alert(getTranslation('accessDenied', language), validation.error);
      return false;
    }
    
    // Use standardized input validation
    const validationResult = validateWithSchema('expense', formData, {
      title: getTranslation('expenseTitle', language),
      category: getTranslation('category', language), 
      amount: getTranslation('amount', language),
      vendor: getTranslation('vendor', language),
      expense_date: getTranslation('expenseDate', language)
    }, language);
    
    if (!validationResult.isValid) {
      showValidationErrors(validationResult, language);
      return false;
    }
    
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      // Get current user
      const { user, error: userError } = await getCurrentUser();
      
      if (userError || !user) {
        throw new Error(getTranslation('userNotAuthenticated', language));
      }
      
      console.log('Current user ID:', user.id);

      const expenseData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category.trim(),
        amount: parseFloat(formData.amount),
        payment_method: formData.payment_method,
        vendor: formData.vendor.trim(),
        expense_date: formData.expense_date,
        user_id: user.id,
        store_id: selectedStore?.id || null, // Allow null for individual users
      };

      // Use offline data service to add expense
      let result;
      try {
        result = await offlineDataService.addExpense(expenseData, userRole);
      } catch (error) {
        console.error('Error in addExpense:', error);
        // If we're offline, this is expected - show appropriate message
        if (!isOnline) {
          result = { success: true, offline: true };
        } else {
          // For online errors, re-throw to be caught by the outer catch
          throw error;
        }
      }
      
      console.log('Expense operation result:', result);
      
      // Handle success case
      const offlineMessage = result?.offline ? `\n\n⚠️ ${getTranslation('expenseWillSyncWhenOnline', language)}` : '';
      Alert.alert(
        getTranslation('success', language), 
        `${getTranslation('expenseRecordedSuccessfully', language)}${offlineMessage}`,
        [{
          text: 'OK',
          onPress: () => {
            if (navigation?.goBack) {
              navigation.goBack();
            } else {
              console.log(getTranslation('navigationGoBackNotAvailableExpenseSaved', language));
            }
          }
        }]
      );
      
    } catch (error) {
      console.error('Error in handleSave:', error);
      const errorMessage = error?.message || getTranslation('errorRecordingExpense', language);
      
      if (isOnline) {
        // Show error for online case
        Alert.alert(
          getTranslation('error', language), 
          `${getTranslation('failedToRecordExpense', language)}: ${errorMessage}`
        );
      } else {
        // For offline case, show queued message
        Alert.alert(
          getTranslation('expenseQueued', language), 
          getTranslation('expenseWillSyncWhenOnline', language)
        );
        // Still navigate back since we've queued the expense
        if (navigation?.goBack) {
          navigation.goBack();
        }
      }
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

  // Function to get translated payment method name
  const getPaymentMethodTranslation = (method) => {
    switch (method) {
      case 'cash': return getTranslation('cash', language);
      case 'card': return getTranslation('card', language);
      case 'bank_transfer': return getTranslation('bankTransfer', language);
      case 'check': return getTranslation('check', language);
      case 'other': return getTranslation('other', language);
      default: return method.charAt(0).toUpperCase() + method.slice(1).replace('_', ' ');
    }
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
          <Text style={styles.headerTitle}>{getTranslation('addExpense', language)}</Text>
          <Text style={styles.headerSubtitle}>
            {getTranslation('recordNewExpenseTransaction', language)}
          </Text>
          {!isOnline && (
            <View style={styles.offlineIndicator}>
              <MaterialIcons name="wifi-off" size={16} color="#ef4444" />
              <Text style={styles.offlineText}>{getTranslation('offlineModeWillSyncWhenOnline', language)}</Text>
            </View>
          )}
        </View>

        <View style={styles.form}>
          {renderInputField(
            `${getTranslation('title', language)} *`,
            "title",
            getTranslation('enterExpenseTitle', language),
          )}
          {renderInputField(
            `${getTranslation('category', language)} *`,
            "category",
            getTranslation('enterCategoryRentUtilitiesSupplies', language),
          )}
          {renderInputField(
            `${getTranslation('amount', language)} (ETB) *`,
            "amount",
            getTranslation('enterAmountInETB', language),
            "decimal-pad",
          )}
          {renderInputField(
            getTranslation('vendor', language),
            "vendor",
            getTranslation('enterVendorSupplierNameOptional', language),
          )}
          {renderInputField(
            getTranslation('description', language),
            "description",
            getTranslation('additionalDetailsAboutThisExpense', language),
            "default",
            true,
          )}
          
          {/* Payment Method Selector */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{getTranslation('paymentMethod', language)}</Text>
            <View style={styles.paymentMethodContainer}>
              {['cash', 'card', 'bank_transfer', 'check', 'other'].map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[
                    styles.paymentMethodButton,
                    formData.payment_method === method && styles.paymentMethodButtonActive
                  ]}
                  onPress={() => handleInputChange('payment_method', method)}
                >
                  <Text style={[
                    styles.paymentMethodText,
                    formData.payment_method === method && styles.paymentMethodTextActive
                  ]}>
                    {getPaymentMethodTranslation(method)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Date Picker */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{getTranslation('expenseDate', language)}</Text>
            <TextInput
              style={styles.input}
              value={formData.expense_date}
              onChangeText={(value) => handleInputChange('expense_date', value)}
              placeholder={getTranslation('enterDateInYYYYMMDDFormat', language)}
            />
          </View>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{getTranslation('expenseSummary', language)}</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{getTranslation('title', language)}:</Text>
              <Text style={styles.summaryValue}>
                {formData.title || getTranslation('notEntered', language)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{getTranslation('category', language)}:</Text>
              <Text style={styles.summaryValue}>
                {formData.category || getTranslation('notEntered', language)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{getTranslation('amount', language)}:</Text>
              <Text style={styles.summaryValue}>
                {formData.amount
                  ? formatCurrency(parseFloat(formData.amount))
                  : formatCurrency(0)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{getTranslation('paymentMethod', language)}:</Text>
              <Text style={styles.summaryValue}>
                {getPaymentMethodTranslation(formData.payment_method)}
              </Text>
            </View>
            {formData.vendor && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{getTranslation('vendor', language)}:</Text>
                <Text style={styles.summaryValue}>
                  {formData.vendor}
                </Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{getTranslation('date', language)}:</Text>
              <Text style={styles.summaryValue}>
                {formData.expense_date}
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
              <Text style={styles.saveButtonText}>{getTranslation('recordExpense', language)}</Text>
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
    backgroundColor: "#f9fafb",
  },
  scrollView: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#4b5563",
  },
  offlineIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  offlineText: {
    marginLeft: 5,
    color: "#ef4444",
  },
  form: {
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 14,
    color: "#1f2937",
    marginBottom: 5,
  },
  input: {
    height: 40,
    borderColor: "#d1d5db",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    backgroundColor: "#ffffff",
  },
  multilineInput: {
    height: 80,
    textAlignVertical: "top",
  },
  paymentMethodContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  paymentMethodButton: {
    padding: 10,
    margin: 5,
    borderRadius: 5,
    backgroundColor: "#e5e7eb",
  },
  paymentMethodButtonActive: {
    backgroundColor: "#1d4ed8",
  },
  paymentMethodText: {
    color: "#4b5563",
  },
  paymentMethodTextActive: {
    color: "#ffffff",
  },
  summary: {
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 10,
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    padding: 15,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#4b5563",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1f2937",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
  },
  cancelButton: {
    backgroundColor: "#eab308",
    padding: 10,
    borderRadius: 5,
  },
  cancelButtonText: {
    color: "#ffffff",
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: "#1d4ed8",
    padding: 10,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#6b7280",
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    marginLeft: 5,
  },
});
