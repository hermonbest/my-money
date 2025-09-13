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
import { useLanguage } from '../contexts/LanguageContext'; // Import useLanguage hook
import { useStore } from '../contexts/StoreContext'; // Import useStore hook
import { getTranslation } from '../utils/translations'; // Import getTranslation function

export default function StoreManagementScreen({ navigation }) {
  const { language } = useLanguage();
  const { refreshStores } = useStore(); // Use language context
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
          Alert.alert(getTranslation('error', language), getTranslation('failedToLoadStores', language));
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
      Alert.alert(getTranslation('error', language), getTranslation('failedToLoadStores', language));
    } finally {
      setLoading(false);
    }
  };

  const handleAddStore = async () => {
    if (!newStore.name.trim()) {
      Alert.alert(getTranslation('error', language), getTranslation('storeNameRequired', language));
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
          Alert.alert(getTranslation('error', language), getTranslation('failedToCreateStore', language));
          return;
        }

        const newStores = [...stores, data];
        setStores(newStores);
        
        // Update cache
        await AsyncStorage.setItem(`stores_${user.id}`, JSON.stringify(newStores));
        console.log('✅ Updated stores cache');
        
        // CRITICAL FIX: Refresh the store context to update selectedStore
        if (refreshStores) {
          console.log('🔄 Refreshing store context after creation');
          await refreshStores();
        }
        
        Alert.alert(getTranslation('success', language), getTranslation('storeCreatedSuccessfully', language));
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
        
        Alert.alert(getTranslation('success', language), getTranslation('storeCreatedOffline', language));
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
      Alert.alert(getTranslation('error', language), getTranslation('failedToCreateStore', language));
    }
  };

  const handleEditStore = (store) => {
    // TODO: Implement edit store functionality
    Alert.alert(getTranslation('editStore', language), getTranslation('editFunctionalityComingSoon', language));
  };

  // Invitation flow disabled (direct assignment only)
  const handleInviteWorker = (store) => {
    Alert.alert(getTranslation('info', language), getTranslation('invitationsDisabled', language));
  };

  const handleViewWorkers = (store) => {
    // Navigate to worker invite screen
    if (navigation && navigation.navigate) {
      try {
        navigation.navigate('WorkerInvite', { store });
      } catch (error) {
        console.error('Navigation error:', error);
        Alert.alert(getTranslation('error', language), getTranslation('unableToNavigateWorkerInvite', language));
      }
    } else {
      console.warn('Navigation not available - this is normal during app startup');
      Alert.alert(getTranslation('info', language), getTranslation('pleaseWaitForAppLoad', language));
    }
  };

// Replace the handleDirectAssignWorker function in StoreManagementScreen.js
const handleDirectAssignWorker = async (store) => {
  try {
    // Get current user profile
    const { user } = await getCurrentUser();
    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    // Get user's profile to get the profile ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      Alert.alert('Error', 'Could not find user profile');
      return;
    }

    Alert.prompt(
      'Assign Worker',
      `Enter worker's email address to assign them to ${store.name}:`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Assign', 
          onPress: async (email) => {
            if (!email || !email.includes('@')) {
              Alert.alert('Error', 'Please enter a valid email address');
              return;
            }

            try {
              // Add worker assignment
              const { data, error } = await supabase
                .from('worker_assignments')
                .insert({
                  store_id: store.id,
                  worker_email: email.toLowerCase().trim(),
                  assigned_by: profile.id
                });

              if (error) throw error;

              Alert.alert(
                'Success',
                `Worker ${email} has been assigned to ${store.name}. They can now sign up and will automatically be assigned to this store.`
              );

              // Refresh the store data
              loadStores();
            } catch (error) {
              console.error('Error assigning worker:', error);
              Alert.alert('Error', 'Failed to assign worker. Please try again.');
            }
          }
        }
      ],
      'plain-text'
    );
  } catch (error) {
    console.error('Error in handleDirectAssignWorker:', error);
    Alert.alert('Error', 'Failed to assign worker. Please try again.');
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
            {item.description || getTranslation('noDescription', language)}
          </Text>
          <Text style={styles.storeAddress}>
            {item.address || getTranslation('noAddress', language)}
          </Text>
        </View>
      </View>
      
      <View style={styles.storeActions}>
      <TouchableOpacity
  style={styles.assignButton}
  onPress={() => handleDirectAssignWorker(item)}
>
  <MaterialIcons name="person-add" size={20} color="#ffffff" />
  <Text style={styles.assignButtonText}>Assign Worker</Text>
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
        <Text style={styles.loadingText}>{getTranslation('loading', language)} {getTranslation('stores', language).toLowerCase()}...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{getTranslation('storeManagement', language)}</Text>
        <Text style={styles.subtitle}>
          {getTranslation('manageStoresAndWorkers', language)}
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
            <Text style={styles.emptyTitle}>{getTranslation('noStoresYet', language)}</Text>
            <Text style={styles.emptyDescription}>
              {getTranslation('createFirstStore', language)}
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddModal(true)}
      >
        <MaterialIcons name="add" size={24} color="#ffffff" />
        <Text style={styles.addButtonText}>{getTranslation('addStore', language)}</Text>
      </TouchableOpacity>

      {/* Add Store Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{getTranslation('addNewStore', language)}</Text>
            <TouchableOpacity
              onPress={() => setShowAddModal(false)}
              style={styles.closeButton}
            >
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{getTranslation('storeName', language)} *</Text>
              <TextInput
                style={styles.input}
                value={newStore.name}
                onChangeText={(text) => setNewStore({...newStore, name: text})}
                placeholder={getTranslation('enterStoreName', language)}
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{getTranslation('description', language)}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newStore.description}
                onChangeText={(text) => setNewStore({...newStore, description: text})}
                placeholder={getTranslation('enterStoreDescription', language)}
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{getTranslation('address', language)}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newStore.address}
                onChangeText={(text) => setNewStore({...newStore, address: text})}
                placeholder={getTranslation('enterStoreAddress', language)}
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{getTranslation('phone', language)}</Text>
              <TextInput
                style={styles.input}
                value={newStore.phone}
                onChangeText={(text) => setNewStore({...newStore, phone: text})}
                placeholder={getTranslation('enterPhoneNumber', language)}
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{getTranslation('email', language)}</Text>
              <TextInput
                style={styles.input}
                value={newStore.email}
                onChangeText={(text) => setNewStore({...newStore, email: text})}
                placeholder={getTranslation('enterEmailAddress', language)}
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
              <Text style={styles.cancelButtonText}>{getTranslation('cancel', language)}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleAddStore}
            >
              <Text style={styles.saveButtonText}>{getTranslation('createStore', language)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
} 
// Add this button in your store management UI

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
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  listContainer: {
    padding: 16,
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
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  storeInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  storeIcon: {
    marginRight: 12,
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
    fontSize: 14,
    color: '#6b7280',
  },
  storeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
  },
  assignButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  actionButton: {
    marginLeft: 16,
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  assignButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: '#2563eb',
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
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
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginRight: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginLeft: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});