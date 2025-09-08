import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';

export default function RoleSelectionScreen({ navigation, route, onProfileCreated }) {
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // Get current user on component mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        setCurrentUser(user);
      } catch (error) {
        console.error('Error getting current user:', error);
        Alert.alert('Error', 'Please sign in again.');
      }
    };
    
    getCurrentUser();
  }, []);

  const roles = [
    {
      id: 'individual',
      title: 'Individual Business Owner',
      description: 'Manage your own business with full control over inventory, sales, and expenses.',
      icon: 'person',
      features: [
        'Track inventory and sales',
        'Manage expenses',
        'View analytics and reports',
        'Full business management'
      ]
    },
    {
      id: 'owner',
      title: 'Multi-Store Owner',
      description: 'Manage multiple stores and invite workers to help with operations.',
      icon: 'store',
      features: [
        'Manage multiple stores',
        'Invite and manage workers',
        'Store-specific analytics',
        'Worker oversight and permissions'
      ]
    }
  ];

  const handleRoleSelection = async (role) => {
    if (!currentUser) {
      Alert.alert('Error', 'Please wait for authentication to complete.');
      return;
    }

    setSelectedRole(role);
    setLoading(true);

    try {
      console.log('Creating profile for user:', currentUser.id, 'with role:', role);

      // Create or update user profile with selected role
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', currentUser.id)
        .single();

      if (existingProfile) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update({ 
            role: role,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', currentUser.id);

        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await supabase
          .from('profiles')
          .insert({
            user_id: currentUser.id,
            email: currentUser.email,
            role: role,
            business_name: role === 'individual' ? 'My Business' : 'My Store',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
      }

      Alert.alert(
        'Success!',
        `Welcome! You've been set up as a ${role === 'individual' ? 'Individual Business Owner' : 'Multi-Store Owner'}.`,
        [
          {
            text: 'Continue',
            onPress: async () => {
              console.log('Profile setup completed, refreshing auth state...');
              if (onProfileCreated) {
                await onProfileCreated();
              }
            }
          }
        ]
      );

    } catch (error) {
      console.error('Error setting up profile:', error);
      Alert.alert('Error', 'Failed to set up your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Show loading while getting current user
  if (!currentUser) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.title}>Loading...</Text>
          <Text style={styles.subtitle}>
            Please wait while we set up your account
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="account-circle" size={80} color="#2563eb" />
        <Text style={styles.title}>Choose Your Role</Text>
        <Text style={styles.subtitle}>
          Select how you'd like to use this business management app
        </Text>
      </View>

      <View style={styles.rolesContainer}>
        {roles.map((role) => (
          <TouchableOpacity
            key={role.id}
            style={[
              styles.roleCard,
              selectedRole === role.id && styles.selectedRoleCard
            ]}
            onPress={() => handleRoleSelection(role.id)}
            disabled={loading}
          >
            <View style={styles.roleHeader}>
              <MaterialIcons 
                name={role.icon} 
                size={40} 
                color={selectedRole === role.id ? "#2563eb" : "#6b7280"} 
              />
              <View style={styles.roleInfo}>
                <Text style={[
                  styles.roleTitle,
                  selectedRole === role.id && styles.selectedRoleTitle
                ]}>
                  {role.title}
                </Text>
                <Text style={styles.roleDescription}>
                  {role.description}
                </Text>
              </View>
            </View>

            <View style={styles.featuresList}>
              {role.features.map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  <MaterialIcons name="check" size={16} color="#10b981" />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            {loading && selectedRole === role.id && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color="#2563eb" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          You can change your role later in settings
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 24,
  },
  rolesContainer: {
    padding: 20,
    gap: 16,
  },
  roleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedRoleCard: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  roleInfo: {
    flex: 1,
    marginLeft: 16,
  },
  roleTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  selectedRoleTitle: {
    color: '#2563eb',
  },
  roleDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  featuresList: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});
