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

export default function WorkerInviteScreen({ navigation, route }) {
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
        Alert.alert('Error', 'Failed to load invitations');
        return;
      }

      setInvitations(invitations || []);

    } catch (error) {
      console.error('Error loading invitations:', error);
      Alert.alert('Error', 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!newInvitation.email.trim()) {
      Alert.alert('Error', 'Email is required');
      return;
    }

    if (!isValidEmail(newInvitation.email)) {
      Alert.alert('Error', 'Please enter a valid email address');
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
        Alert.alert('Error', error.message || 'Failed to create invitation');
        return;
      }

      if (data.success) {
        // Show success with credentials for the worker
        Alert.alert(
          'Worker Invited Successfully!',
          `Email: ${data.worker_email}\nPassword: ${data.temp_password}\nInvitation Code: ${data.invitation_code}\n\nShare these credentials with the worker. They can now sign up using these details.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setNewInvitation({ email: '', firstName: '', lastName: '', password: '' });
                setShowInviteModal(false);
                loadInvitations();
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to create invitation');
      }

    } catch (error) {
      console.error('Error creating invitation:', error);
      Alert.alert('Error', 'Failed to create invitation');
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
        Alert.alert('Error', error.message || 'Failed to resend invitation');
        return;
      }

      if (data.success) {
        Alert.alert('Success', 'Invitation resent successfully!');
        loadInvitations();
      } else {
        Alert.alert('Error', data.error || 'Failed to resend invitation');
      }

    } catch (error) {
      console.error('Error resending invitation:', error);
      Alert.alert('Error', 'Failed to resend invitation');
    }
  };

  const handleCancelInvitation = async (invitation) => {
    Alert.alert(
      'Cancel Invitation',
      'Are you sure you want to cancel this invitation?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('worker_invitations')
                .update({ is_used: true })
                .eq('id', invitation.id);

              if (error) {
                console.error('Error canceling invitation:', error);
                Alert.alert('Error', 'Failed to cancel invitation');
                return;
              }

              loadInvitations();
            } catch (error) {
              console.error('Error canceling invitation:', error);
              Alert.alert('Error', 'Failed to cancel invitation');
            }
          },
        },
      ]
    );
  };

  const handleRemoveInvitation = async (invitation) => {
    Alert.alert(
      'Remove Invitation',
      'Are you sure you want to remove this invitation from the list? This will not affect the worker\'s access to the store.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('worker_invitations')
                .delete()
                .eq('id', invitation.id);

              if (error) {
                console.error('Error removing invitation:', error);
                Alert.alert('Error', 'Failed to remove invitation');
                return;
              }

              loadInvitations();
            } catch (error) {
              console.error('Error removing invitation:', error);
              Alert.alert('Error', 'Failed to remove invitation');
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
      return { text: 'Accepted', color: '#10b981' };
    }
    if (new Date(invitation.expires_at) < new Date()) {
      return { text: 'Expired', color: '#ef4444' };
    }
    return { text: 'Pending', color: '#f59e0b' };
  };

  const renderInvitationItem = ({ item }) => {
    const status = getInvitationStatus(item);
    
    return (
      <View style={styles.invitationItem}>
        <View style={styles.invitationInfo}>
          <Text style={styles.invitationEmail}>{item.email}</Text>
          <Text style={styles.invitationDate}>
            Sent: {new Date(item.created_at).toLocaleDateString()}
          </Text>
          <Text style={[styles.invitationStatus, { color: status.color }]}>
            {status.text}
          </Text>
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
        <Text style={styles.loadingText}>Loading invitations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Worker Invitations</Text>
        <Text style={styles.subtitle}>
          Invite workers to {store?.name || 'this store'}
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
            <Text style={styles.emptyTitle}>No invitations yet</Text>
            <Text style={styles.emptyDescription}>
              Invite workers to help manage this store
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.inviteButton}
        onPress={() => setShowInviteModal(true)}
      >
        <MaterialIcons name="person-add" size={24} color="#ffffff" />
        <Text style={styles.inviteButtonText}>Invite Worker</Text>
      </TouchableOpacity>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Invite Worker</Text>
            <TouchableOpacity
              onPress={() => setShowInviteModal(false)}
              style={styles.closeButton}
            >
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address *</Text>
              <TextInput
                style={styles.input}
                value={newInvitation.email}
                onChangeText={(text) => setNewInvitation({...newInvitation, email: text})}
                placeholder="Enter worker's email address"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>First Name (Optional)</Text>
              <TextInput
                style={styles.input}
                value={newInvitation.firstName}
                onChangeText={(text) => setNewInvitation({...newInvitation, firstName: text})}
                placeholder="Enter worker's first name"
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Last Name (Optional)</Text>
              <TextInput
                style={styles.input}
                value={newInvitation.lastName}
                onChangeText={(text) => setNewInvitation({...newInvitation, lastName: text})}
                placeholder="Enter worker's last name"
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password (Optional)</Text>
              <TextInput
                style={styles.input}
                value={newInvitation.password}
                onChangeText={(text) => setNewInvitation({...newInvitation, password: text})}
                placeholder="Enter custom password (or leave blank for auto-generated)"
                placeholderTextColor="#9ca3af"
                secureTextEntry={true}
                autoCorrect={false}
              />
            </View>

            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={20} color="#2563eb" />
              <Text style={styles.infoText}>
                The worker will be automatically registered with the provided credentials.
                They can sign up immediately using the email and password you provide.
                The invitation will expire in 7 days.
              </Text>
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowInviteModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.sendButton, sending && styles.buttonDisabled]}
              onPress={handleSendInvitation}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.sendButtonText}>Send Invitation</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
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
  invitationInfo: {
    flex: 1,
  },
  invitationEmail: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 4,
  },
  invitationDate: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  invitationStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  invitationActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  inviteButton: {
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
  inviteButtonText: {
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
    marginBottom: 24,
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    marginLeft: 12,
    lineHeight: 20,
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
  sendButton: {
    flex: 1,
    padding: 16,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});