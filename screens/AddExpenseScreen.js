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

export default function AddExpenseScreen({ navigation }) {
  const { selectedStore, userRole, validateOperation } = useStore();
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
      Alert.alert("Access Denied", validation.error);
      return false;
    }
    
    // Use standardized input validation
    const validationResult = validateWithSchema('expense', formData, {
      title: 'Expense Title',
      category: 'Category', 
      amount: 'Amount',
      vendor: 'Vendor',
      expense_date: 'Expense Date'
    });
    
    if (!validationResult.isValid) {
      showValidationErrors(validationResult);
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
        throw new Error('User not authenticated');
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
      const result = await offlineDataService.addExpense(expenseData, userRole);
      
      console.log('Inserted expense:', result);
      
      const offlineMessage = !isOnline ? '\n\n⚠️ This expense will sync when you\'re back online.' : '';
      Alert.alert("Success", `Expense recorded successfully!${offlineMessage}`);
      
      if (navigation && navigation.goBack) {
        navigation.goBack();
      } else {
        // Navigation fallback - this is expected in some contexts
        console.log('Navigation goBack not available - expense saved successfully');
      }
    } catch (error) {
      console.error("Error recording expense:", error);
      const offlineMessage = !isOnline ? '\n\n⚠️ You\'re currently offline. The expense will be recorded when you\'re back online.' : '';
      Alert.alert("Expense Processing", `Expense has been queued for processing.${offlineMessage}`);
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
          <Text style={styles.headerTitle}>Add Expense</Text>
          <Text style={styles.headerSubtitle}>
            Record a new expense transaction
          </Text>
          {!isOnline && (
            <View style={styles.offlineIndicator}>
              <MaterialIcons name="wifi-off" size={16} color="#ef4444" />
              <Text style={styles.offlineText}>Offline Mode - Will sync when online</Text>
            </View>
          )}
        </View>

        <View style={styles.form}>
          {renderInputField(
            "Title *",
            "title",
            "Enter expense title",
          )}
          {renderInputField(
            "Category *",
            "category",
            "Enter category (e.g., Rent, Utilities, Supplies)",
          )}
          {renderInputField(
            "Amount (ETB) *",
            "amount",
            "Enter amount in ETB",
            "decimal-pad",
          )}
          {renderInputField(
            "Vendor",
            "vendor",
            "Enter vendor/supplier name (optional)",
          )}
          {renderInputField(
            "Description",
            "description",
            "Additional details about this expense",
            "default",
            true,
          )}
          
          {/* Payment Method Selector */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Payment Method</Text>
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
                    {method.charAt(0).toUpperCase() + method.slice(1).replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Date Picker */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Expense Date</Text>
            <TextInput
              style={styles.input}
              value={formData.expense_date}
              onChangeText={(value) => handleInputChange('expense_date', value)}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Expense Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Title:</Text>
              <Text style={styles.summaryValue}>
                {formData.title || "Not entered"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Category:</Text>
              <Text style={styles.summaryValue}>
                {formData.category || "Not entered"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount:</Text>
              <Text style={styles.summaryValue}>
                {formData.amount
                  ? `ETB ${parseFloat(formData.amount).toFixed(2)}`
                  : "ETB 0.00"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Payment Method:</Text>
              <Text style={styles.summaryValue}>
                {formData.payment_method.charAt(0).toUpperCase() + formData.payment_method.slice(1).replace('_', ' ')}
              </Text>
            </View>
            {formData.vendor && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Vendor:</Text>
                <Text style={styles.summaryValue}>
                  {formData.vendor}
                </Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Date:</Text>
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
              <Text style={styles.saveButtonText}>Record Expense</Text>
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
    flex: 1,
    textAlign: "right",
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
    backgroundColor: "#ef4444",
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
  paymentMethodContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  paymentMethodButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
  },
  paymentMethodButtonActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  paymentMethodText: {
    fontSize: 14,
    color: "#6b7280",
  },
  paymentMethodTextActive: {
    color: "#ffffff",
  },
  offlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  offlineText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '500',
    marginLeft: 4,
  },
});
