# 💰 Financial Dashboard App

A comprehensive React Native financial management application with **enterprise-grade offline functionality** built with Expo and Supabase.

## ✨ Features

### 🏪 **Multi-Store Management**
- **Individual Mode**: Personal finance tracking
- **Owner Mode**: Multi-store business management
- **Worker Mode**: Store-specific access

### 📊 **Financial Tracking**
- **Inventory Management**: Track products, quantities, and costs
- **Sales Analytics**: Monitor revenue and performance
- **Expense Tracking**: Manage business and personal expenses
- **Real-time Charts**: Visualize financial data

### 🌐 **Offline-First Architecture**
- **Seamless Offline/Online**: Works without internet connection
- **Automatic Sync**: Data syncs when connection is restored
- **Local Storage**: Secure data caching with AsyncStorage
- **Network Detection**: Real-time connectivity monitoring
- **Offline Indicator**: Visual status when disconnected

### 🔐 **Security & Authentication**
- **Supabase Auth**: Secure user authentication
- **Role-based Access**: Different permissions per user type
- **Data Encryption**: Secure local storage
- **Session Management**: Automatic login/logout

## 🚀 **Quick Start**

### Prerequisites
- Node.js (v16 or higher)
- Expo CLI
- Android Studio (for Android builds)
- Supabase account

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd financial-dashboard-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start the development server**
   ```bash
   npx expo start
   ```

## 📱 **Building for Production**

### Android APK
```bash
# Using EAS Build (recommended)
npm install -g eas-cli
eas login
eas build --platform android --profile production

# Or local build
npx expo run:android --variant release
```

### iOS App
```bash
# Using EAS Build
eas build --platform ios --profile production

# Or local build
npx expo run:ios --configuration Release
```

## 🧪 **Testing Offline Functionality**

1. **Build and install** the production APK
2. **Login** with your credentials
3. **Add some data** (inventory, sales, expenses)
4. **Turn off internet** (airplane mode)
5. **Verify offline banner** appears
6. **Test data access** (should show cached data)
7. **Turn internet back on**
8. **Verify automatic sync** occurs

## 🏗️ **Architecture**

### **Core Components**
- **App.js**: Main application with authentication flow
- **screens/**: All application screens
- **components/**: Reusable UI components
- **contexts/**: React contexts for state management
- **utils/**: Utility functions and services

### **Offline Infrastructure**
- **OfflineManager**: Network detection and sync management
- **NetworkContext**: React context for network status
- **OfflineIndicator**: Visual offline status component
- **OfflineDataService**: Data operations with offline support

### **Database**
- **Supabase**: Backend-as-a-Service
- **Real-time**: Live data synchronization
- **Authentication**: User management and security
- **Storage**: File and data storage

## 📦 **Dependencies**

### **Core**
- `expo`: React Native framework
- `react`: UI library
- `react-native`: Mobile development platform

### **Navigation**
- `@react-navigation/native`: Navigation library
- `@react-navigation/stack`: Stack navigation
- `@react-navigation/bottom-tabs`: Tab navigation

### **Backend**
- `@supabase/supabase-js`: Supabase client
- `@react-native-async-storage/async-storage`: Local storage
- `@react-native-community/netinfo`: Network detection

### **UI/UX**
- `react-native-chart-kit`: Charts and graphs
- `@expo/vector-icons`: Icon library
- `react-native-gesture-handler`: Touch gestures

## 🔧 **Configuration**

### **App Configuration**
- **app.json**: Expo configuration
- **eas.json**: EAS build configuration
- **package.json**: Dependencies and scripts

### **Android Configuration**
- **android/**: Native Android code
- **build.gradle**: Build configuration
- **AndroidManifest.xml**: App permissions

## 📊 **Project Structure**

```
financial-dashboard-app/
├── components/          # Reusable UI components
├── contexts/           # React contexts
├── screens/            # Application screens
├── utils/              # Utility functions
├── android/            # Android native code
├── assets/             # Images and static files
├── .env                # Environment variables
├── app.json            # Expo configuration
├── eas.json            # EAS build configuration
└── package.json        # Dependencies
```

## 🚀 **Deployment**

### **EAS Build (Recommended)**
1. Install EAS CLI: `npm install -g eas-cli`
2. Login: `eas login`
3. Configure: `eas build:configure`
4. Build: `eas build --platform android --profile production`

### **Local Build**
1. Generate native code: `npx expo run:android`
2. Build APK: `cd android && ./gradlew assembleRelease`
3. APK location: `android/app/build/outputs/apk/release/`

## 🧪 **Testing**

### **Offline Testing**
- Test with airplane mode enabled
- Verify data persistence
- Check sync functionality
- Validate error handling

### **Online Testing**
- Test all CRUD operations
- Verify real-time updates
- Check authentication flow
- Validate user roles

## 📈 **Performance**

- **Offline-first**: Fast local data access
- **Efficient sync**: Minimal data transfer
- **Caching**: Smart data storage
- **Optimized**: Smooth user experience

## 🔒 **Security**

- **Authentication**: Secure user login
- **Authorization**: Role-based access
- **Data encryption**: Secure local storage
- **Network security**: HTTPS communication

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 **License**

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 **Support**

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the test plans

## 🎯 **Roadmap**

- [ ] Enhanced offline sync algorithms
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] Dark mode theme
- [ ] Export/Import functionality
- [ ] Advanced reporting features

---

**Built with ❤️ using React Native, Expo, and Supabase**