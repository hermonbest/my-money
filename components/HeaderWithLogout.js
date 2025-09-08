import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export default function HeaderWithLogout({ title, onLogout, userRole, currentStore, onLanguageToggle }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title}</Text>
          {currentStore && (
            <Text style={styles.storeName}>{currentStore.name}</Text>
          )}
          <Text style={styles.roleText}>
            {userRole === 'owner' ? 'Store Owner' : userRole === 'worker' ? 'Worker' : 'Individual User'}
          </Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            onPress={onLanguageToggle}
            style={styles.languageButton}
          >
            <MaterialIcons name="language" size={24} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onLogout}
            style={styles.logoutButton}
          >
            <MaterialIcons name="logout" size={24} color="#ef4444" />
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
    borderBottomColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  storeName: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 2,
  },
  roleText: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  languageButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  logoutButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
});
