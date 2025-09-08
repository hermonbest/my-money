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
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../utils/supabase";
import { useStore } from "../contexts/StoreContext";
import { useLanguage } from "../contexts/LanguageContext";
// Removed useNetwork import - using direct offlineManager
import { offlineManager } from "../utils/OfflineManager";
import { formatCurrency, formatDate } from "../utils/helpers";
import { getTranslation } from "../utils/translations";
import { offlineDataService } from "../utils/OfflineDataService";
import { getCurrentUser } from "../utils/authUtils";
import StoreSelector from "../components/StoreSelector";

export default function ExpensesScreen({ navigation }) {
  const { language } = useLanguage();
  // Get network status directly from offlineManager
  const isOnline = offlineManager.isConnected();
  const [expenses, setExpenses] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStoreSelector, setShowStoreSelector] = useState(false);
  const { selectedStore, userRole, selectStore } = useStore();


  const loadExpenses = async () => {
    try {
      setError(null);
      setLoading(true);
      
      // Get current user
      const { user, error: userError } = await getCurrentUser();
      
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Use offline data service for expenses
      const storeId = selectedStore?.id;
      const data = await offlineDataService.getExpenses(storeId, user.id, userRole);
      
      setExpenses(data || []);
    } catch (error) {
      console.error("Error loading expenses:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Move useFocusEffect here, after loadExpenses is defined
  useFocusEffect(
    React.useCallback(() => {
      loadExpenses();
    }, [selectedStore, userRole])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadExpenses();
    setRefreshing(false);
  };

  const handleStoreSelect = (store) => {
    selectStore(store);
  };

  const handleDeleteExpense = (expense) => {
    Alert.alert(
      "Delete Expense",
      `Are you sure you want to delete "${expense.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Get current user
              const { user, error: userError } = await getCurrentUser();
              
              if (userError || !user) {
                throw new Error('User not authenticated');
              }

              const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', expense.id)
                .eq('user_id', user.id);

              if (error) throw error;
              
              console.log('Deleted expense:', expense.id);
              await loadExpenses();
            } catch (error) {
              console.error("Error deleting expense:", error);
              Alert.alert("Error", `Failed to delete expense: ${error.message}`);
            }
          },
        },
      ],
    );
  };

  const renderExpenseItem = ({ item }) => (
    <View style={styles.expenseCard}>
      <View style={styles.expenseHeader}>
        <View style={styles.expenseInfo}>
          <Text style={styles.expenseTitle}>
            {item.title || "Expense"}
          </Text>
          <Text style={styles.expenseCategory}>
            {item.category || "General"}
          </Text>
        </View>
        <View style={styles.expenseAmount}>
          <Text style={styles.amountText}>
            {`ETB ${parseFloat(item.amount).toFixed(2)}`}
          </Text>
        </View>
      </View>

      <View style={styles.expenseDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Date:</Text>
          <Text style={styles.detailValue}>
            {new Date(item.expense_date).toLocaleDateString()}
          </Text>
        </View>
        {item.payment_method && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment Method:</Text>
            <Text style={styles.detailValue}>{item.payment_method}</Text>
          </View>
        )}
        {item.vendor && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Vendor:</Text>
            <Text style={styles.detailValue}>{item.vendor}</Text>
          </View>
        )}
        {item.description && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Description:</Text>
            <Text style={styles.detailValue}>{item.description}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteExpense(item)}
      >
        <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialIcons name="account-balance-wallet" size={64} color="#9ca3af" />
      <Text style={styles.emptyTitle}>No Expenses Recorded</Text>
      <Text style={styles.emptySubtitle}>
        Record your first expense to start tracking costs
      </Text>
      <TouchableOpacity
        style={styles.addFirstButton}
        onPress={() => navigation && navigation.navigate ? navigation.navigate("AddExpense") : console.log('Navigation not available')}
      >
        <MaterialIcons name="add" size={20} color="#ffffff" />
        <Text style={styles.addFirstButtonText}>Record First Expense</Text>
      </TouchableOpacity>
    </View>
  );

  // Show loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Expense Tracking</Text>
            <Text style={styles.headerSubtitle}>
              Track and manage your business expenses
            </Text>
          </View>
        </View>
        <View style={styles.loadingContent}>
          <MaterialIcons name="account-balance-wallet" size={64} color="#2563eb" />
          <Text style={styles.loadingText}>Loading expenses...</Text>
        </View>
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Expense Tracking</Text>
            <Text style={styles.headerSubtitle}>
              Track and manage your business expenses
            </Text>
          </View>
        </View>
        <View style={styles.errorContent}>
          <MaterialIcons name="error-outline" size={64} color="#ef4444" />
          <Text style={styles.errorTitle}>Error Loading Expenses</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadExpenses}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }



  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            {userRole === 'owner' && selectedStore ? `${getTranslation('expenses', language)} - ${selectedStore.name}` : getTranslation('expenseTracking', language)}
          </Text>
          <Text style={styles.headerSubtitle}>
            {expenses.length} {getTranslation('expensesRecorded', language)}
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
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            if (userRole === 'worker') {
              Alert.alert('Access Denied', 'Workers can view expenses but cannot add new ones. Please contact your store owner.');
              return;
            }
            navigation && navigation.navigate ? navigation.navigate("AddExpense") : console.log('Navigation not available');
          }}
        >
          <MaterialIcons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={expenses}
        renderItem={renderExpenseItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
      />
      
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
    backgroundColor: "#ffffff",
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
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
  addButton: {
    backgroundColor: "#2563eb",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  listContainer: {
    padding: 20,
  },
  expenseCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  expenseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 4,
  },
  expenseCategory: {
    fontSize: 14,
    color: "#6b7280",
  },
  expenseAmount: {
    alignItems: "flex-end",
  },
  amountText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ef4444",
  },
  expenseDetails: {
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
  deleteButton: {
    alignSelf: "flex-end",
    padding: 8,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  addFirstButton: {
    backgroundColor: "#2563eb",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  addFirstButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 16,
  },
  errorContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  errorContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
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
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
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
