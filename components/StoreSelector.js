import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useStore } from '../contexts/StoreContext';

export default function StoreSelector({ visible, onClose, onStoreSelect }) {
  const { stores, selectedStore, userRole } = useStore();

  if (userRole !== 'owner' || stores.length === 0) {
    return null;
  }

  const handleStoreSelect = (store) => {
    onStoreSelect(store);
    onClose();
  };

  const renderStoreItem = ({ item }) => (
    <TouchableOpacity
      style={[
        styles.storeItem,
        selectedStore?.id === item.id && styles.selectedStoreItem
      ]}
      onPress={() => handleStoreSelect(item)}
      accessibilityRole="button"
      accessibilityLabel={`Select store ${item.name}`}
    >
      <View style={[styles.iconContainer, selectedStore?.id === item.id && styles.selectedIconContainer]}>
        <MaterialIcons 
          name="store" 
          size={24} 
          color={selectedStore?.id === item.id ? "#ffffff" : "#64748b"} 
        />
      </View>
      <View style={styles.storeInfo}>
        <Text style={[
          styles.storeName,
          selectedStore?.id === item.id && styles.selectedStoreName
        ]}>
          {item.name}
        </Text>
        <Text style={styles.storeDescription} numberOfLines={1}>
          {item.description || 'No description'}
        </Text>
      </View>
      {selectedStore?.id === item.id && (
        <View style={styles.checkContainer}>
          <MaterialIcons name="check" size={20} color="#2563eb" />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Store</Text>
            <TouchableOpacity 
              onPress={onClose} 
              style={styles.closeButton}
              accessibilityLabel="Close store selector"
              accessibilityRole="button"
            >
              <MaterialIcons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={stores}
            renderItem={renderStoreItem}
            keyExtractor={(item) => item.id}
            style={styles.storeList}
            showsVerticalScrollIndicator={false}
            accessibilityLabel="Store list"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  storeList: {
    maxHeight: 400,
  },
  storeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  selectedStoreItem: {
    backgroundColor: '#f0f9ff',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIconContainer: {
    backgroundColor: '#2563eb',
  },
  storeInfo: {
    flex: 1,
    marginLeft: 16,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 2,
  },
  selectedStoreName: {
    color: '#2563eb',
  },
  storeDescription: {
    fontSize: 14,
    color: '#64748b',
  },
  checkContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
});