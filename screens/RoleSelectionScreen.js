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
          {getTranslation('changeRoleLater', language)}
        </Text>
      </View>
    </ScrollView>
  );
}

// ... existing styles ...