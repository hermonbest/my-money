import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 
                   Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL || 
                   'https://nsgznutovndpdmfksmpj.supabase.co';

const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
                       Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
                       'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZ3pudXRvdm5kcGRtZmtzbXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4ODg1MjgsImV4cCI6MjA3MjQ2NDUyOH0.x83Z914n13BV91-lh3VqD0EXnbKVUOxeijkPHMzpu9Q';

// Only log in development
if (__DEV__) {
  console.log('🔗 Supabase URL:', supabaseUrl.includes('nsgznutovndpdmfksmpj') ? '✅ Configured' : '❌ Using placeholder');
  console.log('🔑 Supabase Key:', supabaseAnonKey.length > 20 ? '✅ Configured' : '❌ Using placeholder');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});