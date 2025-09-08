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
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../utils/supabase";
import { useStore } from "../contexts/StoreContext";
import { useLanguage } from "../contexts/LanguageContext";
// Removed useNetwork import - using direct offlineManager
import { offlineManager } from "../utils/OfflineManager";
import { formatCurrency, getStockStatusColor } from "../utils/helpers";
import { getTranslation } from "../utils/translations";
import { offlineDataService } from "../utils/OfflineDataService";
import { getCurrentUser } from "../utils/authUtils";
import { handleInventoryError, showErrorAlert, showSuccessAlert } from "../utils/errorHandling";
import { 
  getExpirationStatus, 
  getExpirationStatusColor, 
  formatExpirationDate,
  isExpiringSoon,
  isExpired 
} from "../utils/expirationUtils";
import StoreSelector from "../components/StoreSelector";

export default function InventoryScreen({ navigation }) {
  const { language } = useLanguage();
  // Get network status directly from offlineManager
  const isOnline = offlineManager.isConnected();
  const [inventory, setInventory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStoreSelector, setShowStoreSelector] = useState(false);
  const { selectedStore, userRole, selectStore, stores } = useStore();

  const loadInventory = async () => {
    try {
      setError(null);
      setLoading(true);
      
      const { user, error: userError } = await getCurrentUser();
      
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Use offline data service for inventory loading
      const storeId = selectedStore?.id;
      const data = await offlineDataService.getInventory(storeId, user.id, userRole);
      setInventory(data || []);
      
    } catch (error) {
      const errorMessage = handleInventoryError(error, 'Loading inventory');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadInventory();
    }, [selectedStore, userRole])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInventory();
    setRefreshing(false);
  };

  const handleDeleteItem = async (item) => {
    if (userRole === 'worker') {
      Alert.alert(
        getTranslation('accessDenied', language), 
        getTranslation('accessDenied', language) + ": " + getTranslation('workers', language).toLowerCase() + " " + getTranslation('cannot', language) + " " + getTranslation('delete', language).toLowerCase() + " " + getTranslation('inventory', language).toLowerCase() + " " + getTranslation('items', language).toLowerCase() + "."
      );
      return;
    }

    Alert.alert(
      getTranslation('deleteItem', language),
      getTranslation('confirmDelete', language) + " \"" + item.name + "\"? " + getTranslation('operationCannotBeUndone', language),
      [
        { text: getTranslation('cancel', language), style: "cancel" },
        {
          text: getTranslation('delete', language),
          style: "destructive",
          onPress: async () => {
            try {
              const result = await offlineDataService.deleteInventoryItem(item.id);
              
              if (result.success) {
                await loadInventory();
                
                if (result.offline) {
                  showSuccessAlert("Offline Mode", "Item will be deleted when you're back online");
                } else {
                  showSuccessAlert("Success", "Item deleted successfully");
                }
              }
            } catch (error) {
              const errorMessage = handleInventoryError(error, 'Deleting item');
              showErrorAlert("Error", errorMessage);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.itemActions}>
          {userRole !== 'worker' && (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation && navigation.navigate ? navigation.navigate("AddItem", { itemToEdit: item }) : console.log('Navigation not available')}
              >
                <MaterialIcons name="edit" size={20} color="#2563eb" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleDeleteItem(item)}
              >
                <MaterialIcons name="delete" size={20} color="#ef4444" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
      
      <View style={styles.itemDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Quantity:</Text>
          <View style={styles.quantityContainer}>
            <View style={[styles.stockDot, { backgroundColor: getStockStatusColor(item.quantity) }]} />
            <Text style={styles.detailValue}>{item.quantity}</Text>
          </View>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Cost Price:</Text>
          <Text style={styles.detailValue}>{formatCurrency(item.cost_price)}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Selling Price:</Text>
          <Text style={styles.detailValue}>{formatCurrency(item.selling_price)}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Value:</Text>
          <Text style={[styles.detailValue, styles.valueText]}>
            {formatCurrency(item.quantity * item.cost_price)}
          </Text>
        </View>
        
        {item.expiration_date && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Expires:</Text>
            <View style={styles.expirationContainer}>
              <View style={[
                styles.expirationDot, 
                { backgroundColor: getExpirationStatusColor(item.expiration_date) }
              ]} />
              <Text style={[
                styles.detailValue,
                { color: getExpirationStatusColor(item.expiration_date) }
              ]}>
                {getExpirationStatus(item.expiration_date)}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons name="inventory" size={64} color="#d1d5db" />
      <Text style={styles.emptyTitle}>
        {userRole === 'worker' 
          ? getTranslation('noItemsFound', language) + ' ' + getTranslation('forThisStore', language)
          : getTranslation('addFirstItem', language)
        }
      </Text>
      {userRole !== 'worker' && (
        <TouchableOpacity
          style={styles.addFirstButton}
          onPress={() => navigation && navigation.navigate ? navigation.navigate("AddItem") : console.log('Navigation not available')}
        >
          <MaterialIcons name="add" size={20} color="#ffffff" />
          <Text style={styles.addFirstButtonText}>{getTranslation('addFirstItem', language)}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const getHeaderTitle = () => {
    if (userRole === 'worker' && selectedStore) {
      return `${getTranslation('inventory', language)} - ${selectedStore.name}`;
    } else if (userRole === 'owner' && selectedStore) {
      return `${getTranslation('inventory', language)} - ${selectedStore.name}`;
    }
    return getTranslation('inventory', language);
  };

  const handleStoreSelect = (store) => {
    selectStore(store);
  };


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading inventory...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>Error Loading Inventory</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadInventory}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
          {userRole === 'owner' && (
            <TouchableOpacity
              style={styles.storeSelectorButton}
              onPress={() => setShowStoreSelector(true)}
            >
              <MaterialIcons name="store" size={20} color="#2563eb" />
              <Text style={styles.storeSelectorText}>
                {selectedStore ? selectedStore.name : 'Select Store'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {userRole !== 'worker' && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation && navigation.navigate ? navigation.navigate("AddItem") : console.log('Navigation not available')}
          >
            <MaterialIcons name="add" size={24} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={inventory}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={inventory.length === 0 ? styles.emptyListContainer : styles.listContainer}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
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
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  storeSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  storeSelectorText: {
    fontSize: 12,
    color: '#2563eb',
    marginLeft: 4,
    fontWeight: '500',
  },
  addButton: {
    backgroundColor: '#2563eb',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  itemActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  itemDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  valueText: {
    color: '#2563eb',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  addFirstButton: {
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addFirstButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  expirationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expirationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
});