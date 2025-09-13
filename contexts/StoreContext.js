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
      selectedStore: context.selectedStore?.name || context.selectedStore,
      userRole: context.userRole,
      loading: context.loading,
      isAuthenticated: context.isAuthenticated
    });
    
    // Only warn if we're not loading, user is authenticated, but userRole is still null/undefined
    if (!context.loading && context.isAuthenticated && !context.userRole) {
      console.warn('⚠️ useStore: userRole is falsy after loading completed');
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
      console.log('🔍 StoreContext: Fetching profile for user:', user.id);
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, store_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      console.log('🔍 StoreContext: Profile query result:', { profile, profileError });

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
              setUserRole(retryProfile.role || 'worker'); // Default to worker if no role
              
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
              setUserRole('worker'); // Default to worker
              setStores([]);
              setSelectedStore(null);
            }
            
            return;
          }
          
          console.log('✅ StoreContext: Created default worker profile:', newProfile);
          setUserRole(newProfile.role || 'worker');
          
          // For workers, get their assigned store directly from their profile
          if ((newProfile.role || 'worker') === 'worker' && newProfile.store_id) {
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
            if ((newProfile.role || 'worker') === 'owner') {
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
              // For individuals and workers without store_id
              setStores([]);
              setSelectedStore(null);
            }
          }
          
          return;
        }
        
        // For other profile errors, set default role
        setUserRole('worker'); // Default to worker
        setStores([]);
        setSelectedStore(null);
        return;
      }

      console.log('🔍 StoreContext: Profile loaded:', profile);
      
      // Ensure we don't set role if it's null to avoid overriding App.js
      if (profile && profile.role) {
        setUserRole(profile.role);
      } else {
        console.warn('⚠️ StoreContext: Profile has no role, keeping current userRole');
        // Don't override userRole if profile.role is null/undefined
      }

      // Load stores based on role (use existing userRole if profile.role is null)
      const effectiveRole = profile?.role || userRole || 'worker';
      
      if (effectiveRole === 'owner') {
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
      } else if (effectiveRole === 'worker') {
        // For workers, get their assigned store directly from their profile
        if (profile && profile.store_id) {
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
            console.warn('⚠️ No store assigned to worker yet');
            setStores([]);
            setSelectedStore(null);
          }
        } else {
          console.warn('⚠️ No store assigned to worker yet or profile is null');
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
      setUserRole('worker'); // Default to worker on error
      setStores([]);
      setSelectedStore(null);
    } finally {
      setLoading(false);
    }
  };

  const selectStore = (store) => {
    setSelectedStore(store);
  };

  // Method to sync userRole from App.js
  const syncUserRole = (role) => {
    console.log('🔄 StoreContext: Syncing userRole from App.js:', role);
    setUserRole(role);
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
        console.log('StoreContext - User signed in, waiting for profile...');
        // Add delay to let App.js handle profile creation first
        setTimeout(async () => {
          await loadUserProfile();
        }, 1500); // Increased delay to ensure App.js completes first
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
    isAuthenticated,
    selectStore,
    syncUserRole, // Expose sync method
    loadUserProfile,
    refreshStores,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
};