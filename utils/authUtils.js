// =====================================================
// AUTHENTICATION UTILITIES
// =====================================================
// Centralized authentication utilities with offline support
// Use these instead of direct supabase.auth calls
// =====================================================

import { supabase } from './supabase';
import { offlineManager } from './OfflineManager';
import { centralizedStorage } from '../src/storage/index';

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
        // Cache the user session for offline use in secure storage
        await centralizedStorage.setSecure('user_session', {
          user,
          timestamp: new Date().toISOString()
        });
        console.log('🔍 Cached user session for offline use in secure storage');
        
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
 * Get cached user from secure storage
 * @returns {Promise<Object|null>}
 */
export const getCachedUser = async () => {
  try {
    console.log('🔍 Getting cached user from secure storage...');
    const cachedSession = await centralizedStorage.getSecure('user_session');
    console.log('🔍 Cached session exists:', !!cachedSession);
    
    if (cachedSession && cachedSession.user) {
      console.log('🔍 Parsed cached user:', { id: cachedSession.user?.id, email: cachedSession.user?.email });
      return cachedSession.user;
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
        // Cache the session for offline use in secure storage
        await centralizedStorage.setSecure('user_session', {
          user: session.user,
          timestamp: new Date().toISOString()
        });
        
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
    
    // Try to get from SQLite first
    let cachedProfile = await centralizedStorage.getUserProfile(userId);
    console.log('🔍 SQLite profile exists:', !!cachedProfile);
    
    if (offlineManager.isConnected()) {
      // Online: fetch from Supabase and cache it
      console.log('🔍 Fetching profile from Supabase...');
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      console.log('🔍 Supabase profile result:', { profile, error: error?.message });

      if (profile && !error) {
        // Cache the profile in SQLite
        await centralizedStorage.storeUserProfile({
          user_id: userId,
          ...profile
        });
        console.log('🔍 Cached profile in SQLite for offline use:', profile);
        return profile;
      }
      
      // If no profile from server but have cached data, use cache
      if (cachedProfile) {
        console.log('🔍 Using SQLite cached profile as fallback');
        return cachedProfile;
      }
      // Return a safe object structure
      return { role: null, profile: null };
    } else {
      // Offline: use SQLite cached profile if available
      if (cachedProfile) {
        console.log('🔍 Using SQLite cached profile (offline mode):', cachedProfile);
        return cachedProfile;
      }
      
      console.log('🔍 No cached profile available offline');
      // Return a safe object structure
      return { role: null, profile: null };
    }
  } catch (error) {
    console.error('❌ Error loading profile:', error);
    
    // If there's an error but we have cached data, use it
    try {
      const cachedProfile = await centralizedStorage.getUserProfile(userId);
      if (cachedProfile) {
        console.log('🔍 Using SQLite cached profile due to error');
        return cachedProfile;
      }
    } catch (cacheError) {
      console.error('❌ Error loading SQLite cached profile:', cacheError);
    }
    
    // Return a safe object structure
    return { role: null, profile: null };
  }
};

/**
 * Clear all cached authentication data
 * @returns {Promise<void>}
 */
export const clearCachedAuth = async () => {
  try {
    // Clear secure storage (session data)
    await centralizedStorage.clearSecureStorage();
    
    // Clear user profile from SQLite (if any)
    // Note: We don't have a direct method to clear all profiles, 
    // but the app will handle this on logout
    
    console.log('Cleared cached authentication data');
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