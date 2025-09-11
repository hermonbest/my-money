import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../utils/supabase';
import { useLanguage } from '../contexts/LanguageContext'; // Import useLanguage hook
import { getTranslation } from '../utils/translations';

export default function LoginScreen({ navigation }) {
  const { language } = useLanguage(); // Use language context
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [isWorkerSignup, setIsWorkerSignup] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert(getTranslation('error', language), getTranslation('required', language));
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert(getTranslation('error', language), getTranslation('invalidEmail', language));
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        Alert.alert(getTranslation('error', language), error.message);
      } else {
        Alert.alert(getTranslation('success', language), getTranslation('signIn', language), [
          {
            text: getTranslation('ok', language),
            onPress: () => {
              if (navigation && navigation.navigate) {
                navigation.navigate('MainApp');
              } else {
                console.log('Navigation not available');
              }
            },
          },
        ]);
      }
    } catch (error) {
      Alert.alert(getTranslation('error', language), getTranslation('networkError', language));
      console.error('Sign in error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert(getTranslation('error', language), getTranslation('required', language));
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert(getTranslation('error', language), getTranslation('invalidEmail', language));
      return;
    }

    if (password.length < 6) {
      Alert.alert(getTranslation('error', language), getTranslation('weakPassword', language));
      return;
    }

    setLoading(true);
    try {
      // Check if this is a worker signup with invitation code
      if (invitationCode.trim()) {
        await signUpWorker(email.trim(), password, invitationCode.trim());
      } else {
        // Regular signup
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        });

        if (error) {
          Alert.alert(getTranslation('error', language), error.message);
        } else {
          // Wait for authentication to complete before showing role selection
          console.log(getTranslation('loading', language));
          
          // Wait a moment for the auth state to update
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Verify user is authenticated before showing role selection
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (authError || !user) {
            Alert.alert(getTranslation('error', language), getTranslation('tryAgain', language));
            return;
          }
          
          console.log('User authenticated, showing role selection for:', user.id);
          setShowRoleSelection(true);
        }
      }
    } catch (error) {
      Alert.alert(getTranslation('error', language), getTranslation('networkError', language));
      console.error('Sign up error:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUpWorker = async (email, password, invitationCode) => {
    try {
      // First, sign up the user with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;

      // If invitation code provided, complete worker registration
      if (invitationCode && authData.user) {
        const { data: registrationData, error: registrationError } = await supabase.rpc(
          'complete_worker_registration',
          {
            p_invitation_code: invitationCode,
            p_user_id: authData.user.id
          }
        );

        if (registrationError) throw registrationError;

        if (registrationData.success) {
          Alert.alert(
            getTranslation('success', language), 
            `${getTranslation('welcomeBack', language)} ${registrationData.store_name}! ${getTranslation('workerInvitations', language)}.`,
            [
              {
                text: getTranslation('continue', language),
                onPress: () => {
                  // The app will automatically detect the worker role and navigate appropriately
                }
              }
            ]
          );
          return;
        } else {
          throw new Error(registrationData.error);
        }
      }

      // Fallback to regular signup if no invitation code
      setShowRoleSelection(true);
    } catch (error) {
      console.error('Worker signup error:', error);
      throw error;
    }
  };

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleRoleSelection = async (role) => {
    setSelectedRole(role);
    setLoading(true);

    try {
      // Wait a moment for authentication to fully complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get current user with retry logic
      let user = null;
      let authError = null;
      
      // Try to get the user up to 3 times with increasing delays
      for (let i = 0; i < 3; i++) {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user) {
          user = data.user;
          break;
        }
        authError = error;
        await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
      }

      if (authError || !user) {
        console.error('Auth error after retries:', authError);
        throw new Error('User not authenticated. Please try signing in again.');
      }

      console.log('Creating profile for user:', user.id, 'with role:', role);

      // Create profile with selected role
      const { data: profileData, error } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          email: user.email,
          role: role,
          business_name: role === 'individual' ? getTranslation('myBusiness', language) : getTranslation('myStore', language),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Profile creation error:', error);
        
        // If we get a unique constraint violation, try to get the existing profile
        if (error.code === '23505') {
          console.log('🔍 Profile already exists, fetching existing profile...');
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (existingProfile) {
            console.log('🔍 Using existing profile:', existingProfile);
            
            Alert.alert(
              getTranslation('success', language),
              `${getTranslation('welcomeBack', language)}! ${getTranslation('profileCreated', language)} ${existingProfile.role === 'individual' ? getTranslation('individual', language) : getTranslation('owner', language)}.`,
              [
                {
                  text: getTranslation('continue', language),
                  onPress: () => {
                    setShowRoleSelection(false);
                    // The app will automatically detect the new profile and navigate to main app
                    // The auth state change listener will handle the navigation
                  }
                }
              ]
            );
            
            return;
          }
        }
        
        throw error;
      }

      console.log('Profile created successfully:', profileData);

      // Wait a moment for the profile to be available
      await new Promise(resolve => setTimeout(resolve, 500));

      Alert.alert(
        getTranslation('success', language),
        `${getTranslation('welcomeBack', language)}! ${getTranslation('profileCreated', language)} ${role === 'individual' ? getTranslation('individual', language) : getTranslation('owner', language)}.`,
        [
          {
            text: getTranslation('continue', language),
            onPress: () => {
              setShowRoleSelection(false);
              // The app will automatically detect the new profile and navigate to main app
              // The auth state change listener will handle the navigation
            }
          }
        ]
      );

    } catch (error) {
      console.error('Error creating profile:', error);
      let errorMessage = getTranslation('operationFailed', language);
      
      if (error.message.includes('User not authenticated')) {
        errorMessage = getTranslation('authError', language);
      } else if (error.code === '23503') {
        errorMessage = getTranslation('accountSetupFailed', language);
      }
      
      Alert.alert(getTranslation('error', language), errorMessage);
    } finally {
      setLoading(false);
    }
  };

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

  // Show role selection if signup was successful
  if (showRoleSelection) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="account-circle" size={60} color="#2563eb" />
          </View>
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
                <View style={[styles.iconContainer, selectedRole === role.id && styles.selectedIconContainer]}>
                  <MaterialIcons 
                    name={role.icon} 
                    size={28} 
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
                    <MaterialIcons name="check-circle" size={16} color="#10b981" />
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="account-balance-wallet" size={60} color="#2563eb" />
          </View>
          <Text style={styles.title}>{getTranslation('myMoney', language)}</Text>
          <Text style={styles.subtitle}>{getTranslation('businessManagement', language)}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <MaterialIcons name="email" size={20} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={getTranslation('enterEmail', language)}
              placeholderTextColor="#9ca3af"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <MaterialIcons name="lock" size={20} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={getTranslation('enterPassword', language)}
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={[styles.inputContainer, styles.invitationInput]}>
            <MaterialIcons name="vpn-key" size={20} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={getTranslation('invitationCode', language)}
              placeholderTextColor="#9ca3af"
              value={invitationCode}
              onChangeText={setInvitationCode}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, styles.signInButton, loading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <MaterialIcons name="login" size={20} color="#ffffff" />
                <Text style={styles.buttonText}>{getTranslation('signIn', language)}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.signUpButton, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#2563eb" />
            ) : (
              <>
                <MaterialIcons name="person-add" size={20} color="#2563eb" />
                <Text style={[styles.buttonText, styles.signUpButtonText]}>{getTranslation('signUp', language)}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {getTranslation('secureBusinessData', language)}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  invitationInput: {
    marginBottom: 24,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 16,
    color: '#1f2937',
    paddingVertical: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    transition: 'all 0.2s ease',
  },
  signInButton: {
    backgroundColor: '#2563eb',
  },
  signUpButton: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    color: '#ffffff',
  },
  signUpButtonText: {
    color: '#2563eb',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Role selection styles
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
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
});