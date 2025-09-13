// Input validation utilities
import { Alert } from 'react-native';
import { getTranslation } from './translations'; // Import getTranslation function
import { useLanguage } from '../contexts/LanguageContext'; // Import useLanguage hook

// We'll need to pass language as a parameter to these functions
/**
 * Validate required fields
 * @param {Object} fields - Object with field names as keys and values as values
 * @param {Array} requiredFields - Array of required field names
 * @param {string} language - Current language
 * @returns {boolean} - True if all required fields are valid
 */
export const validateRequired = (fields, requiredFields, language) => {
  for (const field of requiredFields) {
    if (!fields[field] || fields[field].toString().trim() === '') {
      Alert.alert(getTranslation('validationError', language), getTranslation('required', language));
      return false;
    }
  }
  return true;
};

/**
 * Validate number fields
 * @param {Object} fields - Object with field names as keys and values as values
 * @param {Array} numberFields - Array of number field names
 * @param {string} language - Current language
 * @returns {boolean} - True if all number fields are valid
 */
export const validateNumber = (fields, numberFields, language) => {
  for (const field of numberFields) {
    const value = parseFloat(fields[field]);
    if (isNaN(value) || value < 0) {
      Alert.alert(getTranslation('validationError', language), getTranslation('invalidNumber', language));
      return false;
    }
  }
  return true;
};

/**
 * Validate currency fields
 * @param {Object} fields - Object with field names as keys and values as values
 * @param {Array} currencyFields - Array of currency field names
 * @param {string} language - Current language
 * @returns {boolean} - True if all currency fields are valid
 */
export const validateCurrency = (fields, currencyFields, language) => {
  for (const field of currencyFields) {
    const value = parseFloat(fields[field]);
    if (isNaN(value) || value < 0) {
      Alert.alert(getTranslation('validationError', language), getTranslation('invalidAmount', language));
      return false;
    }
  }
  return true;
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @param {string} language - Current language
 * @returns {boolean} - True if email is valid
 */
export const validateEmail = (email, language) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    Alert.alert(getTranslation('validationError', language), getTranslation('invalidEmail', language));
    return false;
  }
  return true;
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @param {string} language - Current language
 * @returns {boolean} - True if phone is valid
 */
export const validatePhone = (phone, language) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
    Alert.alert(getTranslation('validationError', language), getTranslation('invalidPhone', language));
    return false;
  }
  return true;
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @param {string} language - Current language
 * @returns {boolean} - True if password is valid
 */
export const validatePassword = (password, language) => {
  if (password.length < 6) {
    Alert.alert(getTranslation('validationError', language), getTranslation('passwordMinLength', language).replace('{min}', '6'));
    return false;
  }
  return true;
};

/**
 * Validate form data with multiple validation rules
 * @param {Object} formData - Form data to validate
 * @param {Object} rules - Validation rules object
 * @param {string} language - Current language
 * @returns {boolean} - True if all validations pass
 */
export const validateForm = (formData, rules, language) => {
  // Required fields validation
  if (rules.required && !validateRequired(formData, rules.required, language)) {
    return false;
  }

  // Number fields validation
  if (rules.numbers && !validateNumber(formData, rules.numbers, language)) {
    return false;
  }

  // Currency fields validation
  if (rules.currency && !validateCurrency(formData, rules.currency, language)) {
    return false;
  }

  // Email validation
  if (rules.email && !validateEmail(formData[rules.email], language)) {
    return false;
  }

  // Phone validation
  if (rules.phone && !validatePhone(formData[rules.phone], language)) {
    return false;
  }

  // Password validation
  if (rules.password && !validatePassword(formData[rules.password], language)) {
    return false;
  }

  return true;
};

/**
 * Schema-based validation for different data types
 * @param {string} schemaType - Type of schema to validate against
 * @param {Object} data - Data to validate  
 * @param {Object} fieldLabels - Human-readable field labels for error messages
 * @param {string} language - Current language
 * @returns {Object} - Validation result with isValid boolean and errors array
 */
