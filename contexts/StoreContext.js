import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';

const StoreContext = createContext();

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  
  // Debugging: Log context values
  useEffect(() => {
    console.log('🔍 useStore context values:', {
      selectedStore: context.selectedStore?.name,
      userRole: context.userRole,
      loading: context.loading
    });
    
    // Only warn if we're not loading and userRole is still null/undefined
    if (!context.loading && (context.userRole === null || context.userRole === undefined)) {
      console.warn('⚠️ useStore: userRole is null/undefined after loading completed');
    }
  }, [context.selectedStore, context.userRole, context.loading]);
  
  return context;
};

export const StoreProvider = ({ children }) => {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUserProfile = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.log('🔍 StoreContext: No user or user error, setting userRole to null');
        setUserRole(null);
        setStores([]);
        setSelectedStore(null);
        return;
      }

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, store_id')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        console.error('❌ StoreContext: Error fetching profile:', profileError);
        throw profileError;
      }

      console.log('🔍 StoreContext: Profile loaded:', profile);
      setUserRole(profile.role);

      // Load stores based on role
      if (profile.role === 'owner') {
        const { data: ownedStores, error: storesError } = await supabase
          .from('stores')
          .select('*')
          .eq('owner_id', user.id)
          .order('name');

        if (storesError) throw storesError;

        setStores(ownedStores || []);
        if (ownedStores && ownedStores.length > 0) {
          setSelectedStore(ownedStores[0]);
        }
      } else if (profile.role === 'worker') {
        // For workers, get their assigned store directly from their profile
        if (profile.store_id) {
          const { data: assignedStore, error: storeError } = await supabase
            .from('stores')
            .select('*')
            .eq('id', profile.store_id)
            .single();

          if (storeError) {
            console.error('Error loading worker assigned store:', storeError);
            setStores([]);
            setSelectedStore(null);
          } else if (assignedStore) {
            console.log('Worker store loaded successfully:', assignedStore.name);
            setStores([assignedStore]);
            setSelectedStore(assignedStore);
          } else {
            console.warn('Worker assigned store not found');
            setStores([]);
            setSelectedStore(null);
          }
        } else {
          console.warn('Worker has no assigned store in profile');
          setStores([]);
          setSelectedStore(null);
        }
      }
      // Individual users don't need stores

    } catch (error) {
      console.error('Error loading user profile:', error);
      setUserRole(null);
      setStores([]);
      setSelectedStore(null);
    } finally {
      setLoading(false);
    }
  };

  const selectStore = (store) => {
    setSelectedStore(store);
  };

  const refreshStores = async () => {
    await loadUserProfile();
  };

  useEffect(() => {
    console.log('🔍 StoreContext: Initializing loadUserProfile...');
    loadUserProfile();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('StoreContext - Auth state change:', event, session?.user?.id);
      
      if (event === 'SIGNED_IN' && session?.user) {
        console.log('StoreContext - User signed in, reloading profile...');
        await loadUserProfile();
      } else if (event === 'SIGNED_OUT') {
        console.log('StoreContext - User signed out, clearing state...');
        setUserRole(null);
        setStores([]);
        setSelectedStore(null);
        setLoading(false);
      }
    });

    return () => {
      console.log('🔍 StoreContext: Cleaning up subscription...');
      subscription?.unsubscribe();
    };
  }, []);

  const value = {
    stores,
    selectedStore,
    userRole,
    loading,
    selectStore,
    refreshStores,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
};