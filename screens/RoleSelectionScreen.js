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
import { useLanguage } from '../contexts/LanguageContext'; // Import useLanguage hook
import { getTranslation } from '../utils/translations'; // Import getTranslation function

export default function RoleSelectionScreen({ navigation, route, onProfileCreated }) {
  const { language } = useLanguage(); // Use language context
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  // Add styles at the bottom of the file
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#f8fafc',
    },
    header: {
      alignItems: 'center',
      padding: 24,
      borderBottomWidth: 1,
      borderBottomColor: '#e2e8f0',
      backgroundColor: '#ffffff',
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: '#1f2937',
      marginTop: 8,
    },
    subtitle: {
      fontSize: 16,
      color: '#64748b',
      textAlign: 'center',
      marginTop: 8,
    },
    rolesContainer: {
      padding: 16,
      gap: 16,
    },
    roleCard: {
      backgroundColor: '#ffffff',
      borderRadius: 16,
      padding: 20,
      borderWidth: 2,
      borderColor: '#e2e8f0',
      shadowColor: '#000000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
      position: 'relative',
      overflow: 'hidden',
    },
    selectedRoleCard: {
      borderColor: '#2563eb',
      backgroundColor: '#f0f9ff',
    },
    roleHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: '#f1f5f9',
      justifyContent: 'center',
      alignItems: 'center',
    },
    selectedIconContainer: {
      backgroundColor: '#2563eb',
    },
    roleInfo: {
      flex: 1,
      marginLeft: 16,
    },
    roleTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#1f2937',
      marginBottom: 4,
    },
    selectedRoleTitle: {
      color: '#2563eb',
    },
    roleDescription: {
      fontSize: 14,
      color: '#64748b',
      lineHeight: 20,
    },
    featuresList: {
      gap: 8,
      marginTop: 8,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    featureText: {
      fontSize: 14,
      color: '#334155',
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
      padding: 16,
      alignItems: 'center',
    },
    footerText: {
      fontSize: 14,
      color: '#64748b',
      textAlign: 'center',
    },
  });

  // Get current user on component mount
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        setCurrentUser(user);
      } catch (error) {
        console.error('Error getting current user:', error);
        Alert.alert(getTranslation('error', language), getTranslation('authError', language));
      }
    };
    
    getCurrentUser();
  }, []);

  const roles = [
    {
      id: 'individual',
      title: getTranslation('individualBusinessOwner', language),
      description: getTranslation('individualBusinessDesc', language),
      icon: 'person',
      features: [
        getTranslation('trackInventory', language),
        getTranslation('manageExpenses', language),
        getTranslation('viewAnalytics', language),
        getTranslation('fullBusinessManagement', language)
      ]
    },
    {
      id: 'owner',
      title: getTranslation('multiStoreOwner', language),
      description: getTranslation('multiStoreDesc', language),
      icon: 'store',
      features: [
        getTranslation('manageMultipleStores', language),
        getTranslation('inviteWorkers', language),
        getTranslation('storeSpecificAnalytics', language),
        getTranslation('workerOversight', language)
      ]
    }
  ];

  const handleRoleSelection = async (role) => {
    if (!currentUser) {
      Alert.alert(getTranslation('error', language), getTranslation('loading', language));
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
            business_name: role === 'individual' ? getTranslation('myBusiness', language) : getTranslation('myStore', language),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
      }

      Alert.alert(
        getTranslation('success', language),
        `${getTranslation('welcomeBack', language)}! ${getTranslation('profileCreated', language)} ${role === 'individual' ? getTranslation('individualBusinessOwner', language) : getTranslation('multiStoreOwner', language)}.`,
        [
          {
            text: getTranslation('continue', language),
            onPress: async () => {
              console.log(getTranslation('profileSetupCompleted', language));
              if (onProfileCreated) {
                await onProfileCreated();
              }
            }
          }
        ]
      );

    } catch (error) {
      console.error('Error setting up profile:', error);
      Alert.alert(getTranslation('error', language), getTranslation('operationFailed', language));
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
          <Text style={styles.title}>{getTranslation('loading', language)}</Text>
          <Text style={styles.subtitle}>
            {getTranslation('pleaseWaitSetup', language)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="account-circle" size={80} color="#2563eb" />
        <Text style={styles.title}>{getTranslation('chooseYourRole', language)}</Text>
        <Text style={styles.subtitle}>
          {getTranslation('selectHowToUse', language)}
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
              <View style={[
                styles.iconContainer,
                selectedRole === role.id && styles.selectedIconContainer
              ]}>
                <MaterialIcons 
                  name={role.icon} 
                  size={40} 
                  color={selectedRole === role.id ? "#ffffff" : "#6b7280"} 
                />
              </View>
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
          {getTranslation('changeRoleLater', language)}
        </Text>
      </View>
    </ScrollView>
  );
}
