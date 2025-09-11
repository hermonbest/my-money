import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import services
import { supabase } from "./utils/supabase";
import { offlineManager } from "./utils/OfflineManager";
import { networkInterceptor } from "./utils/NetworkInterceptor"; // Add this import
import { dataPreloader } from "./utils/DataPreloader";

// Import components
import ErrorBoundary from "./components/ErrorBoundary";
import SyncStatusIndicator from "./components/SyncStatusIndicator";
import { StoreProvider } from "./contexts/StoreContext";
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
import WorkerInviteScreen from "./screens/WorkerInviteScreen";
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

  // Attach network interceptor to offline manager
  useEffect(() => {
    // Attach the network interceptor to the offline manager
    offlineManager.attachNetworkInterceptor(networkInterceptor);
  }, []);

  useEffect(() => {
    checkAuthState();
  }, []);

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
            // Cache user session
            await AsyncStorage.setItem('cached_user_session', JSON.stringify({
              user: session.user,
              timestamp: new Date().toISOString()
            }));
          }
        } catch (error) {
          console.warn('⚠️ Online session check failed, trying cached session:', error.message);
          // Fall through to cached session check
        }
      }

      // If no online session, try cached session
      if (!user) {
        const cachedSession = await AsyncStorage.getItem('cached_user_session');
        if (cachedSession) {
          try {
            const { user: cachedUser } = JSON.parse(cachedSession);
            user = cachedUser;
          } catch (parseError) {
            console.error('❌ Error parsing cached session:', parseError);
          }
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
              .single();
              
            if (!profileError && dbProfile) {
              console.log('🔍 Found profile in database:', dbProfile);
              // Cache the profile
              await AsyncStorage.setItem(`user_profile_${user.id}`, JSON.stringify(dbProfile));
              profile = dbProfile;
            }
          } catch (dbError) {
            console.warn('⚠️ Database profile check failed:', dbError.message);
          }
        }
        
        if (profile?.role) {
          setUserRole(profile.role);
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
        const cachedSession = await AsyncStorage.getItem('cached_user_session');
        if (cachedSession) {
          try {
            const { user } = JSON.parse(cachedSession);
            setCurrentUser(user);
            const profile = await loadUserProfile(user.id);
            
            if (profile?.role) {
              setUserRole(profile.role);
              setIsAuthenticated(true);
              setNeedsProfileSetup(false);
              
              // Preload all data for instant navigation
              try {
                await preloadAllData(user.id, profile.role, profile.store_id);
              } catch (preloadError) {
                console.warn('⚠️ Data preloading failed:', preloadError.message);
              }
            }
          } catch (parseError) {
            console.error('❌ Error parsing cached session:', parseError);
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
      
      // Try to get cached profile first
      const cachedProfile = await AsyncStorage.getItem(`user_profile_${userId}`);
      if (cachedProfile) {
        try {
          const parsedProfile = JSON.parse(cachedProfile);
          console.log('✅ Using cached profile:', parsedProfile);
          return parsedProfile;
        } catch (parseError) {
          console.error('❌ Error parsing cached profile:', parseError);
        }
      }
      
      // If online, try to fetch from database
      if (offlineManager.isConnected()) {
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', userId)
            .single();
          
          if (error) throw error;
          
          // Cache the profile
          await AsyncStorage.setItem(`user_profile_${userId}`, JSON.stringify(profile));
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
        
        // Cache user session
        try {
          await AsyncStorage.setItem('cached_user_session', JSON.stringify({
            user: session.user,
            timestamp: new Date().toISOString()
          }));
        } catch (cacheError) {
          console.error('❌ Error caching user session:', cacheError);
        }
        
        const profile = await loadUserProfile(session.user.id);
        console.log('Auth state change - profile:', profile);
        if (profile?.role) {
          console.log('Auth state change - setting user role to:', profile.role);
          setUserRole(profile.role);
          setIsAuthenticated(true);
          setNeedsProfileSetup(false);
          
          // Preload all data for instant navigation
          try {
            await preloadAllData(session.user.id, profile.role, profile.store_id);
          } catch (preloadError) {
            console.warn('⚠️ Data preloading failed:', preloadError.message);
          }
        } else {
          // User exists but no profile - they need to complete profile setup
          setIsAuthenticated(false);
          setNeedsProfileSetup(true);
          setUserRole(null);
        }
      } else {
        // Handle sign out
        if (event === 'SIGNED_OUT') {
          // Clear cached data
          try {
            await AsyncStorage.removeItem('cached_user_session');
            const allKeys = await AsyncStorage.getAllKeys();
            const profileKeys = allKeys.filter(key => key.startsWith('user_profile_'));
            if (profileKeys.length > 0) {
              await AsyncStorage.multiRemove(profileKeys);
            }
            
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

  // Individual Navigation (solo operator)
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
        <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: "Add Item", headerShown: true }} />
        <Stack.Screen name="AddSale" component={AddSaleScreen} options={{ title: "Record Sale", headerShown: true }} />
        <Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: "Add Expense", headerShown: true }} />
        <Stack.Screen name="CartScreen" component={CartScreen} options={{ title: "Cart", headerShown: true }} />
        <Stack.Screen name="FinalSoldScreen" component={FinalSoldScreen} options={{ title: "Sale Complete", headerShown: true }} />
        {userRole === 'owner' && (
          <>
            <Stack.Screen name="WorkerInvite" component={WorkerInviteScreen} options={{ title: "Invite Worker", headerShown: true }} />
          </>
        )}
      </Stack.Navigator>
    );
  };

  // Check if Supabase is properly configured
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
            ) : isLoading || isPreloading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={{ marginTop: 16, fontSize: 16, color: '#6b7280' }}>
                  {isPreloading ? "Preloading data..." : "Loading..."}
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