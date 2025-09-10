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
        
        {/* Hide cost price for workers */}
        {userRole !== 'worker' && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Cost Price:</Text>
            <Text style={styles.detailValue}>{formatCurrency(item.cost_price)}</Text>
          </View>
        )}
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Selling Price:</Text>
          <Text style={styles.detailValue}>{formatCurrency(item.selling_price)}</Text>
        </View>
        
        {/* Hide total value for workers */}
        {userRole !== 'worker' && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Value:</Text>
            <Text style={[styles.detailValue, styles.valueText]}>
              {formatCurrency(item.quantity * item.cost_price)}
            </Text>
          </View>
        )}
        
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
        <Text style={styles.loadingText}>{getTranslation('loading', language)} {getTranslation('inventory', language).toLowerCase()}...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>{getTranslation('error', language)} {getTranslation('loading', language)} {getTranslation('inventory', language)}</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadInventory}>
          <Text style={styles.retryButtonText}>{getTranslation('retry', language)}</Text>
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
                {selectedStore ? selectedStore.name : getTranslation('selectStore', language)}
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
    borderBottomColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  storeSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  storeSelectorText: {
    fontSize: 14,
    color: '#3b82f6',
    marginLeft: 6,
    fontWeight: '500',
  },
  addButton: {
    backgroundColor: '#3b82f6',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listContainer: {
    padding: 20,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  itemActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 10,
    marginLeft: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemDetails: {
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  valueText: {
    color: '#3b82f6',
    fontWeight: '700',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stockDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 28,
  },
  addFirstButton: {
    backgroundColor: '#3b82f6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addFirstButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
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
    color: '#64748b',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 40,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 20,
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
});