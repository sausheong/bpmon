/**
 * History Manager - Client-side measurement history storage
 * 
 * This module handles storing measurement history in browser local storage
 * for persistent storage across sessions.
 */

class HistoryManager {
    constructor() {
        this.storageKey = 'bpm_measurement_history';
        this.maxHistory = 100; // Keep last 100 measurements
    }

    /**
     * Load measurement history from local storage
     * @returns {Array} Array of measurement objects
     */
    loadHistory() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading history:', error);
        }
        return [];
    }

    /**
     * Save measurement history to local storage
     * @param {Array} history - Array of measurement objects
     */
    saveHistory(history) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(history));
        } catch (error) {
            console.error('Error saving history:', error);
            throw new Error('Failed to save measurement history');
        }
    }

    /**
     * Add a new measurement to history
     * @param {Object} measurement - Measurement data object
     */
    addMeasurement(measurement) {
        const history = this.loadHistory();

        // Add timestamp if not present
        if (!measurement.timestamp) {
            measurement.timestamp = new Date().toISOString();
        }

        // Add to history
        history.push(measurement);

        // Keep only last N measurements
        if (history.length > this.maxHistory) {
            history.shift(); // Remove oldest
        }

        this.saveHistory(history);
        console.log('✓ Measurement added to history');
    }

    /**
     * Get all measurements, optionally sorted
     * @param {boolean} newestFirst - If true, return newest first
     * @returns {Array} Array of measurements
     */
    getAllMeasurements(newestFirst = true) {
        const history = this.loadHistory();
        if (newestFirst) {
            return history.reverse();
        }
        return history;
    }

    /**
     * Get measurement count
     * @returns {number} Number of measurements in history
     */
    getCount() {
        return this.loadHistory().length;
    }

    /**
     * Clear all measurement history
     */
    clearHistory() {
        try {
            localStorage.removeItem(this.storageKey);
            console.log('✓ Measurement history cleared');
        } catch (error) {
            console.error('Error clearing history:', error);
        }
    }

    /**
     * Export history as JSON string
     * @returns {string} JSON string of history data
     */
    exportHistory() {
        const history = this.loadHistory();
        return JSON.stringify(history, null, 2);
    }

    /**
     * Import history from JSON string
     * @param {string} jsonString - JSON string of history data
     */
    importHistory(jsonString) {
        try {
            const history = JSON.parse(jsonString);
            if (!Array.isArray(history)) {
                throw new Error('Invalid history format - must be an array');
            }
            this.saveHistory(history);
            console.log('✓ History imported successfully');
        } catch (error) {
            console.error('Error importing history:', error);
            throw new Error('Invalid history data format');
        }
    }

    /**
     * Get latest measurement
     * @returns {Object|null} Latest measurement or null if none
     */
    getLatest() {
        const history = this.loadHistory();
        return history.length > 0 ? history[history.length - 1] : null;
    }

    /**
     * Delete a specific measurement by timestamp
     * @param {string} timestamp - ISO timestamp of measurement to delete
     */
    deleteMeasurement(timestamp) {
        const history = this.loadHistory();
        const filtered = history.filter(m => m.timestamp !== timestamp);
        this.saveHistory(filtered);
        console.log('✓ Measurement deleted');
    }
}

// Create global instance
window.historyManager = new HistoryManager();
