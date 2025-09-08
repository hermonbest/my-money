import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { getCurrentUser } from '../utils/authUtils';
import { offlineManager } from '../utils/OfflineManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function StoreManagementScreen({ navigation }) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStore, setNewStore] = useState({
    name: '',
    description: '',
    address: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      setLoading(true);
      
      // Get user's owned stores
      const { user } = await getCurrentUser();
      if (!user) return;

      // Check if online
      if (offlineManager.isConnected()) {
        console.log('🌐 Online - loading stores from database');
        const { data: stores, error } = await supabase
          .from('stores')
          .select('*')
          .eq('owner_id', user.id)
          .order('name');

        if (error) {
          console.error('Error loading stores:', error);
          Alert.alert('Error', 'Failed to load stores');
          return;
        }

        setStores(stores || []);
        
        // Cache stores for offline use
        await AsyncStorage.setItem(`stores_${user.id}`, JSON.stringify(stores || []));
        console.log('✅ Cached stores for offline use');
      } else {
        console.log('📱 Offline - loading stores from cache');
        // Load from cache
        const cachedStores = await AsyncStorage.getItem(`stores_${user.id}`);
        if (cachedStores) {
          setStores(JSON.parse(cachedStores));
          console.log('✅ Loaded stores from cache');
        } else {
          setStores([]);
          console.log('⚠️ No cached stores found');
        }
      }

    } catch (error) {
      console.error('Error loading stores:', error);
      Alert.alert('Error', 'Failed to load stores');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStore = async () => {
    if (!newStore.name.trim()) {
      Alert.alert('Error', 'Store name is required');
      return;
    }

    try {
      const { user } = await getCurrentUser();
      if (!user) return;

      // Check if online
      if (offlineManager.isConnected()) {
        console.log('🌐 Online - creating store in database');
        const { data, error } = await supabase
          .from('stores')
          .insert({
            owner_id: user.id,
            name: newStore.name.trim(),
            description: newStore.description.trim() || null,
            address: newStore.address.trim() || null,
            phone: newStore.phone.trim() || null,
            email: newStore.email.trim() || null,
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating store:', error);
          Alert.alert('Error', 'Failed to create store');
          return;
        }

        setStores([...stores, data]);
        
        // Update cache
        await AsyncStorage.setItem(`stores_${user.id}`, JSON.stringify([...stores, data]));
        console.log('✅ Updated stores cache');
        
        Alert.alert('Success', 'Store created successfully');
      } else {
        console.log('📱 Offline - creating temporary store');
        // Create temporary store for offline use
        const tempStore = {
          id: `temp_store_${Date.now()}`,
          owner_id: user.id,
          name: newStore.name.trim(),
          description: newStore.description.trim() || null,
          address: newStore.address.trim() || null,
          phone: newStore.phone.trim() || null,
          email: newStore.email.trim() || null,
          created_at: new Date().toISOString(),
          is_offline: true
        };

        setStores([...stores, tempStore]);
        
        // Update cache
        await AsyncStorage.setItem(`stores_${user.id}`, JSON.stringify([...stores, tempStore]));
        console.log('✅ Created temporary store offline');
        
        Alert.alert('Success', 'Store created offline - will sync when online');
      }

      setShowAddModal(false);
      setNewStore({
        name: '',
        description: '',
        address: '',
        phone: '',
        email: '',
      });

    } catch (error) {
      console.error('Error creating store:', error);
      Alert.alert('Error', 'Failed to create store');
    }
  };

  const handleEditStore = (store) => {
    // TODO: Implement edit store functionality
    Alert.alert('Edit Store', 'Edit functionality will be implemented soon');
  };

  // Invitation flow disabled (direct assignment only)
  const handleInviteWorker = (store) => {
    Alert.alert('Info', 'Invitations are disabled. Use Direct Assign (green button).');
  };

  const handleViewWorkers = (store) => {
    // Navigate to worker invite screen
    if (navigation && navigation.navigate) {
      try {
        navigation.navigate('WorkerInvite', { store });
      } catch (error) {
        console.error('Navigation error:', error);
        Alert.alert('Error', 'Unable to navigate to worker invite screen');
      }
    } else {
      console.warn('Navigation not available - this is normal during app startup');
      Alert.alert('Info', 'Please wait for the app to fully load, then try again');
    }
  };

  const handleDirectAssignWorker = (store) => {
    // Navigate to direct worker assignment screen
    if (navigation && navigation.navigate) {
      try {
        navigation.navigate('DirectWorkerAssign', { store });
      } catch (error) {
        console.error('Navigation error:', error);
        Alert.alert('Error', 'Unable to navigate to direct assignment screen');
      }
    } else {
      console.warn('Navigation not available - this is normal during app startup');
      Alert.alert('Info', 'Please wait for the app to fully load, then try again');
    }
  };

  const renderStoreItem = ({ item }) => (
    <View style={styles.storeItem}>
      <View style={styles.storeInfo}>
        <MaterialIcons 
          name="store" 
          size={24} 
          color="#2563eb" 
          style={styles.storeIcon}
        />
        <View style={styles.storeDetails}>
          <Text style={styles.storeName}>{item.name}</Text>
          <Text style={styles.storeDescription}>
            {item.description || 'No description'}
          </Text>
          <Text style={styles.storeAddress}>
            {item.address || 'No address'}
          </Text>
        </View>
      </View>
      
      <View style={styles.storeActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleDirectAssignWorker(item)}
        >
          <MaterialIcons name="person-add" size={20} color="#10b981" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleViewWorkers(item)}
        >
          <MaterialIcons name="people" size={20} color="#2563eb" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEditStore(item)}
        >
          <MaterialIcons name="edit" size={20} color="#2563eb" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading stores...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Store Management</Text>
        <Text style={styles.subtitle}>
          Manage your stores and workers
        </Text>
      </View>

      <FlatList
        data={stores}
        keyExtractor={(item) => item.id}
        renderItem={renderStoreItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="store" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No stores yet</Text>
            <Text style={styles.emptyDescription}>
              Create your first store to get started
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddModal(true)}
      >
        <MaterialIcons name="add" size={24} color="#ffffff" />
        <Text style={styles.addButtonText}>Add Store</Text>
      </TouchableOpacity>

      {/* Add Store Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add New Store</Text>
            <TouchableOpacity
              onPress={() => setShowAddModal(false)}
              style={styles.closeButton}
            >
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Store Name *</Text>
              <TextInput
                style={styles.input}
                value={newStore.name}
                onChangeText={(text) => setNewStore({...newStore, name: text})}
                placeholder="Enter store name"
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newStore.description}
                onChangeText={(text) => setNewStore({...newStore, description: text})}
                placeholder="Enter store description"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Address</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newStore.address}
                onChangeText={(text) => setNewStore({...newStore, address: text})}
                placeholder="Enter store address"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                value={newStore.phone}
                onChangeText={(text) => setNewStore({...newStore, phone: text})}
                placeholder="Enter phone number"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={newStore.email}
                onChangeText={(text) => setNewStore({...newStore, email: text})}
                placeholder="Enter email address"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowAddModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleAddStore}
            >
              <Text style={styles.saveButtonText}>Create Store</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  listContainer: {
    padding: 20,
  },
  storeItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  storeInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  storeIcon: {
    marginRight: 16,
    marginTop: 2,
  },
  storeDetails: {
    flex: 1,
  },
  storeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  storeDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  storeAddress: {
    fontSize: 12,
    color: '#9ca3af',
  },
  storeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#9ca3af',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  saveButton: {
    flex: 1,
    padding: 16,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
});