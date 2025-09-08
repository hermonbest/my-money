// =====================================================
// AUTHENTICATION UTILITIES
// =====================================================
// Centralized authentication utilities with offline support
// Use these instead of direct supabase.auth calls
// =====================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { offlineManager } from './OfflineManager';

/**
 * Get current authenticated user with offline fallback
 * Use this instead of supabase.auth.getUser()
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
export const getCurrentUser = async () => {
  try {
    console.log('🔍 getCurrentUser called - isOnline:', offlineManager.isConnected());
    
    if (offlineManager.isConnected()) {
      // Online: get from Supabase
      console.log('🔍 Getting user from Supabase...');
      const { data: { user }, error } = await supabase.auth.getUser();
      console.log('🔍 Supabase user result:', { user: !!user, error: error?.message });
      
      if (user && !error) {
        // Cache the user session for offline use
        await AsyncStorage.setItem('cached_user_session', JSON.stringify({
          user,
          timestamp: new Date().toISOString()
        }));
        console.log('🔍 Cached user session for offline use');
        
        return { user, error: null };
      }
      
      if (error) {
        // If online fails, try cached fallback
        console.log('🔍 Online auth failed, trying cached user...');
        const cachedUser = await getCachedUser();
        if (cachedUser) {
          console.log('🔍 Using cached user due to auth error');
          return { user: cachedUser, error: null };
        }
        console.log('🔍 No cached user available');
        return { user: null, error };
      }
      
      return { user: null, error: null };
    } else {
      // Offline: use cached user
      console.log('🔍 Offline mode - getting cached user...');
      const cachedUser = await getCachedUser();
      console.log('🔍 Cached user result:', { user: !!cachedUser });
      
      if (cachedUser) {
        console.log('🔍 Using cached user offline');
        return { user: cachedUser, error: null };
      }
      
      console.log('🔍 No cached user available offline');
      return { user: null, error: new Error('No cached user available offline') };
    }
  } catch (error) {
    console.error('❌ Error getting current user:', error);
    
    // Try cached user as final fallback
    const cachedUser = await getCachedUser();
    if (cachedUser) {
      console.log('🔍 Using cached user as final fallback');
      return { user: cachedUser, error: null };
    }
    
    return { user: null, error };
  }
};

/**
 * Get cached user from AsyncStorage
 * @returns {Promise<Object|null>}
 */
export const getCachedUser = async () => {
  try {
    console.log('🔍 Getting cached user from AsyncStorage...');
    const cachedSession = await AsyncStorage.getItem('cached_user_session');
    console.log('🔍 Cached session exists:', !!cachedSession);
    
    if (cachedSession) {
      const { user } = JSON.parse(cachedSession);
      console.log('🔍 Parsed cached user:', { id: user?.id, email: user?.email });
      return user;
    }
    console.log('🔍 No cached session found');
    return null;
  } catch (error) {
    console.error('❌ Error getting cached user:', error);
    return null;
  }
};

/**
 * Get current session with offline fallback
 * Use this instead of supabase.auth.getSession()
 * @returns {Promise<{session: Object|null, error: Error|null}>}
 */
export const getCurrentSession = async () => {
  try {
    if (offlineManager.isConnected()) {
      // Online: get from Supabase
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (session && !error) {
        // Cache the session for offline use
        await AsyncStorage.setItem('cached_user_session', JSON.stringify({
          user: session.user,
          timestamp: new Date().toISOString()
        }));
        
        return { session, error: null };
      }
      
      if (error) {
        // If online fails, try cached fallback
        const cachedUser = await getCachedUser();
        if (cachedUser) {
          console.log('Using cached session due to auth error');
          // Create a mock session object with cached user
          const mockSession = {
            user: cachedUser,
            access_token: 'cached_token',
            refresh_token: 'cached_refresh',
            expires_at: null
          };
          return { session: mockSession, error: null };
        }
        return { session: null, error };
      }
      
      return { session: null, error: null };
    } else {
      // Offline: create mock session from cached user
      const cachedUser = await getCachedUser();
      if (cachedUser) {
        const mockSession = {
          user: cachedUser,
          access_token: 'cached_token',
          refresh_token: 'cached_refresh',
          expires_at: null
        };
        return { session: mockSession, error: null };
      }
      
      return { session: null, error: new Error('No cached session available offline') };
    }
  } catch (error) {
    console.error('Error getting current session:', error);
    return { session: null, error };
  }
};

/**
 * Check if user is authenticated (online or cached)
 * @returns {Promise<boolean>}
 */
export const isAuthenticated = async () => {
  const { user } = await getCurrentUser();
  return !!user;
};

/**
 * Get user profile with offline fallback
 * @param {string} userId - User ID to get profile for
 * @returns {Promise<Object|null>}
 */
export const getUserProfile = async (userId) => {
  try {
    console.log('🔍 Getting user profile for userId:', userId);
    console.log('🔍 Is online:', offlineManager.isConnected());
    
    // First try to get from cache for offline support
    const cachedProfile = await AsyncStorage.getItem(`user_profile_${userId}`);
    console.log('🔍 Cached profile exists:', !!cachedProfile);
    
    if (offlineManager.isConnected()) {
      // Online: fetch from Supabase and cache it
      console.log('🔍 Fetching profile from Supabase...');
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, store_id')
        .eq('user_id', userId)
        .maybeSingle();

      console.log('🔍 Supabase profile result:', { profile, error: error?.message });

      if (profile && !error) {
        // Cache the profile for offline use
        await AsyncStorage.setItem(`user_profile_${userId}`, JSON.stringify(profile));
        console.log('🔍 Cached profile for offline use:', profile);
        return profile;
      }
      
      // If no profile from server but have cached data, use cache
      if (cachedProfile) {
        console.log('🔍 Using cached profile as fallback');
        return JSON.parse(cachedProfile);
      }
      
      console.log('🔍 No profile found online and no cached data');
      return null;
    } else {
      // Offline: use cached profile if available
      if (cachedProfile) {
        console.log('🔍 Using cached profile (offline mode):', JSON.parse(cachedProfile));
        return JSON.parse(cachedProfile);
      }
      
      console.log('🔍 No cached profile available offline');
      return null;
    }
  } catch (error) {
    console.error('❌ Error loading profile:', error);
    
    // If there's an error but we have cached data, use it
    try {
      const cachedProfile = await AsyncStorage.getItem(`user_profile_${userId}`);
      if (cachedProfile) {
        console.log('🔍 Using cached profile due to error');
        return JSON.parse(cachedProfile);
      }
    } catch (cacheError) {
      console.error('❌ Error loading cached profile:', cacheError);
    }
    
    return null;
  }
};

/**
 * Clear all cached authentication data
 * @returns {Promise<void>}
 */
export const clearCachedAuth = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const authKeys = keys.filter(key => 
      key.startsWith('cached_user_session') || 
      key.startsWith('user_profile_')
    );
    
    if (authKeys.length > 0) {
      await AsyncStorage.multiRemove(authKeys);
      console.log('Cleared cached authentication data');
    }
  } catch (error) {
    console.error('Error clearing cached auth data:', error);
  }
};

export default {
  getCurrentUser,
  getCachedUser,
  getCurrentSession,
  isAuthenticated,
  getUserProfile,
  clearCachedAuth
};