export const validateWithSchema = (schemaType, data, fieldLabels = {}, language = 'en') => {
  const errors = [];
  
  switch (schemaType) {
    case 'expense':
      // Required fields for expenses
      if (!data.title || data.title.trim() === '') {
        errors.push(`${fieldLabels.title || 'Title'} ${getTranslation('required', language).toLowerCase()}`);
      }
      if (!data.category || data.category.trim() === '') {
        errors.push(`${fieldLabels.category || 'Category'} ${getTranslation('required', language).toLowerCase()}`);
      }
      if (!data.amount || data.amount.toString().trim() === '') {
        errors.push(`${fieldLabels.amount || 'Amount'} ${getTranslation('required', language).toLowerCase()}`);
      } else {
        const amount = parseFloat(data.amount);
        if (isNaN(amount) || amount <= 0) {
          errors.push(`${fieldLabels.amount || 'Amount'} ${getTranslation('invalidAmount', language).toLowerCase()}`);
        }
      }
      if (!data.expense_date || data.expense_date.trim() === '') {
        errors.push(`${fieldLabels.expense_date || 'Expense Date'} ${getTranslation('required', language).toLowerCase()}`);
      }
      break;
      
    case 'inventory':
      // Required fields for inventory items
      if (!data.name || data.name.trim() === '') {
        errors.push(`${fieldLabels.name || 'Item Name'} ${getTranslation('required', language).toLowerCase()}`);
      }
      if (!data.cost_price || data.cost_price.toString().trim() === '') {
        errors.push(`${fieldLabels.cost_price || 'Cost Price'} ${getTranslation('required', language).toLowerCase()}`);
      } else {
        const costPrice = parseFloat(data.cost_price);
        if (isNaN(costPrice) || costPrice < 0) {
          errors.push(`${fieldLabels.cost_price || 'Cost Price'} ${getTranslation('invalidAmount', language).toLowerCase()}`);
        }
      }
      if (!data.selling_price || data.selling_price.toString().trim() === '') {
        errors.push(`${fieldLabels.selling_price || 'Selling Price'} ${getTranslation('required', language).toLowerCase()}`);
      } else {
        const sellingPrice = parseFloat(data.selling_price);
        if (isNaN(sellingPrice) || sellingPrice < 0) {
          errors.push(`${fieldLabels.selling_price || 'Selling Price'} ${getTranslation('invalidAmount', language).toLowerCase()}`);
        }
      }
      if (!data.quantity || data.quantity.toString().trim() === '') {
        errors.push(`${fieldLabels.quantity || 'Quantity'} ${getTranslation('required', language).toLowerCase()}`);
      } else {
        const quantity = parseFloat(data.quantity);
        if (isNaN(quantity) || quantity < 0) {
          errors.push(`${fieldLabels.quantity || 'Quantity'} ${getTranslation('invalidQuantity', language).toLowerCase()}`);
        }
      }
      break;
      
    case 'sale':
      // Required fields for sales
      if (!data.customer_name || data.customer_name.trim() === '') {
        errors.push(`${fieldLabels.customer_name || 'Customer Name'} ${getTranslation('required', language).toLowerCase()}`);
      }
      if (!data.payment_method || data.payment_method.trim() === '') {
        errors.push(`${fieldLabels.payment_method || 'Payment Method'} ${getTranslation('required', language).toLowerCase()}`);
      }
      break;
      
    default:
      console.warn(`Unknown schema type: ${schemaType}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

/**
 * Show validation errors to the user
 * @param {Object} validationResult - Result from validateWithSchema
 * @param {string} language - Current language
 */
export const showValidationErrors = (validationResult, language = 'en') => {
  if (!validationResult.isValid && validationResult.errors.length > 0) {
    const errorMessage = validationResult.errors.join('\n');
    Alert.alert(getTranslation('validationError', language), errorMessage);
  }
};

export default {
  validateRequired,
  validateNumber,
  validateCurrency,
  validateEmail,
  validatePhone,
  validatePassword,
  validateForm,
  validateWithSchema,
  showValidationErrors
};