/**
 * Expiration Utilities
 * Provides functions for managing inventory expiration dates and alerts
 */

/**
 * Get items expiring soon (within specified days)
 * @param {Array} inventory - Array of inventory items
 * @param {number} days - Number of days to check ahead (default: 30)
 * @returns {Array} - Items expiring soon
 */
export const getItemsExpiringSoon = (inventory, days = 30) => {
  try {
    if (!inventory || inventory.length === 0) {
      return [];
    }

    const today = new Date();
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + days);

    return inventory.filter(item => {
      if (!item.expiration_date) {
        return false;
      }

      const expirationDate = new Date(item.expiration_date);
      return expirationDate >= today && expirationDate <= futureDate;
    }).sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));
  } catch (error) {
    console.error('Error getting items expiring soon:', error);
    return [];
  }
};

/**
 * Get expired items
 * @param {Array} inventory - Array of inventory items
 * @returns {Array} - Expired items
 */
export const getExpiredItems = (inventory) => {
  try {
    if (!inventory || inventory.length === 0) {
      return [];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    return inventory.filter(item => {
      if (!item.expiration_date) {
        return false;
      }

      const expirationDate = new Date(item.expiration_date);
      expirationDate.setHours(0, 0, 0, 0); // Start of expiration date
      
      return expirationDate < today;
    }).sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));
  } catch (error) {
    console.error('Error getting expired items:', error);
    return [];
  }
};

/**
 * Get expiration summary statistics
 * @param {Array} inventory - Array of inventory items
 * @returns {Object} - Expiration summary
 */
export const getExpirationSummary = (inventory) => {
  try {
    if (!inventory || inventory.length === 0) {
      return {
        totalItems: 0,
        itemsWithExpiration: 0,
        expiredItems: 0,
        expiringSoon: 0,
        expiringThisWeek: 0,
        expiringThisMonth: 0,
        noExpirationDate: 0
      };
    }

    const today = new Date();
    const oneWeekFromNow = new Date(today);
    oneWeekFromNow.setDate(today.getDate() + 7);
    
    const oneMonthFromNow = new Date(today);
    oneMonthFromNow.setDate(today.getDate() + 30);

    let totalItems = inventory.length;
    let itemsWithExpiration = 0;
    let expiredItems = 0;
    let expiringSoon = 0;
    let expiringThisWeek = 0;
    let expiringThisMonth = 0;
    let noExpirationDate = 0;

    inventory.forEach(item => {
      if (item.expiration_date) {
        itemsWithExpiration++;
        const expirationDate = new Date(item.expiration_date);
        
        if (expirationDate < today) {
          expiredItems++;
        } else if (expirationDate <= oneMonthFromNow) {
          expiringSoon++;
          
          if (expirationDate <= oneWeekFromNow) {
            expiringThisWeek++;
          }
          
          if (expirationDate.getMonth() === today.getMonth() && 
              expirationDate.getFullYear() === today.getFullYear()) {
            expiringThisMonth++;
          }
        }
      } else {
        noExpirationDate++;
      }
    });

    return {
      totalItems,
      itemsWithExpiration,
      expiredItems,
      expiringSoon,
      expiringThisWeek,
      expiringThisMonth,
      noExpirationDate
    };
  } catch (error) {
    console.error('Error getting expiration summary:', error);
    return {
      totalItems: 0,
      itemsWithExpiration: 0,
      expiredItems: 0,
      expiringSoon: 0,
      expiringThisWeek: 0,
      expiringThisMonth: 0,
      noExpirationDate: 0
    };
  }
};

/**
 * Get items by expiration status
 * @param {Array} inventory - Array of inventory items
 * @param {string} status - 'expired', 'expiring_soon', 'expiring_this_week', 'expiring_this_month', 'no_expiration'
 * @returns {Array} - Filtered items
 */
export const getItemsByExpirationStatus = (inventory, status) => {
  try {
    if (!inventory || inventory.length === 0) {
      return [];
    }

    const today = new Date();
    const oneWeekFromNow = new Date(today);
    oneWeekFromNow.setDate(today.getDate() + 7);
    
    const oneMonthFromNow = new Date(today);
    oneMonthFromNow.setDate(today.getDate() + 30);

    switch (status) {
      case 'expired':
        return inventory.filter(item => {
          if (!item.expiration_date) return false;
          const expirationDate = new Date(item.expiration_date);
          return expirationDate < today;
        });

      case 'expiring_soon':
        return inventory.filter(item => {
          if (!item.expiration_date) return false;
          const expirationDate = new Date(item.expiration_date);
          return expirationDate >= today && expirationDate <= oneMonthFromNow;
        });

      case 'expiring_this_week':
        return inventory.filter(item => {
          if (!item.expiration_date) return false;
          const expirationDate = new Date(item.expiration_date);
          return expirationDate >= today && expirationDate <= oneWeekFromNow;
        });

      case 'expiring_this_month':
        return inventory.filter(item => {
          if (!item.expiration_date) return false;
          const expirationDate = new Date(item.expiration_date);
          return expirationDate.getMonth() === today.getMonth() && 
                 expirationDate.getFullYear() === today.getFullYear() &&
                 expirationDate >= today;
        });

      case 'no_expiration':
        return inventory.filter(item => !item.expiration_date);

      default:
        return [];
    }
  } catch (error) {
    console.error('Error getting items by expiration status:', error);
    return [];
  }
};

