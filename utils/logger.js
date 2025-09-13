// Production-optimized logger
// Reduces console.log calls in production for better performance

const isDevelopment = __DEV__;

export const logger = {
  // Critical errors - always log
  error: (message, ...args) => {
    console.error(message, ...args);
  },
  
  // Warnings - always log
  warn: (message, ...args) => {
    console.warn(message, ...args);
  },
  
  // Info logs - only in development
  info: (message, ...args) => {
    if (isDevelopment) {
      console.log(message, ...args);
    }
  },
  
  // Debug logs - only in development
  debug: (message, ...args) => {
    if (isDevelopment) {
      console.log('🔍', message, ...args);
    }
  },
  
  // Success logs - only in development
  success: (message, ...args) => {
    if (isDevelopment) {
      console.log('✅', message, ...args);
    }
  },
  
  // Network logs - only in development
  network: (message, ...args) => {
    if (isDevelopment) {
      console.log('🌐', message, ...args);
    }
  },
  
  // Cache logs - only in development
  cache: (message, ...args) => {
    if (isDevelopment) {
      console.log('📱', message, ...args);
    }
  },
  
  // Auth logs - only in development
  auth: (message, ...args) => {
    if (isDevelopment) {
      console.log('🔐', message, ...args);
    }
  }
};

// Performance monitoring
export const performanceLogger = {
  start: (label) => {
    if (isDevelopment) {
      console.time(label);
    }
  },
  
  end: (label) => {
    if (isDevelopment) {
      console.timeEnd(label);
    }
  }
};
