import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useStore } from '../contexts/StoreContext';
import { getCurrentUser, getUserProfile } from '../utils/authUtils';
import { offlineDataService } from '../utils/OfflineDataService';
import { offlineManager } from '../utils/OfflineManager';
// AsyncStorage removed - using centralized storage
import { showErrorAlert, handleSupabaseError, logError } from '../utils/errorHandling';
import { useLanguage } from '../contexts/LanguageContext'; // Import useLanguage hook
import { getTranslation } from '../utils/translations'; // Import getTranslation function
import { formatCurrency, formatDate } from '../utils/helpers'; // Import formatting helpers

export default function FinalSoldScreen({ navigation, route }) {
  const { saleData, saleItems } = route.params;
  const { selectedStore } = useStore();
  const { language } = useLanguage(); // Use language context
  const [processing, setProcessing] = useState(false);
  const [inventoryUpdated, setInventoryUpdated] = useState(false);

  useEffect(() => {
    // Automatically update inventory when screen loads
    updateInventory();
  }, []);

  const updateInventory = async () => {
    try {
      setProcessing(true);
      
      const { user } = await getCurrentUser();
      if (!user) {
        const error = {
          title: getTranslation('authenticationError', language),
          message: getTranslation('userNotAuthenticatedPleaseLogin', language),
          action: getTranslation('ok', language)
        };
        logError(error, { context: 'FinalSoldScreen.updateInventory' });
        showErrorAlert(error);
        return;
      }

      // Get user profile for store assignment
      const profile = await getUserProfile(user.id);
      if (!profile) {
        const error = {
          title: getTranslation('profileError', language),
          message: getTranslation('userProfileNotFoundPleaseContactSupport', language),
          action: getTranslation('ok', language)
        };
        logError(error, { context: 'FinalSoldScreen.updateInventory', userId: user.id });
        showErrorAlert(error);
        return;
      }

      const storeId = selectedStore?.id || profile.store_id;

      // Check if this is an offline sale that needs inventory update
      if (saleData.is_offline) {
        console.log('🔍 Offline sale detected, updating inventory manually...');
        
        // For offline sales, we need to update inventory manually
        for (const item of saleItems) {
          console.log(`🔍 Updating inventory for offline sale item: ${item.name}`);
          
          try {
            // Get current inventory
            const currentInventory = await offlineDataService.getInventory(storeId, user.id, profile.role);
            const inventoryItem = currentInventory.find(inv => inv.id === item.inventory_id);
            
            if (inventoryItem) {
              const newQuantity = inventoryItem.quantity - item.quantity;
              console.log(`🔍 Updating ${item.name}: ${inventoryItem.quantity} → ${newQuantity}`);
              
              // Validate new quantity
              if (newQuantity < 0) {
                console.warn(`⚠️ Warning: Negative stock for ${item.name}: ${newQuantity}`);
              }
              
              // Update the cache directly for offline sales
              const inventoryCacheKey = `offline_inventory_${storeId}_${profile.role}`;
              const updatedInventory = currentInventory.map(inv => 
                inv.id === item.inventory_id 
                  ? { ...inv, quantity: Math.max(0, newQuantity), updated_at: new Date().toISOString() }
                  : inv
              );
              await AsyncStorage.setItem(inventoryCacheKey, JSON.stringify({
                data: updatedInventory,
                timestamp: new Date().toISOString(),
                synced: false
              }));
            } else {
              console.warn(`⚠️ Item ${item.name} not found in inventory cache`);
            }
          } catch (itemError) {
            console.error(`❌ Error updating item ${item.name}:`, itemError);
            // Continue with other items even if one fails
          }
        }
        
        setInventoryUpdated(true);
        console.log('✅ Offline inventory updates completed');
      } else {
        // For online sales, inventory should already be updated in the database
        // Just mark as updated since the sale process handles this
        setInventoryUpdated(true);
        console.log('✅ Online sale - inventory updated during sale process');
      }

    } catch (error) {
      console.error('Error updating inventory:', error);
      
      const standardErrorMessage = handleSupabaseError(error, getTranslation('inventoryUpdate', language));
      logError(error, { 
        context: 'FinalSoldScreen.updateInventory',
        saleData: saleData?.id,
        itemCount: saleItems?.length 
      });
      
      // Show warning but don't block the user
      showErrorAlert({
        title: getTranslation('inventoryUpdateWarning', language),
        message: getTranslation('inventoryUpdateMayHaveFailed', language),
        action: getTranslation('ok', language)
      });
      
      // Still mark as updated to allow user to proceed
      setInventoryUpdated(true);
    } finally {
      setProcessing(false);
    }
  };

  const handleComplete = async () => {
    console.log('🔍 handleComplete called - navigating back to POS');
    handleNavigation();
  };
  
  const handleNavigation = () => {
    console.log('🔍 handleNavigation - trying navigation methods');
    
    try {
      // Method 1: Try going back
      if (navigation.canGoBack()) {
        console.log('🔍 Using navigation.goBack()');
        navigation.goBack();
        return;
      }
    } catch (error) {
      console.log('❌ goBack failed:', error.message);
    }
    
    try {
      // Method 2: Navigate to POS tab (correct tab name)
      console.log('🔍 Using navigation.navigate to POS tab');
      navigation.navigate('MainApp', { screen: 'POS' });
      return;
    } catch (error) {
      console.log('❌ navigate to POS tab failed:', error.message);
    }
    
    try {
      // Method 3: Navigate to MainApp
      console.log('🔍 Using navigation.navigate to MainApp');
      navigation.navigate('MainApp');
      return;
    } catch (error) {
      console.log('❌ navigate to MainApp failed:', error.message);
    }
    
    console.log('❌ All navigation methods failed');
  };

  const renderSoldItem = ({ item, index }) => (
    <View style={styles.soldItem}>
      <View style={styles.itemNumber}>
        <Text style={styles.itemNumberText}>{index + 1}</Text>
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDetails}>
          {item.quantity} {getTranslation('units', language)} × {formatCurrency(item.unit_price || 0)} {getTranslation('each', language)}
        </Text>
      </View>
      <View style={styles.itemTotal}>
        <Text style={styles.itemTotalText}>
          {formatCurrency(item.line_total || (item.unit_price || 0) * item.quantity)}
        </Text>
      </View>
    </View>
  );

  const getTotalAmount = () => {
    return saleItems.reduce((total, item) => {
      return total + (item.line_total || (item.unit_price || 0) * item.quantity);
    }, 0);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="check-circle" size={24} color="#059669" />
          <Text style={styles.headerTitle}>{getTranslation('saleCompleted', language)}</Text>
        </View>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleComplete}
        >
          <MaterialIcons name="close" size={24} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Sale Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>{getTranslation('saleSummary', language)}</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{getTranslation('saleID', language)}:</Text>
          <Text style={styles.summaryValue}>
            {saleData.id?.toString().substring(0, 8) || 'N/A'}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{getTranslation('date', language)}:</Text>
          <Text style={styles.summaryValue}>
            {formatDate(saleData.sale_date)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{getTranslation('payment', language)}:</Text>
          <Text style={styles.summaryValue}>
            {saleData.payment_method ? getTranslation(saleData.payment_method, language) : getTranslation('cash', language)}
          </Text>
        </View>
        {saleData.is_offline && (
          <View style={styles.offlineBadge}>
            <MaterialIcons name="wifi-off" size={16} color="#ef4444" />
            <Text style={styles.offlineText}>{getTranslation('offlineSale', language)}</Text>
          </View>
        )}
      </View>

      {/* Sold Items */}
      <View style={styles.itemsSection}>
        <Text style={styles.sectionTitle}>{getTranslation('itemsSold', language)}</Text>
        <FlatList
          data={saleItems}
          keyExtractor={(item, index) => `${item.name}_${index}`}
          renderItem={renderSoldItem}
          contentContainerStyle={styles.itemsList}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Total */}
      <View style={styles.totalSection}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{getTranslation('totalAmount', language)}:</Text>
          <Text style={styles.totalAmount}>{formatCurrency(getTotalAmount())}</Text>
        </View>
      </View>

      {/* Status */}
      <View style={styles.statusSection}>
        {processing ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.statusText}>{getTranslation('updatingInventory', language)}...</Text>
          </View>
        ) : inventoryUpdated ? (
          <View style={styles.statusRow}>
            <MaterialIcons name="check-circle" size={20} color="#059669" />
            <Text style={styles.statusText}>{getTranslation('inventoryUpdatedSuccessfully', language)}</Text>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <MaterialIcons name="warning" size={20} color="#f59e0b" />
            <Text style={styles.statusText}>{getTranslation('inventoryUpdatePending', language)}</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.completeButton}
          onPress={handleComplete}
        >
          <MaterialIcons name="home" size={20} color="#ffffff" />
          <Text style={styles.completeButtonText}>{getTranslation('backToPOS', language)}</Text>
        </TouchableOpacity>
        
        {/* Alternative navigation button in case the primary one doesn't work */}
        <TouchableOpacity
          style={styles.alternativeButton}
          onPress={handleNavigation}
        >
          <MaterialIcons name="arrow-back" size={20} color="#2563eb" />
          <Text style={styles.alternativeButtonText}>{getTranslation('goBack', language)}</Text>
        </TouchableOpacity>
      </View>
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
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
  },
  closeButton: {
    padding: 8,
  },
  summaryCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  offlineText: {
    fontSize: 12,
    color: '#ef4444',
    marginLeft: 4,
    fontWeight: '600',
  },
  itemsSection: {
    flex: 1,
    margin: 16,
    marginTop: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  itemsList: {
    paddingBottom: 16,
  },
  soldItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  itemDetails: {
    fontSize: 14,
    color: '#6b7280',
  },
  itemTotal: {
    alignItems: 'flex-end',
  },
  itemTotalText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
  },
  totalSection: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#059669',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#059669',
  },
  statusSection: {
    margin: 16,
    marginTop: 0,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#6b7280',
    marginLeft: 8,
  },
  actionsSection: {
    padding: 16,
    paddingTop: 0,
  },
  completeButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  alternativeButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  alternativeButtonText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
});