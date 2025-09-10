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
    return 'noDataFound';
  } else if (error.code === '23505') {
    return 'itemAlreadyExists';
  } else if (error.code === '23503') {
    return 'cannotDeleteItemInUse';
  } else if (error.code === '42501') {
    return 'noPermission';
  } else if (error.message?.includes('JWT')) {
    return 'sessionExpired';
  } else if (error.message?.includes('network')) {
    return 'networkError';
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
    return 'insufficientStockForItem';
  } else if (error.message?.includes('Item not found')) {
    return 'itemNotFoundInInventory';
  } else if (error.message?.includes('quantity')) {
    return 'invalidQuantity';
  } else if (error.message?.includes('price')) {
    return 'invalidPrice';
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
    return 'cannotCompleteSaleInsufficientStock';
  } else if (error.message?.includes('Item not found')) {
    return 'itemsNoLongerAvailable';
  } else if (error.message?.includes('payment')) {
    return 'invalidPaymentMethod';
  } else if (error.message?.includes('customer')) {
    return 'invalidCustomerInformation';
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
    return 'invalidEmailOrPassword';
  } else if (error.message?.includes('Email not confirmed')) {
    return 'pleaseCheckEmailAndConfirm';
  } else if (error.message?.includes('User already registered')) {
    return 'accountWithEmailExists';
  } else if (error.message?.includes('Password should be at least')) {
    return 'passwordMinLength';
  } else if (error.message?.includes('JWT')) {
    return 'sessionExpired';
  } else {
    return error.message || 'authenticationFailed';
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
    return 'networkErrorCheckConnection';
  } else if (error.message?.includes('timeout')) {
    return 'requestTimedOut';
  } else if (error.message?.includes('offline')) {
    return 'youAreOffline';
  } else {
    return 'networkErrorCheckConnectionAndTryAgain';
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
    title = titleOrError.title || 'error';
    msg = titleOrError.message || 'anErrorOccurred';
    // If the object has an action property, we can use it for retry logic
    if (titleOrError.action === 'Retry' && onRetry === null && titleOrError.onRetry) {
      onRetry = titleOrError.onRetry;
    }
  } else {
    // Handle string format: showErrorAlert(title, message)
    title = titleOrError || 'error';
    msg = message || 'anErrorOccurred';
  }
  
  const buttons = [
    { text: 'ok', onPress: onCancel }
  ];
  
  if (onRetry) {
    buttons.unshift({ text: 'retry', onPress: onRetry });
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
  Alert.alert(title, message, [{ text: 'ok', onPress }]);
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
      { text: 'cancel', onPress: onCancel, style: 'cancel' },
      { text: 'confirm', onPress: onConfirm, style: 'destructive' }
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