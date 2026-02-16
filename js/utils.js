/**
 * Utilities for MG Nails Paris
 */

const Utils = {
    // Format currency to Euros
    formatCurrency: (amount) => {
        return new Intl.NumberFormat('es-FR', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);
    },

    // Format date for display
    formatDate: (dateString) => {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return new Date(dateString).toLocaleDateString('es-ES', options);
    },
    
    // Get current date formatted
    getCurrentDate: () => {
        return Utils.formatDate(new Date());
    },

    // Generate unique ID
    generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
};
