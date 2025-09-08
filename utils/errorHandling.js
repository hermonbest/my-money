// Centralized error handling utilities
import { Alert } from 'react-native';

/**
 * Handle Supabase errors with user-friendly messages
 * @param {Error} error - Supabase error object
 * @param {string} context - Context where error occurred
 * @returns {string} - User-friendly error message
 */
export const handleSupabaseError = (error, context = 'Operation') => {
  console.error(`${context} Supabase error:`, error);
  
  if (error.code === 'PGRST116') {
    return 'No data found';
  } else if (error.code === '23505') {
    return 'This item already exists';
  } else if (error.code === '23503') {
    return 'Cannot delete item - it is being used elsewhere';
  } else if (error.code === '42501') {
    return 'You do not have permission to perform this action';
  } else if (error.message?.includes('JWT')) {
    return 'Session expired. Please log in again';
  } else if (error.message?.includes('network')) {
    return 'Network error. Please check your connection';
  } else {
    return error.message || `${context} failed. Please try again`;
  }
};

/**
 * Handle inventory-specific errors
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 * @returns {string} - User-friendly error message
 */
export const handleInventoryError = (error, context = 'Inventory operation') => {
  console.error(`${context} error:`, error);
  
  if (error.message?.includes('Insufficient stock')) {
    return 'Insufficient stock for this item';
  } else if (error.message?.includes('Item not found')) {
    return 'Item not found in inventory';
  } else if (error.message?.includes('quantity')) {
    return 'Invalid quantity. Please enter a positive number';
  } else if (error.message?.includes('price')) {
    return 'Invalid price. Please enter a valid amount';
  } else {
    return handleSupabaseError(error, context);
  }
};

/**
 * Handle sales-specific errors
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 * @returns {string} - User-friendly error message
 */
export const handleSaleError = (error, context = 'Sale operation') => {
  console.error(`${context} error:`, error);
  
  if (error.message?.includes('Insufficient stock')) {
    return 'Cannot complete sale - insufficient stock for one or more items';
  } else if (error.message?.includes('Item not found')) {
    return 'One or more items are no longer available';
  } else if (error.message?.includes('payment')) {
    return 'Invalid payment method';
  } else if (error.message?.includes('customer')) {
    return 'Invalid customer information';
  } else {
    return handleSupabaseError(error, context);
  }
};

/**
 * Handle authentication errors
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 * @returns {string} - User-friendly error message
 */
export const handleAuthError = (error, context = 'Authentication') => {
  console.error(`${context} error:`, error);
  
  if (error.message?.includes('Invalid login credentials')) {
    return 'Invalid email or password';
  } else if (error.message?.includes('Email not confirmed')) {
    return 'Please check your email and confirm your account';
  } else if (error.message?.includes('User already registered')) {
    return 'An account with this email already exists';
  } else if (error.message?.includes('Password should be at least')) {
    return 'Password must be at least 6 characters long';
  } else if (error.message?.includes('JWT')) {
    return 'Session expired. Please log in again';
  } else {
    return error.message || 'Authentication failed. Please try again';
  }
};

/**
 * Handle network errors
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 * @returns {string} - User-friendly error message
 */
export const handleNetworkError = (error, context = 'Network operation') => {
  console.error(`${context} network error:`, error);
  
  if (error.message?.includes('Network request failed')) {
    return 'Network error. Please check your internet connection';
  } else if (error.message?.includes('timeout')) {
    return 'Request timed out. Please try again';
  } else if (error.message?.includes('offline')) {
    return 'You are offline. Some features may not be available';
  } else {
    return 'Network error. Please check your connection and try again';
  }
};

/**
 * Show error alert with retry option
 * @param {string|Object} titleOrError - Alert title (string) or error object with title/message properties
 * @param {string} message - Alert message (optional if first param is object)
 * @param {Function} onRetry - Retry function
 * @param {Function} onCancel - Cancel function
 */
export const showErrorAlert = (titleOrError, message = null, onRetry = null, onCancel = null) => {
  let title, msg;
  
  // Handle object format: showErrorAlert({ title, message, action })
  if (typeof titleOrError === 'object' && titleOrError !== null) {
    title = titleOrError.title || 'Error';
    msg = titleOrError.message || 'An error occurred';
    // If the object has an action property, we can use it for retry logic
    if (titleOrError.action === 'Retry' && onRetry === null && titleOrError.onRetry) {
      onRetry = titleOrError.onRetry;
    }
  } else {
    // Handle string format: showErrorAlert(title, message)
    title = titleOrError || 'Error';
    msg = message || 'An error occurred';
  }
  
  const buttons = [
    { text: 'OK', onPress: onCancel }
  ];
  
  if (onRetry) {
    buttons.unshift({ text: 'Retry', onPress: onRetry });
  }
  
  Alert.alert(title, msg, buttons);
};

/**
 * Show success alert
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {Function} onPress - Callback function
 */
export const showSuccessAlert = (title, message, onPress = null) => {
  Alert.alert(title, message, [{ text: 'OK', onPress }]);
};

/**
 * Show confirmation alert
 * @param {string} title - Alert title
 * @param {string} message - Alert message
 * @param {Function} onConfirm - Confirm function
 * @param {Function} onCancel - Cancel function
 */
export const showConfirmationAlert = (title, message, onConfirm, onCancel = null) => {
  Alert.alert(
    title,
    message,
    [
      { text: 'Cancel', onPress: onCancel, style: 'cancel' },
      { text: 'Confirm', onPress: onConfirm, style: 'destructive' }
    ]
  );
};

/**
 * Log error with context
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 * @param {Object} additionalData - Additional data to log
 */
export const logError = (error, context, additionalData = {}) => {
  console.error(`[${context}] Error:`, {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...additionalData
  });
};

/**
 * Handle generic errors with fallback
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 * @param {string} fallbackMessage - Fallback message if error handling fails
 * @returns {string} - User-friendly error message
 */
export const handleGenericError = (error, context, fallbackMessage = 'An unexpected error occurred') => {
  try {
    if (error.message?.includes('Supabase')) {
      return handleSupabaseError(error, context);
    } else if (error.message?.includes('inventory') || error.message?.includes('stock')) {
      return handleInventoryError(error, context);
    } else if (error.message?.includes('sale') || error.message?.includes('transaction')) {
      return handleSaleError(error, context);
    } else if (error.message?.includes('auth') || error.message?.includes('login')) {
      return handleAuthError(error, context);
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      return handleNetworkError(error, context);
    } else {
      return error.message || fallbackMessage;
    }
  } catch (handlingError) {
    console.error('Error in error handling:', handlingError);
    return fallbackMessage;
  }
};

export default {
  handleSupabaseError,
  handleInventoryError,
  handleSaleError,
  handleAuthError,
  handleNetworkError,
  showErrorAlert,
  showSuccessAlert,
  showConfirmationAlert,
  logError,
  handleGenericError
};