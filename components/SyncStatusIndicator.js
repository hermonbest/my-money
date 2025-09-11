import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { offlineManager } from '../utils/OfflineManager';

/**
 * Sync Status Indicator Component
 * Displays the current sync status to the user
 */
const SyncStatusIndicator = () => {
  const [syncStatus, setSyncStatus] = useState(offlineManager.getSyncStatus());

  useEffect(() => {
    // Update status when it changes
    const unsubscribe = offlineManager.addNetworkListener((isOnline) => {
      setSyncStatus(offlineManager.getSyncStatus());
    });

    // Periodic status updates
    const interval = setInterval(() => {
      setSyncStatus(offlineManager.getSyncStatus());
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Render nothing if online and no pending sync
  if (syncStatus.isOnline && syncStatus.pendingSync === 0 && !syncStatus.syncInProgress) {
    return null;
  }

  return (
    <View style={styles.container}>
      {!syncStatus.isOnline && (
        <View style={styles.offlineBanner}>
          <MaterialIcons name="cloud-off" size={16} color="#fff" />
          <Text style={styles.offlineText}>Offline Mode</Text>
        </View>
      )}
      
      {syncStatus.pendingSync > 0 && (
        <View style={styles.syncBanner}>
          <MaterialIcons name="sync" size={16} color="#fff" />
          <Text style={styles.syncText}>
            {syncStatus.syncInProgress 
              ? `Syncing ${syncStatus.pendingSync} items...` 
              : `Pending sync: ${syncStatus.pendingSync} items`}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  offlineBanner: {
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBanner: {
    backgroundColor: '#3b82f6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  syncText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default SyncStatusIndicator;