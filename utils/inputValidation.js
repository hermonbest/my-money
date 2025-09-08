// Input validation utilities
import { Alert } from 'react-native';

/**
 * Validate required fields
 * @param {Object} fields - Object with field names as keys and values as values
 * @param {Array} requiredFields - Array of required field names
 * @returns {boolean} - True if all required fields are valid
 */
export const validateRequired = (fields, requiredFields) => {
  for (const field of requiredFields) {
    if (!fields[field] || fields[field].toString().trim() === '') {
      Alert.alert('Validation Error', `${field} is required`);
      return false;
    }
  }
  return true;
};

/**
 * Validate number fields
 * @param {Object} fields - Object with field names as keys and values as values
 * @param {Array} numberFields - Array of number field names
 * @returns {boolean} - True if all number fields are valid
 */
export const validateNumber = (fields, numberFields) => {
  for (const field of numberFields) {
    const value = parseFloat(fields[field]);
    if (isNaN(value) || value < 0) {
      Alert.alert('Validation Error', `${field} must be a valid positive number`);
      return false;
    }
  }
  return true;
};

/**
 * Validate currency fields
 * @param {Object} fields - Object with field names as keys and values as values
 * @param {Array} currencyFields - Array of currency field names
 * @returns {boolean} - True if all currency fields are valid
 */
export const validateCurrency = (fields, currencyFields) => {
  for (const field of currencyFields) {
    const value = parseFloat(fields[field]);
    if (isNaN(value) || value < 0) {
      Alert.alert('Validation Error', `${field} must be a valid positive amount`);
      return false;
    }
  }
  return true;
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if email is valid
 */
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    Alert.alert('Validation Error', 'Please enter a valid email address');
    return false;
  }
  return true;
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if phone is valid
 */
export const validatePhone = (phone) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
    Alert.alert('Validation Error', 'Please enter a valid phone number');
    return false;
  }
  return true;
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {boolean} - True if password is valid
 */
export const validatePassword = (password) => {
  if (password.length < 6) {
    Alert.alert('Validation Error', 'Password must be at least 6 characters long');
    return false;
  }
  return true;
};

/**
 * Validate form data with multiple validation rules
 * @param {Object} formData - Form data to validate
 * @param {Object} rules - Validation rules object
 * @returns {boolean} - True if all validations pass
 */
export const validateForm = (formData, rules) => {
  // Required fields validation
  if (rules.required && !validateRequired(formData, rules.required)) {
    return false;
  }

  // Number fields validation
  if (rules.numbers && !validateNumber(formData, rules.numbers)) {
    return false;
  }

  // Currency fields validation
  if (rules.currency && !validateCurrency(formData, rules.currency)) {
    return false;
  }

  // Email validation
  if (rules.email && !validateEmail(formData[rules.email])) {
    return false;
  }

  // Phone validation
  if (rules.phone && !validatePhone(formData[rules.phone])) {
    return false;
  }

  // Password validation
  if (rules.password && !validatePassword(formData[rules.password])) {
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