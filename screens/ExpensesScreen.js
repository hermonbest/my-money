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
      getTranslation('deleteExpense', language),
      `${getTranslation('confirmDeleteExpense', language)} "${expense.title}"?`,
      [
        { text: getTranslation('cancel', language), style: "cancel" },
        {
          text: getTranslation('delete', language),
          style: "destructive",
          onPress: async () => {
            try {
              // Get current user
              const { user, error: userError } = await getCurrentUser();
              
              if (userError || !user) {
                throw new Error(getTranslation('userNotAuthenticated', language));
              }

              const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', expense.id)
                .eq('user_id', user.id);

              if (error) throw error;
              
              console.log(getTranslation('deletedExpense', language), expense.id);
              await loadExpenses();
            } catch (error) {
              console.error(getTranslation('errorDeletingExpense', language), error);
              Alert.alert(getTranslation('error', language), `${getTranslation('failedToDeleteExpense', language)}: ${error.message}`);
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
            {item.title || getTranslation('expense', language)}
          </Text>
          <Text style={styles.expenseCategory}>
            {item.category || getTranslation('general', language)}
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
          <Text style={styles.detailLabel}>{getTranslation('date', language)}:</Text>
          <Text style={styles.detailValue}>
            {new Date(item.expense_date).toLocaleDateString()}
          </Text>
        </View>
        {item.payment_method && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{getTranslation('paymentMethod', language)}:</Text>
            <Text style={styles.detailValue}>{item.payment_method}</Text>
          </View>
        )}
        {item.vendor && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{getTranslation('vendor', language)}:</Text>
            <Text style={styles.detailValue}>{item.vendor}</Text>
          </View>
        )}
        {item.description && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{getTranslation('description', language)}:</Text>
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
      <Text style={styles.emptyTitle}>{getTranslation('noExpensesRecorded', language)}</Text>
      <Text style={styles.emptySubtitle}>
        {getTranslation('recordFirstExpense', language)}
      </Text>
      <TouchableOpacity
        style={styles.addFirstButton}
        onPress={() => {
          if (navigation?.navigate) {
            navigation.navigate('AddExpenseScreen');
          } else {
            console.log('Navigation not available');
          }
        }}
      >
        <MaterialIcons name="add" size={20} color="#ffffff" />
        <Text style={styles.addFirstButtonText}>{getTranslation('recordFirstExpenseButton', language)}</Text>
      </TouchableOpacity>
    </View>
  );

  // Show loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{getTranslation('expenseTracking', language)}</Text>
            <Text style={styles.headerSubtitle}>
              {getTranslation('trackExpenses', language)}
            </Text>
          </View>
        </View>
        <View style={styles.loadingContent}>
          <MaterialIcons name="account-balance-wallet" size={64} color="#2563eb" />
          <Text style={styles.loadingText}>{getTranslation('loading', language)} {getTranslation('expenses', language).toLowerCase()}...</Text>
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
            <Text style={styles.headerTitle}>{getTranslation('expenseTracking', language)}</Text>
            <Text style={styles.headerSubtitle}>
              {getTranslation('trackExpenses', language)}
            </Text>
          </View>
        </View>
        <View style={styles.errorContent}>
          <MaterialIcons name="error-outline" size={64} color="#ef4444" />
          <Text style={styles.errorTitle}>{getTranslation('errorLoadingExpenses', language)}</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadExpenses}>
            <Text style={styles.retryButtonText}>{getTranslation('retry', language)}</Text>
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
              <Text style={styles.offlineText}>{getTranslation('offlineMode', language)}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            if (userRole === 'worker') {
              Alert.alert(getTranslation('accessDenied', language), getTranslation('workersCannotAddExpenses', language));
              return;
            }
            if (navigation?.navigate) {
              navigation.navigate('AddExpenseScreen');
            } else {
              console.log('Navigation not available');
            }
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "500",
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
  addButton: {
    backgroundColor: "#3b82f6",
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listContainer: {
    padding: 20,
  },
  expenseCard: {
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
  expenseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  expenseCategory: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "500",
  },
  expenseAmount: {
    alignItems: "flex-end",
  },
  amountText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ef4444",
  },
  expenseDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
  },
  deleteButton: {
    alignSelf: "flex-end",
    padding: 10,
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  emptyState: {
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
    marginBottom: 30,
    lineHeight: 24,
  },
  addFirstButton: {
    backgroundColor: "#3b82f6",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addFirstButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#64748b",
    marginTop: 16,
    fontWeight: "500",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  errorContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 20,
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: "#3b82f6",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
