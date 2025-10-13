/**
 * Common JavaScript functionality for BallisticsToolkit
 */

// Navigation helper
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-links a');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage || (currentPage === '' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Initialize common functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    setActiveNavLink();
});

// Utility functions
const Utils = {
    // Format numbers with specified decimal places
    formatNumber: function(num, decimals = 2) {
        return parseFloat(num).toFixed(decimals);
    },
    
    // Show loading overlay
    showLoading: function(message = 'Loading...') {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `<div>${message}</div>`;
            loading.classList.add('show');
        }
    },
    
    // Hide loading overlay
    hideLoading: function() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.remove('show');
        }
    },
    
    // Show error message
    showError: function(message) {
        alert('Error: ' + message);
    },
    
    // Validate numeric input
    validateNumber: function(value, min = 0, max = Infinity) {
        const num = parseFloat(value);
        return !isNaN(num) && num >= min && num <= max;
    },
    
    // Get form data as object
    getFormData: function(formId) {
        const form = document.getElementById(formId);
        if (!form) return {};
        
        const data = {};
        const inputs = form.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                data[input.id] = input.checked;
            } else if (input.type === 'number') {
                data[input.id] = parseFloat(input.value) || 0;
            } else {
                data[input.id] = input.value;
            }
        });
        
        return data;
    },
    
    // Set form data from object
    setFormData: function(formId, data) {
        const form = document.getElementById(formId);
        if (!form) return;
        
        Object.keys(data).forEach(key => {
            const input = form.querySelector(`#${key}`);
            if (input) {
                if (input.type === 'checkbox') {
                    input.checked = data[key];
                } else {
                    input.value = data[key];
                }
            }
        });
    }
};

// Export for use in other scripts
window.Utils = Utils;
