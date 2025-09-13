import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
// Removed useAuth import - using direct Supabase auth
import { supabase } from '../utils/supabase';
import { clearCachedAuth } from '../utils/authUtils';
import { centralizedStorage } from '../src/storage/index';
import { getTranslation } from '../utils/translations';

export default function LanguageToggleMenu({ visible, onClose }) {
  const { language, changeLanguage } = useLanguage();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLanguageChange = async (newLanguage) => {
    await changeLanguage(newLanguage);
    onClose();
  };

  // Direct logout implementation
  const handleLogout = async () => {
    try {
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
      }
      
      // Clear cached authentication data using centralized storage
      await clearCachedAuth();
      
      console.log('Logout completed');
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const handleLogoutWithConfirmation = () => {
    Alert.alert(
      getTranslation('confirmLogout', language),
      getTranslation('confirmLogout', language),
      [
        {
          text: getTranslation('cancel', language),
          style: 'cancel',
        },
        {
          text: getTranslation('yes', language),
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await handleLogout();
            } catch (error) {
              Alert.alert(getTranslation('error', language), error.message || getTranslation('operationFailed', language));
            } finally {
              setIsLoggingOut(false);
              onClose();
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>{getTranslation('settings', language)}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.content}>
            {/* Language Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{getTranslation('selectLanguage', language)}</Text>
              
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  language === 'en' && styles.selectedLanguageOption
                ]}
                onPress={() => handleLanguageChange('en')}
              >
                <MaterialIcons 
                  name="language" 
                  size={24} 
                  color={language === 'en' ? '#2563eb' : '#6b7280'} 
                />
                <View style={styles.languageInfo}>
                  <Text style={[
                    styles.languageName,
                    language === 'en' && styles.selectedLanguageName
                  ]}>
                    {getTranslation('english', language)}
                  </Text>
                  <Text style={styles.languageCode}>English</Text>
                </View>
                {language === 'en' && (
                  <MaterialIcons name="check" size={20} color="#2563eb" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.languageOption,
                  language === 'am' && styles.selectedLanguageOption
                ]}
                onPress={() => handleLanguageChange('am')}
              >
                <MaterialIcons 
                  name="language" 
                  size={24} 
                  color={language === 'am' ? '#2563eb' : '#6b7280'} 
                />
                <View style={styles.languageInfo}>
                  <Text style={[
                    styles.languageName,
                    language === 'am' && styles.selectedLanguageName
                  ]}>
                    {getTranslation('amharic', language)}
                  </Text>
                  <Text style={styles.languageCode}>አማርኛ</Text>
                </View>
                {language === 'am' && (
                  <MaterialIcons name="check" size={20} color="#2563eb" />
                )}
              </TouchableOpacity>
            </View>

            {/* Logout Section */}
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.logoutButton}
                onPress={handleLogoutWithConfirmation}
                disabled={isLoggingOut}
              >
                <MaterialIcons name="logout" size={24} color="#dc2626" />
                <Text style={styles.logoutText}>
                  {isLoggingOut ? getTranslation('loading', language) : getTranslation('logout', language)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  selectedLanguageOption: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  languageInfo: {
    flex: 1,
    marginLeft: 12,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 2,
  },
  selectedLanguageName: {
    color: '#2563eb',
  },
  languageCode: {
    fontSize: 14,
    color: '#6b7280',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#dc2626',
    marginLeft: 12,
  },
});
