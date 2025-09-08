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

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [isWorkerSignup, setIsWorkerSignup] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        Alert.alert('Sign In Error', error.message);
      } else {
        Alert.alert('Success', 'Signed in successfully!', [
          {
            text: 'OK',
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
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
      console.error('Sign in error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
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
          Alert.alert('Sign Up Error', error.message);
        } else {
          // Wait for authentication to complete before showing role selection
          console.log('Signup successful, waiting for auth to complete...');
          
          // Wait a moment for the auth state to update
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Verify user is authenticated before showing role selection
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (authError || !user) {
            Alert.alert('Error', 'Please try signing up again.');
            return;
          }
          
          console.log('User authenticated, showing role selection for:', user.id);
          setShowRoleSelection(true);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
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
            'Success!', 
            `Welcome to ${registrationData.store_name}! You've been registered as a worker.`,
            [
              {
                text: 'Continue',
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
      
      for (let i = 0; i < 3; i++) {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user) {
          user = data.user;
          break;
        }
        authError = error;
        await new Promise(resolve => setTimeout(resolve, 500));
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
          business_name: role === 'individual' ? 'My Business' : 'My Store',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Profile creation error:', error);
        throw error;
      }

      console.log('Profile created successfully:', profileData);

      // Wait a moment for the profile to be available
      await new Promise(resolve => setTimeout(resolve, 500));

      Alert.alert(
        'Success!',
        `Welcome! You've been set up as a ${role === 'individual' ? 'Individual Business Owner' : 'Multi-Store Owner'}.`,
        [
          {
            text: 'Continue',
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
      let errorMessage = 'Failed to set up your account. Please try again.';
      
      if (error.message.includes('User not authenticated')) {
        errorMessage = 'Please sign in again and try selecting your role.';
      } else if (error.code === '23503') {
        errorMessage = 'Account setup failed. Please sign out and sign in again, then try selecting your role.';
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

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

  // Show role selection if signup was successful
  if (showRoleSelection) {
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <MaterialIcons name="account-balance-wallet" size={80} color="#2563eb" />
          <Text style={styles.title}>My Money</Text>
          <Text style={styles.subtitle}>Business Management</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <MaterialIcons name="email" size={24} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
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
            <MaterialIcons name="lock" size={24} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <MaterialIcons name="vpn-key" size={24} color="#6b7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Invitation Code (for workers only)"
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
                <MaterialIcons name="login" size={24} color="#ffffff" />
                <Text style={styles.buttonText}>Sign In</Text>
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
                <MaterialIcons name="person-add" size={24} color="#2563eb" />
                <Text style={[styles.buttonText, styles.signUpButtonText]}>Sign Up</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Secure your business data with encrypted authentication
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
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
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
    borderColor: '#e5e7eb',
    marginBottom: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    fontSize: 16,
    color: '#1f2937',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
    opacity: 0.6,
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
    marginTop: 40,
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Role selection styles
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
});

