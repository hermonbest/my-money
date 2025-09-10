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

export default {
  validateRequired,
  validateNumber,
  validateCurrency,
  validateEmail,
  validatePhone,
  validatePassword,
  validateForm
};