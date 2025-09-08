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
    >
      <MaterialIcons 
        name="store" 
        size={24} 
        color={selectedStore?.id === item.id ? '#2563eb' : '#6b7280'} 
      />
      <View style={styles.storeInfo}>
        <Text style={[
          styles.storeName,
          selectedStore?.id === item.id && styles.selectedStoreName
        ]}>
          {item.name}
        </Text>
        <Text style={styles.storeDescription}>
          {item.description || 'No description'}
        </Text>
      </View>
      {selectedStore?.id === item.id && (
        <MaterialIcons name="check" size={20} color="#2563eb" />
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Store</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={stores}
            renderItem={renderStoreItem}
            keyExtractor={(item) => item.id}
            style={styles.storeList}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  closeButton: {
    padding: 4,
  },
  storeList: {
    maxHeight: 400,
  },
  storeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  selectedStoreItem: {
    backgroundColor: '#eff6ff',
  },
  storeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  selectedStoreName: {
    color: '#2563eb',
  },
  storeDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
});
