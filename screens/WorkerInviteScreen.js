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
import { useLanguage } from '../contexts/LanguageContext'; // Import useLanguage hook
import { getTranslation } from '../utils/translations'; // Import getTranslation function

export default function WorkerInviteScreen({ navigation, route }) {
  const { language } = useLanguage(); // Use language context
  const { store } = route.params || {};
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newInvitation, setNewInvitation] = useState({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
  });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      setLoading(true);
      
      if (!store?.id) return;

      const { data: invitations, error } = await supabase
        .from('worker_invitations')
        .select('*')
        .eq('store_id', store.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading invitations:', error);
        Alert.alert(getTranslation('error', language), getTranslation('failedToLoadInvitations', language));
        return;
      }

      setInvitations(invitations || []);

    } catch (error) {
      console.error('Error loading invitations:', error);
      Alert.alert(getTranslation('error', language), getTranslation('failedToLoadInvitations', language));
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!newInvitation.email.trim()) {
      Alert.alert(getTranslation('error', language), getTranslation('emailIsRequired', language));
      return;
    }

    if (!isValidEmail(newInvitation.email)) {
      Alert.alert(getTranslation('error', language), getTranslation('enterValidEmail', language));
      return;
    }

    try {
      setSending(true);
      
      const { user } = await getCurrentUser();
      if (!user) return;

      // Use the new worker invitation system
      const { data, error } = await supabase.rpc('create_worker_invitation', {
        p_store_id: store.id,
        p_worker_email: newInvitation.email.trim(),
        p_first_name: newInvitation.firstName || null,
        p_last_name: newInvitation.lastName || null,
        p_password: newInvitation.password || null
      });

      if (error) {
        console.error('Error creating invitation:', error);
        Alert.alert(getTranslation('error', language), error.message || getTranslation('failedToCreateInvitation', language));
        return;
      }

      if (data.success) {
        // Show success with credentials for the worker
        Alert.alert(
          getTranslation('workerInvitedSuccessfully', language),
          `${getTranslation('email', language)}: ${data.worker_email}\n${getTranslation('password', language)}: ${data.temp_password}\n${getTranslation('invitationCode', language)}: ${data.invitation_code}\n\n${getTranslation('shareCredentialsWithWorker', language)}`,
          [
            {
              text: getTranslation('ok', language),
              onPress: () => {
                setNewInvitation({ email: '', firstName: '', lastName: '', password: '' });
                setShowInviteModal(false);
                loadInvitations();
              },
            },
          ]
        );
      } else {
        Alert.alert(getTranslation('error', language), data.error || getTranslation('failedToCreateInvitation', language));
      }

    } catch (error) {
      console.error('Error creating invitation:', error);
      Alert.alert(getTranslation('error', language), getTranslation('failedToCreateInvitation', language));
    } finally {
      setSending(false);
    }
  };

  const handleResendInvitation = async (invitation) => {
    try {
      const { user } = await getCurrentUser();
      if (!user) return;

      const { data, error } = await supabase.rpc('create_worker_invitation', {
        p_store_id: store.id,
        p_invited_by: user.id,
        p_email: invitation.email,
        p_expires_hours: 168, // 7 days
      });

      if (error) {
        console.error('Error resending invitation:', error);
        Alert.alert(getTranslation('error', language), error.message || getTranslation('failedToResendInvitation', language));
        return;
      }

      if (data.success) {
        Alert.alert(getTranslation('success', language), getTranslation('invitationResentSuccessfully', language));
        loadInvitations();
      } else {
        Alert.alert(getTranslation('error', language), data.error || getTranslation('failedToResendInvitation', language));
      }

    } catch (error) {
      console.error('Error resending invitation:', error);
      Alert.alert(getTranslation('error', language), getTranslation('failedToResendInvitation', language));
    }
  };

  const handleCancelInvitation = async (invitation) => {
    Alert.alert(
      getTranslation('cancelInvitation', language),
      getTranslation('confirmCancelInvitation', language),
      [
        { text: getTranslation('no', language), style: 'cancel' },
        {
          text: getTranslation('yes', language),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('worker_invitations')
                .update({ is_used: true })
                .eq('id', invitation.id);

              if (error) {
                console.error('Error canceling invitation:', error);
                Alert.alert(getTranslation('error', language), getTranslation('failedToCancelInvitation', language));
                return;
              }

              loadInvitations();
            } catch (error) {
              console.error('Error canceling invitation:', error);
              Alert.alert(getTranslation('error', language), getTranslation('failedToCancelInvitation', language));
            }
          },
        },
      ]
    );
  };

  const handleRemoveInvitation = async (invitation) => {
    Alert.alert(
      getTranslation('removeInvitation', language),
      getTranslation('confirmRemoveInvitation', language),
      [
        { text: getTranslation('no', language), style: 'cancel' },
        {
          text: getTranslation('yes', language),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('worker_invitations')
                .delete()
                .eq('id', invitation.id);

              if (error) {
                console.error('Error removing invitation:', error);
                Alert.alert(getTranslation('error', language), getTranslation('failedToRemoveInvitation', language));
                return;
              }

              loadInvitations();
            } catch (error) {
              console.error('Error removing invitation:', error);
              Alert.alert(getTranslation('error', language), getTranslation('failedToRemoveInvitation', language));
            }
          },
        },
      ]
    );
  };

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const getInvitationStatus = (invitation) => {
    if (invitation.is_used) {
      return { text: getTranslation('accepted', language), color: '#10b981' };
    }
    if (new Date(invitation.expires_at) < new Date()) {
      return { text: getTranslation('expired', language), color: '#ef4444' };
    }
    return { text: getTranslation('pending', language), color: '#f59e0b' };
  };

  const renderInvitationItem = ({ item }) => {
    const status = getInvitationStatus(item);
    
    return (
      <View style={styles.invitationItem}>
        <View style={styles.invitationInfo}>
          <Text style={styles.invitationEmail}>{item.email}</Text>
          <Text style={styles.invitationDate}>
            {getTranslation('sent', language)}: {new Date(item.created_at).toLocaleDateString()}
          </Text>
          <Text style={[styles.invitationStatus, { color: status.color }]}>
            {status.text}
          </Text>
          {item.invitation_code && (
            <View style={styles.invitationCodeContainer}>
              <Text style={styles.invitationCodeLabel}>
                {getTranslation('invitationCode', language)}:
              </Text>
              <Text style={styles.invitationCode}>{item.invitation_code}</Text>
            </View>
          )}
        </View>
        
        <View style={styles.invitationActions}>
          {!item.is_used && new Date(item.expires_at) > new Date() && (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleResendInvitation(item)}
              >
                <MaterialIcons name="refresh" size={20} color="#2563eb" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleCancelInvitation(item)}
              >
                <MaterialIcons name="cancel" size={20} color="#ef4444" />
              </TouchableOpacity>
            </>
          )}
          
          {item.is_used && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleRemoveInvitation(item)}
            >
              <MaterialIcons name="delete" size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>{getTranslation('loading', language)} {getTranslation('invitations', language).toLowerCase()}...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{getTranslation('workerInvitations', language)}</Text>
        <Text style={styles.subtitle}>
          {getTranslation('inviteWorkersTo', language)} {store?.name || getTranslation('thisStore', language)}
        </Text>
      </View>

      <FlatList
        data={invitations}
        keyExtractor={(item) => item.id}
        renderItem={renderInvitationItem}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="person-add" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>{getTranslation('noInvitationsYet', language)}</Text>
            <Text style={styles.emptyDescription}>
              {getTranslation('inviteWorkersToHelp', language)}
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.inviteButton}
        onPress={() => setShowInviteModal(true)}
      >
        <MaterialIcons name="person-add" size={24} color="#ffffff" />
        <Text style={styles.inviteButtonText}>{getTranslation('inviteWorker', language)}</Text>
      </TouchableOpacity>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{getTranslation('inviteWorker', language)}</Text>
            <TouchableOpacity
              onPress={() => setShowInviteModal(false)}
              style={styles.closeButton}
            >
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{getTranslation('emailAddress', language)} *</Text>
              <TextInput
                style={styles.input}
                value={newInvitation.email}
                onChangeText={(text) => setNewInvitation({...newInvitation, email: text})}
                placeholder={getTranslation('enterWorkerEmail', language)}
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{getTranslation('firstNameOptional', language)}</Text>
              <TextInput
                style={styles.input}
                value={newInvitation.firstName}
                onChangeText={(text) => setNewInvitation({...newInvitation, firstName: text})}
                placeholder={getTranslation('enterWorkerFirstName', language)}
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{getTranslation('lastNameOptional', language)}</Text>
              <TextInput
                style={styles.input}
                value={newInvitation.lastName}
                onChangeText={(text) => setNewInvitation({...newInvitation, lastName: text})}
                placeholder={getTranslation('enterWorkerLastName', language)}
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{getTranslation('passwordOptional', language)}</Text>
              <TextInput
                style={styles.input}
                value={newInvitation.password}
                onChangeText={(text) => setNewInvitation({...newInvitation, password: text})}
                placeholder={getTranslation('enterCustomPassword', language)}
                placeholderTextColor="#9ca3af"
                secureTextEntry={true}
                autoCorrect={false}
              />
            </View>

            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={20} color="#2563eb" />
              <Text style={styles.infoText}>
                {getTranslation('workerAutoRegistered', language)}
              </Text>
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowInviteModal(false)}
            >
              <Text style={styles.cancelButtonText}>{getTranslation('cancel', language)}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.sendButton, sending && styles.buttonDisabled]}
              onPress={handleSendInvitation}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.sendButtonText}>{getTranslation('sendInvitation', language)}</Text>
              )}
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
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  listContainer: {
    padding: 16,
  },
  invitationItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  invitationInfo: {
    flex: 1,
  },
  invitationEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  invitationDate: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  invitationStatus: {
    fontSize: 14,
    fontWeight: '500',
  },
  invitationActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  inviteButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#2563eb',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  inviteButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1e40af',
    marginLeft: 8,
    flex: 1,
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
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingVertical: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  sendButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    marginLeft: 8,
    alignItems: 'center',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  invitationCodeContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  invitationCodeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginRight: 8,
  },
  invitationCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    fontFamily: 'monospace',
  },
});