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
      loading: context.loading,
      isAuthenticated: context.isAuthenticated
    });
    
    // Only warn if we're not loading, user is authenticated, but userRole is still null/undefined
    // Additional check to prevent warning during sign-out transition
    if (!context.loading && context.isAuthenticated && (context.userRole === null || context.userRole === undefined)) {
      // Double-check auth state to prevent false warnings during transitions
      supabase.auth.getUser().then(({ data: { user } }) => {
        // Only show warning if there is definitely a user but no role
        if (user) {
          console.warn('⚠️ useStore: userRole is null/undefined after loading completed');
        }
      }).catch(() => {
        // If we can't get user, it means we're likely in a sign-out transition
        // Don't show the warning in this case
      });
    }
  }, [context.selectedStore, context.userRole, context.loading, context.isAuthenticated]);
  
  return context;
};

export const StoreProvider = ({ children }) => {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Track auth state

  const loadUserProfile = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.log('🔍 StoreContext: No user or user error, setting userRole to null');
        setUserRole(null);
        setStores([]);
        setSelectedStore(null);
        setIsAuthenticated(false); // Update auth state
        return;
      }

      // Set authenticated state
      setIsAuthenticated(true);

      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, store_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('❌ StoreContext: Error fetching profile:', profileError);
        // If we get a PGRST116 error (0 rows), create a default profile
        if (profileError.code === 'PGRST116') {
          console.log('🔍 StoreContext: Creating default profile for user:', user.id);
          
          // Create a default profile with worker role
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              user_id: user.id,
              email: user.email,
              role: 'worker',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (createError) {
            console.error('❌ StoreContext: Error creating default profile:', createError);
            
            // If profile creation fails, try to get existing profile again
            const { data: retryProfile } = await supabase
              .from('profiles')
              .select('role, store_id')
              .eq('user_id', user.id)
              .maybeSingle();

            if (retryProfile) {
              console.log('🔍 StoreContext: Found profile after retry:', retryProfile);
              setUserRole(retryProfile.role);
              
              // Handle store selection based on role
              if (retryProfile.role === 'worker' && retryProfile.store_id) {
                const { data: assignedStore } = await supabase
                  .from('stores')
                  .select('*')
                  .eq('id', retryProfile.store_id)
                  .single();

                if (assignedStore) {
                  setStores([assignedStore]);
                  setSelectedStore(assignedStore);
                }
              } else if (retryProfile.role === 'owner') {
                const { data: ownedStores } = await supabase
                  .from('stores')
                  .select('*')
                  .eq('owner_id', user.id)
                  .order('name');

                if (ownedStores && ownedStores.length > 0) {
                  setStores(ownedStores);
                  setSelectedStore(ownedStores[0]);
                }
              }
            } else {
              setUserRole(null);
              setStores([]);
              setSelectedStore(null);
            }
            
            return;
          }
          
          console.log('✅ StoreContext: Created default worker profile:', newProfile);
          setUserRole(newProfile.role);
          
          // For workers, get their assigned store directly from their profile
          if (newProfile.role === 'worker' && newProfile.store_id) {
            const { data: assignedStore, error: storeError } = await supabase
              .from('stores')
              .select('*')
              .eq('id', newProfile.store_id)
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
            // For owners and individuals
            if (newProfile.role === 'owner') {
              // Get owned stores
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
            } else {
              // For individuals, no stores needed
              setStores([]);
              setSelectedStore(null);
            }
          }
          
          return;
        }
        
        // For other profile errors, set to null
        setUserRole(null);
        setStores([]);
        setSelectedStore(null);
        return;
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
      } else {
        // For individuals
        setStores([]);
        setSelectedStore(null);
      }

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
        setIsAuthenticated(false); // Update auth state
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
    isAuthenticated, // Include auth state in context
    selectStore,
    refreshStores,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
};