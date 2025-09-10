/**
 * Time Filter Utility Functions
 * Provides date range calculations for dashboard filtering
 */

import { getTranslation } from './translations';

// We'll need to pass language as a parameter to these functions
export const TIME_FILTERS = {
  TODAY: 'today',
  WEEK: 'week', 
  MONTH: 'month',
  ALL_TIME: 'all_time'
};

/**
 * Get time filter labels with translation support
 * @param {string} language - Current language
 * @returns {Object} - Translated time filter labels
 */
export const getTimeFilterLabels = (language) => ({
  [TIME_FILTERS.TODAY]: getTranslation('today', language),
  [TIME_FILTERS.WEEK]: getTranslation('thisWeek', language),
  [TIME_FILTERS.MONTH]: getTranslation('thisMonth', language),
  [TIME_FILTERS.ALL_TIME]: getTranslation('allTime', language)
});

/**
 * Get human-readable date range description
 * @param {string} filter - Time filter type
 * @param {string} language - Current language
 * @returns {string} - Human-readable description
 */
export const getDateRangeDescription = (filter, language = 'en') => {
  const { startDate, endDate } = getDateRange(filter);
  
  if (!startDate || !endDate) {
    return getTranslation('allTime', language);
  }
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (filter === TIME_FILTERS.TODAY) {
    return `${getTranslation('today', language)} (${start.toLocaleDateString()})`;
  }
  
  if (filter === TIME_FILTERS.WEEK) {
    return `${getTranslation('thisWeek', language)} (${start.toLocaleDateString()} - ${end.toLocaleDateString()})`;
  }
  
  if (filter === TIME_FILTERS.MONTH) {
    return `${getTranslation('thisMonth', language)} (${start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})`;
  }
  
  return getTranslation('allTime', language);
};

/**
 * Get time filter options for Picker
 * @param {string} language - Current language
 * @returns {Array} - Array of { label, value } objects
 */
export const getTimeFilterOptions = (language = 'en') => {
  return Object.values(TIME_FILTERS).map(filter => ({
    label: getTimeFilterLabels(language)[filter],
    value: filter
  }));
};

/**
 * Get date range for a specific time filter
 * @param {string} filter - Time filter type
 * @returns {Object} - { startDate, endDate } in ISO string format
 */
export const getDateRange = (filter) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (filter) {
    case TIME_FILTERS.TODAY:
      return {
        startDate: today.toISOString(),
        endDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
      };
      
    case TIME_FILTERS.WEEK:
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      
      return {
        startDate: startOfWeek.toISOString(),
        endDate: endOfWeek.toISOString()
      };
      
    case TIME_FILTERS.MONTH:
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);
      
      return {
        startDate: startOfMonth.toISOString(),
        endDate: endOfMonth.toISOString()
      };
      
    case TIME_FILTERS.ALL_TIME:
    default:
      return {
        startDate: null, // No start date filter
        endDate: null    // No end date filter
      };
  }
};

/**
 * Check if a date falls within a time filter range
 * @param {string} date - Date to check (ISO string)
 * @param {string} filter - Time filter type
 * @returns {boolean} - Whether date falls within range
 */
export const isDateInRange = (date, filter) => {
  if (filter === TIME_FILTERS.ALL_TIME) {
    return true;
  }
  
  const { startDate, endDate } = getDateRange(filter);
  const checkDate = new Date(date);
  
  return checkDate >= new Date(startDate) && checkDate <= new Date(endDate);
};

/**
 * Format currency value
 * @param {number} value - Value to format
 * @param {string} currency - Currency code (default: USD)
 * @returns {string} - Formatted currency string
 */
export const formatCurrency = (value, currency = 'USD') => {
  if (value === null || value === undefined || isNaN(value)) {
    return '$0.00';
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

/**
 * Format number with commas
 * @param {number} value - Value to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} - Formatted number string
 */
export const formatNumber = (value, decimals = 0) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};
