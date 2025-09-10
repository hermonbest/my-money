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
import { getTranslation } from '../utils/translations'; // Import getTranslation function

export default function StoreManagementScreen({ navigation }) {
  const { language } = useLanguage(); // Use language context
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

        setStores([...stores, data]);
        
        // Update cache
        await AsyncStorage.setItem(`stores_${user.id}`, JSON.stringify([...stores, data]));
        console.log('✅ Updated stores cache');
        
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

  const handleDirectAssignWorker = (store) => {
    // Navigate to direct worker assignment screen
    if (navigation && navigation.navigate) {
      try {
        navigation.navigate('DirectWorkerAssign', { store });
      } catch (error) {
        console.error('Navigation error:', error);
        Alert.alert(getTranslation('error', language), getTranslation('unableToNavigateDirectAssign', language));
      }
    } else {
      console.warn('Navigation not available - this is normal during app startup');
      Alert.alert(getTranslation('info', language), getTranslation('pleaseWaitForAppLoad', language));
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

// ... existing styles ...