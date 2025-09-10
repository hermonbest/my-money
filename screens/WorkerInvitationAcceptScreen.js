import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { getCurrentUser } from '../utils/authUtils';
import { useLanguage } from '../contexts/LanguageContext'; // Import useLanguage hook
import { getTranslation } from '../utils/translations'; // Import getTranslation function

export default function WorkerInvitationAcceptScreen({ navigation }) {
  const { language } = useLanguage(); // Use language context
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's email
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', user.id)
        .single();

      if (!profile?.email) {
        setInvitations([]);
        return;
      }

      // Get pending invitations for this email
      const { data: invitationsData, error } = await supabase
        .from('worker_invitations')
        .select(`
          *,
          stores:store_id(
            id,
            name,
            description,
            address
          )
        `)
        .eq('email', profile.email)
        .eq('is_used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading invitations:', error);
        Alert.alert(getTranslation('error', language), getTranslation('failedToLoadInvitations', language));
        return;
      }

      setInvitations(invitationsData || []);

    } catch (error) {
      console.error('Error loading invitations:', error);
      Alert.alert(getTranslation('error', language), getTranslation('failedToLoadInvitations', language));
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async (invitation) => {
    Alert.alert(
      getTranslation('acceptInvitation', language),
      `${getTranslation('confirmJoinStoreAsWorker', language).replace('{storeName}', invitation.stores?.name)}`,
      [
        { text: getTranslation('cancel', language), style: 'cancel' },
        {
          text: getTranslation('accept', language),
          onPress: async () => {
            try {
              const { user } = await getCurrentUser();
              if (!user) return;

              const { data, error } = await supabase.rpc('accept_worker_invitation', {
                p_token: invitation.invitation_token,
                p_user_id: user.id
              });

              if (error) {
                console.error('Error accepting invitation:', error);
                Alert.alert(getTranslation('error', language), error.message || getTranslation('failedToAcceptInvitation', language));
                return;
              }

              if (data.success) {
                Alert.alert(
                  getTranslation('success', language), 
                  `${getTranslation('successfullyJoinedStoreAsWorker', language).replace('{storeName}', data.store_name)}`,
                  [
                    {
                      text: getTranslation('ok', language),
                      onPress: () => {
                        // Refresh invitations
                        loadInvitations();
                        // Navigate to worker dashboard or main screen
                        navigation.navigate('Main');
                      }
                    }
                  ]
                );
              } else {
                Alert.alert(getTranslation('error', language), data.error || getTranslation('failedToAcceptInvitation', language));
              }

            } catch (error) {
              console.error('Error accepting invitation:', error);
              Alert.alert(getTranslation('error', language), getTranslation('failedToAcceptInvitation', language));
            }
          }
        }
      ]
    );
  };

  const getInvitationStatus = (invitation) => {
    if (invitation.is_used) {
      return { text: 'Accepted', color: '#10b981' };
    }
    if (new Date(invitation.expires_at) < new Date()) {
      return { text: 'Expired', color: '#ef4444' };
    }
    return { text: 'Pending', color: '#f59e0b' };
  };

  const renderInvitationItem = ({ item }) => {
    const status = getInvitationStatus(item);
    const isExpired = new Date(item.expires_at) < new Date();
    
    return (
      <View style={styles.invitationItem}>
        <View style={styles.storeInfo}>
          <MaterialIcons 
            name="store" 
            size={32} 
            color="#2563eb" 
            style={styles.storeIcon}
          />
          <View style={styles.storeDetails}>
            <Text style={styles.storeName}>{item.stores?.name || getTranslation('unknownStore', language)}</Text>
            <Text style={styles.storeDescription}>
              {item.stores?.description || getTranslation('noDescriptionAvailable', language)}
            </Text>
            <Text style={styles.storeAddress}>
              {item.stores?.address || getTranslation('noAddressAvailable', language)}
            </Text>
            <Text style={styles.invitationDate}>
              {getTranslation('invited', language)}: {new Date(item.created_at).toLocaleDateString()}
            </Text>
            <Text style={styles.expirationDate}>
              {getTranslation('expires', language)}: {new Date(item.expires_at).toLocaleDateString()}
            </Text>
          </View>
        </View>
        
        <View style={styles.invitationActions}>
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.text}
          </Text>
          
          {!item.is_used && !isExpired && (
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => handleAcceptInvitation(item)}
            >
              <MaterialIcons name="check" size={20} color="#ffffff" />
              <Text style={styles.acceptButtonText}>{getTranslation('accept', language)}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInvitations();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>{getTranslation('loadingInvitations', language)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{getTranslation('workerInvitations', language)}</Text>
        <Text style={styles.subtitle}>
          {getTranslation('acceptInvitationsToJoinStoresAsWorker', language)}
        </Text>
      </View>

      <FlatList
        data={invitations}
        keyExtractor={(item) => item.id}
        renderItem={renderInvitationItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="inbox" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>{getTranslation('noInvitations', language)}</Text>
            <Text style={styles.emptyDescription}>
              {getTranslation('noPendingWorkerInvitations', language)}
            </Text>
          </View>
        }
      />
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
  invitationItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  storeInfo: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  storeIcon: {
    marginRight: 16,
    marginTop: 4,
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
    marginBottom: 8,
  },
  invitationDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 2,
  },
  expirationDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  invitationActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
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
});
