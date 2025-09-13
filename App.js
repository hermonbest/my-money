import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
// Removed AsyncStorage import - now using centralized storage

// Import services
import { supabase } from "./utils/supabase";
import { offlineManager } from "./utils/OfflineManager";
import { networkInterceptor } from "./utils/NetworkInterceptor"; // Add this import
import { dataPreloader } from "./utils/DataPreloader";
import { centralizedStorage } from "./src/storage/index";

// Import SQLite initialization
import { initializeAppWithSQLite, isSQLiteReady } from './utils/AppInitializer';

// Import components
import ErrorBoundary from "./components/ErrorBoundary";
import SyncStatusIndicator from "./components/SyncStatusIndicator";
import { StoreProvider } from './contexts/StoreContext';
import { LanguageProvider } from "./contexts/LanguageContext";

// Import screens
import LoginScreen from "./screens/LoginScreen";
import RoleSelectionScreen from "./screens/RoleSelectionScreen";
import UnifiedDashboardScreen from "./screens/UnifiedDashboardScreen";
import InventoryScreen from "./screens/InventoryScreen";
import SalesScreen from "./screens/SalesScreen";
import ExpensesScreen from "./screens/ExpensesScreen";
import AddItemScreen from "./screens/AddItemScreen";
import AddSaleScreen from "./screens/AddSaleScreen";
import AddExpenseScreen from "./screens/AddExpenseScreen";
import StoreManagementScreen from "./screens/StoreManagementScreen";
// import WorkerInviteScreen from "./screens/WorkerInviteScreen"; // Removed - invitation feature disabled
import WorkerPOSScreen from "./screens/WorkerPOSScreen";
import POSCheckoutScreen from "./screens/POSCheckoutScreen";
import CartScreen from "./screens/CartScreen";
import FinalSoldScreen from "./screens/FinalSoldScreen";

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);
  
  // SQLite initialization state
  const [isSQLiteReady, setIsSQLiteReady] = useState(false);

  // StoreContext sync will be handled inside the provider

  // Attach network interceptor to offline manager
  useEffect(() => {
    // Attach the network interceptor to the offline manager
    offlineManager.attachNetworkInterceptor(networkInterceptor);
  }, []);

  useEffect(() => {
    checkAuthState();
  }, []);

  // SQLite initialization
  useEffect(() => {
    initializeSQLite();
  }, []);

  const initializeSQLite = async () => {
    try {
      console.log('🚀 Initializing SQLite system...');
      
      // Initialize SQLite system
      const result = await initializeAppWithSQLite();

      if (result.success) {
        console.log('✅ SQLite system ready!');
        setIsSQLiteReady(true);
      } else {
        console.error('❌ SQLite initialization failed:', result.error);
        setIsSQLiteReady(true); // Continue anyway with fallback
      }
    } catch (error) {
      console.error('❌ SQLite initialization error:', error);
      setIsSQLiteReady(true); // Continue anyway with fallback
    }
  };

  const refreshAuthState = async () => {
    setIsLoading(true);
    await checkAuthState();
  };

  const checkAuthState = async () => {
    try {
      // Check if Supabase is properly configured
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase not configured - showing error screen');
        setIsLoading(false);
        return;
      }

      let user = null;
      let profile = null;

      if (offlineManager.isConnected()) {
        // Online: check with Supabase
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            user = session.user;
            // Cache user session in secure storage
            await centralizedStorage.setSecure('user_session', {
              user: session.user,
              timestamp: new Date().toISOString()
            });
          }
        } catch (error) {
          console.warn('⚠️ Online session check failed, trying cached session:', error.message);
          // Fall through to cached session check
        }
      }

      // If no online session, try cached session
      if (!user) {
        const cachedSession = await centralizedStorage.getSecure('user_session');
        if (cachedSession && cachedSession.user) {
          user = cachedSession.user;
        }
      }

      if (user) {
        setCurrentUser(user);
        profile = await loadUserProfile(user.id);
        
        // Add additional check for profile
        if (!profile) {
          console.log('🔍 No profile found, checking database directly...');
          // Try to load profile directly from database if not in cache
          try {
            const { data: dbProfile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle();
              
            if (!profileError && dbProfile) {
              console.log('🔍 Found profile in database:', dbProfile);
              // Cache the profile in SQLite
              await centralizedStorage.storeUserProfile({
                user_id: user.id,
                ...dbProfile
              });
              profile = dbProfile;
            }
          } catch (dbError) {
            console.warn('⚠️ Database profile check failed:', dbError.message);
          }
        }
        
        if (profile?.role) {
          setUserRole(profile.role);
          // Role sync handled by StoreContext automatically
          setIsAuthenticated(true);
          setNeedsProfileSetup(false);
          
          // Preload all data for instant navigation
          try {
            await preloadAllData(user.id, profile.role, profile.store_id);
          } catch (preloadError) {
            console.warn('⚠️ Data preloading failed:', preloadError.message);
          }
        } else {
          setIsAuthenticated(false);
          setNeedsProfileSetup(true);
          setUserRole(null);
        }
      } else {
        setIsAuthenticated(false);
        setUserRole(null);
        setCurrentUser(null);
        setNeedsProfileSetup(false);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      
      // Try cached session as fallback
      try {
        const cachedSession = await centralizedStorage.getSecure('user_session');
        if (cachedSession && cachedSession.user) {
          const user = cachedSession.user;
          setCurrentUser(user);
          const profile = await loadUserProfile(user.id);
          
          if (profile?.role) {
            setUserRole(profile.role);
            // Sync with StoreContext
            if (syncUserRole) syncUserRole(profile.role);
            setIsAuthenticated(true);
            setNeedsProfileSetup(false);
            
            // Preload all data for instant navigation
            try {
              await preloadAllData(user.id, profile.role, profile.store_id);
            } catch (preloadError) {
              console.warn('⚠️ Data preloading failed:', preloadError.message);
            }
          }
        }
      } catch (cacheError) {
        console.error('Error accessing cached session:', cacheError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const preloadAllData = async (userId, userRole, storeId) => {
    if (isPreloading) {
      console.log('Preloading already in progress, skipping...');
      return;
    }
    
    setIsPreloading(true);
    console.log('🔄 Starting data preloading...');
    
    try {
      const userData = {
        userId,
        userRole,
        storeId
      };
      
      const preloadSuccess = await dataPreloader.preloadAll(userData);
      
      if (preloadSuccess) {
        console.log('✅ Data preloading completed successfully');
      } else {
        console.warn('⚠️ Data preloading completed with some errors');
      }
    } catch (error) {
      console.error('❌ Error during data preloading:', error);
    } finally {
      setIsPreloading(false);
    }
  };

  const loadUserProfile = async (userId) => {
    try {
      console.log('🔍 Loading user profile for:', userId);
      
      // Try to get profile from SQLite first
      const cachedProfile = await centralizedStorage.getUserProfile(userId);
      if (cachedProfile) {
        console.log('✅ Using SQLite cached profile:', cachedProfile);
        return cachedProfile;
      }
      
      // If online, try to fetch from database
      if (offlineManager.isConnected()) {
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
          
          if (error) throw error;
          
          // Cache the profile in SQLite
          if (profile) {
            await centralizedStorage.storeUserProfile({
              user_id: userId,
              ...profile
            });
          }
          return profile;
        } catch (dbError) {
          console.warn('⚠️ Database profile fetch failed:', dbError.message);
        }
      }
      
      // If offline and no cached profile, return null
      console.log('⚠️ Offline with no cached profile available');
      return null;
    } catch (error) {
      console.error('❌ Error loading user profile:', error);
      // Return null instead of default worker profile
      return null;
    }
  };

  // Listen for auth changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.id);
      
      if (session?.user) {
        setCurrentUser(session.user);
        
        // Cache user session in secure storage
        try {
          await centralizedStorage.setSecure('user_session', {
            user: session.user,
            timestamp: new Date().toISOString()
          });
        } catch (cacheError) {
          console.error('❌ Error caching user session:', cacheError);
        }
        
        const profile = await loadUserProfile(session.user.id);
        console.log('Auth state change - profile:', profile);
        if (profile?.role) {
          console.log('Auth state change - setting user role to:', profile.role);
          setUserRole(profile.role);
          // Role sync handled by StoreContext automatically
          setIsAuthenticated(true);
          setNeedsProfileSetup(false);
          
          // Start data preloading in background (non-blocking)
          preloadAllData(session.user.id, profile.role, profile.store_id).catch(preloadError => {
            console.warn('⚠️ Data preloading failed:', preloadError.message);
          });
        } else {
          // User exists but no profile - check if they have a worker assignment
          console.log('🔍 User has no profile, checking for worker assignment...');
          
          try {
            const { data: assignment, error: assignmentError } = await supabase
              .from('worker_assignments')
              .select('store_id, stores(name)')
              .eq('worker_email', session.user.email.toLowerCase().trim())
              .eq('is_active', true)
              .maybeSingle();

            if (assignment && !assignmentError) {
              // Auto-create worker profile
              console.log('🔍 Found worker assignment, creating worker profile...');
              
              const { data: newProfile, error: profileError } = await supabase
                .from('profiles')
                .insert({
                  user_id: session.user.id,
                  email: session.user.email,
                  role: 'worker',
                  store_id: assignment.store_id,
                  business_name: assignment.stores.name,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .select()
                .single();

              if (!profileError && newProfile) {
                console.log('✅ Worker profile created automatically:', newProfile);
                setUserRole('worker');
                // Sync with StoreContext
                if (syncUserRole) syncUserRole('worker');
                setIsAuthenticated(true);
                setNeedsProfileSetup(false);
                
                // Cache the new profile in SQLite
                await centralizedStorage.storeUserProfile({
                  user_id: session.user.id,
                  ...newProfile
                });
                
                // Start data preloading in background (non-blocking)
                preloadAllData(session.user.id, 'worker', assignment.store_id).catch(preloadError => {
                  console.warn('⚠️ Data preloading failed:', preloadError.message);
                });
                return;
              } else {
                console.error('❌ Failed to create worker profile:', profileError);
              }
            }
            
            // No worker assignment found or profile creation failed - show profile setup
            setIsAuthenticated(false);
            setNeedsProfileSetup(true);
            setUserRole(null);
          } catch (error) {
            console.error('❌ Error checking worker assignment:', error);
            setIsAuthenticated(false);
            setNeedsProfileSetup(true);
            setUserRole(null);
          }
        }
      } else {
        // Handle sign out
        if (event === 'SIGNED_OUT') {
          // Clear cached data
          try {
            await centralizedStorage.clearSecureStorage();
            
            // Clear preloaded data
            dataPreloader.clearPreloadedData();
          } catch (clearError) {
            console.error('❌ Error clearing cached data:', clearError);
          }
        }
        
        setIsAuthenticated(false);
        setUserRole(null);
        setCurrentUser(null);
        setNeedsProfileSetup(false);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Individual Navigation (solo operator - no store management)
  const IndividualTabs = () => (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarIcon: ({ color, size }) => {
          const name =
            route.name === "Dashboard" ? "home"
            : route.name === "Inventory" ? "inventory"
            : route.name === "Sales" ? "trending-up"
            : "credit-card";
          return <MaterialIcons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={UnifiedDashboardScreen} />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="Sales" component={SalesScreen} />
      <Tab.Screen name="Expenses" component={ExpensesScreen} />
    </Tab.Navigator>
  );

  // Worker Navigation (POS + Inventory only)
  const WorkerTabs = () => (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarIcon: ({ color, size }) => {
          const name =
            route.name === "POS" ? "point-of-sale"
            : route.name === "Inventory" ? "inventory"
            : "history";
          return <MaterialIcons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="POS" component={WorkerPOSScreen} />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="Sales History" component={SalesScreen} />
    </Tab.Navigator>
  );

  // Owner Navigation (Full access with store management)
  const OwnerTabs = () => (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarIcon: ({ color, size }) => {
          const name =
            route.name === "Dashboard" ? "home"
            : route.name === "Inventory" ? "inventory"
            : route.name === "Sales" ? "trending-up"
            : route.name === "Expenses" ? "credit-card"
            : "store";
          return <MaterialIcons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={UnifiedDashboardScreen} />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="Sales" component={SalesScreen} />
      <Tab.Screen name="Expenses" component={ExpensesScreen} />
      <Tab.Screen name="Stores" component={StoreManagementScreen} />
    </Tab.Navigator>
  );

  // Main Navigation Stack
  const MainStack = () => {
    console.log('MainStack rendering with userRole:', userRole);
    let TabsComponent;
    switch (userRole) {
      case 'individual':
        console.log('Using IndividualTabs');
        TabsComponent = IndividualTabs;
        break;
      case 'worker':
        console.log('Using WorkerTabs');
        TabsComponent = WorkerTabs;
        break;
      case 'owner':
        console.log('Using OwnerTabs');
        TabsComponent = OwnerTabs;
        break;
      default:
        console.log('Using default IndividualTabs');
        TabsComponent = IndividualTabs;
    }
    
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainApp" component={TabsComponent} />
        <Stack.Screen name="POSCheckoutScreen" component={POSCheckoutScreen} options={{ title: "Checkout", headerShown: true }} />
        <Stack.Screen name="CartScreen" component={CartScreen} options={{ title: "Cart", headerShown: true }} />
        <Stack.Screen name="AddItemScreen" component={AddItemScreen} options={{ title: "Add Item", headerShown: true }} />
        <Stack.Screen name="AddSaleScreen" component={AddSaleScreen} options={{ title: "Add Sale", headerShown: true }} />
        <Stack.Screen name="AddExpenseScreen" component={AddExpenseScreen} options={{ title: "Add Expense", headerShown: true }} />
        <Stack.Screen name="FinalSoldScreen" component={FinalSoldScreen} options={{ title: "Sale Complete", headerShown: true }} />
        {userRole === 'owner' && (
          <>
            {/* WorkerInvite screen removed - invitation feature disabled */}
          </>
        )}
      </Stack.Navigator>
    );
  };

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  return (
    <ErrorBoundary>
      <LanguageProvider>
        <StoreProvider>
          <NavigationContainer>
            {!supabaseUrl || !supabaseAnonKey ? (
              <View style={styles.configErrorContainer}>
                <MaterialIcons name="error-outline" size={64} color="#ef4444" />
                <Text style={styles.configErrorTitle}>Configuration Error</Text>
                <Text style={styles.configErrorText}>
                  This app is not properly configured. Please check your environment variables.
                </Text>
              </View>
            ) : isLoading || isPreloading || !isSQLiteReady ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={{ marginTop: 16, fontSize: 16, color: '#6b7280' }}>
                  {!isSQLiteReady ? "Initializing database..." : 
                   isPreloading ? "Preloading data..." : "Loading..."}
                </Text>
              </View>
            ) : isAuthenticated ? (
              <View style={{ flex: 1 }}>
                <SyncStatusIndicator />
                <MainStack />
              </View>
            ) : needsProfileSetup ? (
              <RoleSelectionScreen onProfileCreated={refreshAuthState} />
            ) : (
              <LoginScreen />
            )}
            <StatusBar style="light" />
          </NavigationContainer>
        </StoreProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  configErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f9fafb',
  },
  configErrorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  configErrorText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
});