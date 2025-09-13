import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { getCurrentUser } from '../utils/authUtils';
import HeaderWithLogout from '../components/HeaderWithLogout';

export default function StoreManagementScreen({ navigation }) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [workerEmail, setWorkerEmail] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [assignedWorkers, setAssignedWorkers] = useState({});
  const [createStoreModal, setCreateStoreModal] = useState(false);
  const [storeName, setStoreName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const { language } = useLanguage();

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      setLoading(true);
      const { user } = await getCurrentUser();
      if (!user) {
        console.warn('No authenticated user found');
        return;
      }

      console.log('🌐 Online - loading stores from database');
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('owner_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading stores:', error);
        Alert.alert('Error', 'Failed to load stores');
        return;
      }

      setStores(data || []);
      await loadAssignedWorkers(data || []);
      console.log('✅ Cached stores for offline use');
    } catch (error) {
      console.error('Error in loadStores:', error);
      Alert.alert('Error', 'Failed to load stores');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadAssignedWorkers = async (storeList) => {
    try {
      const storeIds = storeList.map(store => store.id);
      if (storeIds.length === 0) return;
      
      const { data, error } = await supabase
        .from('worker_assignments')
        .select('store_id, worker_email')
        .in('store_id', storeIds)
        .eq('is_active', true);

      if (error) {
        console.error('Error loading assigned workers:', error);
        return;
      }

      const workersMap = {};
      data?.forEach(assignment => {
        workersMap[assignment.store_id] = assignment.worker_email;
      });
      setAssignedWorkers(workersMap);
    } catch (error) {
      console.error('Error in loadAssignedWorkers:', error);
    }
  };

  const handleAssignWorker = (store) => {
    setSelectedStore(store);
    setWorkerEmail('');
    setModalVisible(true);
  };

  const handleRemoveWorker = (store) => {
    const workerEmail = assignedWorkers[store.id];
    Alert.alert(
      'Remove Worker',
      `Remove ${workerEmail} from ${store.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: () => removeWorkerAssignment(store.id)
        }
      ]
    );
  };

  const assignWorker = async () => {
    if (!workerEmail || !workerEmail.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      const { user } = await getCurrentUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      // Check if worker is already assigned to this store
      if (assignedWorkers[selectedStore.id]) {
        Alert.alert('Error', 'This store already has an assigned worker. Remove the current worker first.');
        return;
      }

      const { data, error } = await supabase
        .from('worker_assignments')
        .insert({
          store_id: selectedStore.id,
          worker_email: workerEmail.toLowerCase().trim(),
          assigned_by: user.id
        });

      if (error) throw error;

      Alert.alert(
        'Success',
        `${workerEmail} has been assigned to ${selectedStore.name}`
      );

      setModalVisible(false);
      setWorkerEmail('');
      setSelectedStore(null);
      loadStores();
    } catch (error) {
      console.error('Error assigning worker:', error);
      Alert.alert('Error', `Failed to assign worker: ${error.message}`);
    }
  };

  const removeWorkerAssignment = async (storeId) => {
    try {
      const { error } = await supabase
        .from('worker_assignments')
        .update({ is_active: false })
        .eq('store_id', storeId)
        .eq('is_active', true);

      if (error) throw error;

      Alert.alert('Success', 'Worker removed successfully');
      loadStores();
    } catch (error) {
      console.error('Error removing worker:', error);
      Alert.alert('Error', 'Failed to remove worker');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStores();
  };

  const createStore = async () => {
    if (!storeName.trim()) {
      Alert.alert('Error', 'Please enter a store name');
      return;
    }

    try {
      const { user } = await getCurrentUser();
      if (!user) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      const { data, error } = await supabase
        .from('stores')
        .insert({
          name: storeName.trim(),
          address: storeAddress.trim() || null,
          owner_id: user.id,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      Alert.alert('Success', `Store "${storeName}" created successfully!`);
      setCreateStoreModal(false);
      setStoreName('');
      setStoreAddress('');
      loadStores();
    } catch (error) {
      console.error('Error creating store:', error);
      Alert.alert('Error', `Failed to create store: ${error.message}`);
    }
  };

  const renderStoreItem = ({ item }) => {
    const assignedWorker = assignedWorkers[item.id];
    
    return (
      <View style={styles.storeCard}>
        <View style={styles.storeHeader}>
          <View style={styles.storeInfo}>
            <MaterialIcons name="store" size={28} color="#1f2937" />
            <View style={styles.storeDetails}>
              <Text style={styles.storeName}>{item.name}</Text>
              <Text style={styles.storeAddress}>
                {item.address || 'No address'}
              </Text>
            </View>
          </View>
        </View>
        
        <View style={styles.workerSection}>
          <Text style={styles.workerLabel}>Assigned Worker:</Text>
          {assignedWorker ? (
            <View style={styles.workerInfo}>
              <View style={styles.workerDetails}>
                <MaterialIcons name="person" size={20} color="#059669" />
                <Text style={styles.workerEmail}>{assignedWorker}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveWorker(item)}
              >
                <MaterialIcons name="remove-circle" size={20} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.assignButton}
              onPress={() => handleAssignWorker(item)}
            >
              <MaterialIcons name="person-add" size={20} color="#ffffff" />
              <Text style={styles.assignButtonText}>Assign Worker</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1f2937" />
        <Text style={styles.loadingText}>Loading stores...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderWithLogout title="Store Management" />
      
      <FlatList
        data={stores}
        renderItem={renderStoreItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1f2937']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="store" size={64} color="#9ca3af" />
            <Text style={styles.emptyText}>No stores found</Text>
            <Text style={styles.emptySubtext}>Create your first store to get started</Text>
            <TouchableOpacity
              style={styles.createStoreButton}
              onPress={() => setCreateStoreModal(true)}
            >
              <MaterialIcons name="add" size={20} color="#ffffff" />
              <Text style={styles.createStoreButtonText}>Create Store</Text>
            </TouchableOpacity>
          </View>
        }
      />
      
      {/* Floating Action Button for creating stores */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setCreateStoreModal(true)}
      >
        <MaterialIcons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>
      
      {/* Create Store Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createStoreModal}
        onRequestClose={() => setCreateStoreModal(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Store</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setCreateStoreModal(false)}
              >
                <MaterialIcons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Store Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter store name"
                placeholderTextColor="#9ca3af"
                value={storeName}
                onChangeText={setStoreName}
                autoCapitalize="words"
              />
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Address (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter store address"
                placeholderTextColor="#9ca3af"
                value={storeAddress}
                onChangeText={setStoreAddress}
                multiline
                numberOfLines={2}
              />
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setCreateStoreModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={createStore}
              >
                <Text style={styles.confirmButtonText}>Create Store</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      {/* Worker Assignment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Worker</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <MaterialIcons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalSubtitle}>
              Assign a worker to {selectedStore?.name}
            </Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Worker Email</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter worker's email address"
                placeholderTextColor="#9ca3af"
                value={workerEmail}
                onChangeText={setWorkerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={assignWorker}
              >
                <Text style={styles.confirmButtonText}>Assign</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  listContainer: {
    padding: 16,
  },
  storeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  storeHeader: {
    marginBottom: 16,
  },
  storeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeDetails: {
    marginLeft: 12,
    flex: 1,
  },
  storeName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  storeAddress: {
    fontSize: 14,
    color: '#6b7280',
  },
  workerSection: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 16,
  },
  workerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  workerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workerDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  workerEmail: {
    fontSize: 16,
    color: '#059669',
    marginLeft: 8,
    fontWeight: '500',
  },
  removeButton: {
    padding: 8,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f2937',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  assignButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  createStoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 16,
  },
  createStoreButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#1f2937',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    margin: 20,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeButton: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#1f2937',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
});