/**
 * Calculate days until expiration
 * @param {string} expirationDate - Expiration date string
 * @returns {number} - Days until expiration (negative if expired)
 */
export const getDaysUntilExpiration = (expirationDate) => {
  try {
    if (!expirationDate) {
      return null;
    }

    const today = new Date();
    const expDate = new Date(expirationDate);
    
    // Set both dates to start of day for accurate day calculation
    today.setHours(0, 0, 0, 0);
    expDate.setHours(0, 0, 0, 0);
    
    const diffTime = expDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  } catch (error) {
    console.error('Error calculating days until expiration:', error);
    return null;
  }
};

/**
 * Get expiration alert level for an item
 * @param {Object} item - Inventory item
 * @returns {string} - Alert level: 'expired', 'critical', 'warning', 'normal', 'none'
 */
export const getExpirationAlertLevel = (item) => {
  try {
    if (!item.expiration_date) {
      return 'none';
    }

    const daysUntilExpiration = getDaysUntilExpiration(item.expiration_date);
    
    if (daysUntilExpiration === null) {
      return 'none';
    }

    if (daysUntilExpiration < 0) {
      return 'expired';
    } else if (daysUntilExpiration <= 3) {
      return 'critical';
    } else if (daysUntilExpiration <= 7) {
      return 'warning';
    } else if (daysUntilExpiration <= 30) {
      return 'normal';
    } else {
      return 'none';
    }
  } catch (error) {
    console.error('Error getting expiration alert level:', error);
    return 'none';
  }
};

/**
 * Get color for expiration alert level
 * @param {string} alertLevel - Alert level
 * @returns {string} - Hex color code
 */
export const getExpirationAlertColor = (alertLevel) => {
  const colors = {
    expired: '#dc2626',    // Red
    critical: '#ea580c',   // Orange
    warning: '#d97706',    // Amber
    normal: '#059669',     // Green
    none: '#6b7280'        // Gray
  };
  
  return colors[alertLevel] || colors.none;
};

/**
 * Get expiration status for an item
 * @param {Object} item - Inventory item
 * @returns {string} - Status: 'expired', 'expiring_soon', 'normal', 'none'
 */
export const getExpirationStatus = (item) => {
  if (!item.expiration_date) {
    return 'none';
  }

  const daysUntilExpiration = getDaysUntilExpiration(item.expiration_date);
  
  if (daysUntilExpiration === null) {
    return 'none';
  }

  if (daysUntilExpiration < 0) {
    return 'expired';
  } else if (daysUntilExpiration <= 7) {
    return 'expiring_soon';
  } else {
    return 'normal';
  }
};

/**
 * Get color for expiration status
 * @param {string} status - Expiration status
 * @returns {string} - Hex color code
 */
export const getExpirationStatusColor = (status) => {
  const colors = {
    expired: '#dc2626',      // Red
    expiring_soon: '#f59e0b', // Orange
    normal: '#059669',        // Green
    none: '#6b7280'          // Gray
  };
  
  return colors[status] || colors.none;
};

/**
 * Format expiration date for display
 * @param {string} expirationDate - Expiration date string
 * @returns {string} - Formatted date string
 */
export const formatExpirationDate = (expirationDate) => {
  if (!expirationDate) {
    return 'No expiration date';
  }

  try {
    const date = new Date(expirationDate);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return 'Invalid date';
  }
};

/**
 * Check if item is expiring soon (within 7 days)
 * @param {Object} item - Inventory item
 * @returns {boolean} - True if expiring soon
 */
export const isExpiringSoon = (item) => {
  if (!item.expiration_date) {
    return false;
  }

  const daysUntilExpiration = getDaysUntilExpiration(item.expiration_date);
  return daysUntilExpiration !== null && daysUntilExpiration <= 7 && daysUntilExpiration >= 0;
};

/**
 * Check if item is expired
 * @param {Object} item - Inventory item
 * @returns {boolean} - True if expired
 */
export const isExpired = (item) => {
  if (!item.expiration_date) {
    return false;
  }

  const daysUntilExpiration = getDaysUntilExpiration(item.expiration_date);
  return daysUntilExpiration !== null && daysUntilExpiration < 0;
};
