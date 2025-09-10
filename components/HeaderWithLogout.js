import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext'; // Import useLanguage hook
import { getTranslation } from '../utils/translations'; // Import getTranslation function

export default function HeaderWithLogout({ title, onLogout, userRole, currentStore, onLanguageToggle }) {
  const { language } = useLanguage(); // Use language context

  const getRoleText = (role) => {
    switch (role) {
      case 'owner': return getTranslation('owner', language);
      case 'worker': return getTranslation('worker', language);
      case 'individual': return getTranslation('individual', language);
      default: return '';
    }
  };

  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <View style={styles.titleContainer}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {currentStore && (
            <Text style={styles.storeName} accessibilityLabel={`Current store: ${currentStore.name}`}>
              {currentStore.name}
            </Text>
          )}
          <Text style={styles.roleText} accessibilityLabel={`${getTranslation('userRole', language)}: ${getRoleText(userRole)}`}>
            {getRoleText(userRole)}
          </Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            onPress={onLanguageToggle}
            style={styles.languageButton}
            accessibilityLabel={getTranslation('changeLanguage', language)}
            accessibilityRole="button"
          >
            <MaterialIcons name="language" size={20} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onLogout}
            style={styles.logoutButton}
            accessibilityLabel={getTranslation('logout', language)}
            accessibilityRole="button"
          >
            <MaterialIcons name="logout" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#ffffff',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f2937',
  },
  storeName: {
    fontSize: 15,
    color: '#64748b',
    marginTop: 2,
  },
  roleText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  languageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
});