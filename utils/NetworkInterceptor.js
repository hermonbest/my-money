import NetInfo from '@react-native-community/netinfo';

/**
 * Network Interceptor
 * Monitors network connectivity changes and triggers appropriate actions
 */
class NetworkInterceptor {
  constructor() {
    this.offlineManager = null;
    this.unsubscribe = null;
    this.isOnline = true; // Default to online
    this.init();
  }

  /**
   * Initialize network monitoring
   */
  init() {
    // Listen for network changes
    this.unsubscribe = NetInfo.addEventListener(state => {
      console.log('🌐 Network status changed:', state);
      
      // Update online status - consider online only if connected and internet reachable
      const isNowOnline = state.isConnected && state.isInternetReachable !== false;
      this.isOnline = isNowOnline;
      
      if (this.offlineManager) {
        const wasOffline = !this.offlineManager.isOnline;
        this.offlineManager.isOnline = isNowOnline;
        
        if (wasOffline && this.offlineManager.isOnline) {
          console.log('✅ Back online - processing sync queue');
          this.offlineManager.syncWithConflictResolution();
        } else if (!this.offlineManager.isOnline) {
          console.log('⚠️ Offline mode activated');
        }
        
        this.offlineManager.notifyListeners();
      }
    });
    
    console.log('🌐 Network interceptor initialized');
  }

  /**
   * Attach to offline manager
   */
  attachToOfflineManager(offlineManagerInstance) {
    this.offlineManager = offlineManagerInstance;
    // Set initial status
    if (this.offlineManager) {
      this.offlineManager.isOnline = this.isOnline;
    }
    console.log('🌐 Network interceptor attached to offline manager');
  }

  /**
   * Get current network status
   */
  getCurrentStatus() {
    return {
      isOnline: this.isOnline,
      isConnected: this.isOnline
    };
  }

  /**
   * Cleanup network monitoring
   */
  cleanup() {
    if (this.unsubscribe) {
      this.unsubscribe();
      console.log('🌐 Network interceptor cleaned up');
    }
  }
}

// Create singleton instance
export const networkInterceptor = new NetworkInterceptor();
export default networkInterceptor;