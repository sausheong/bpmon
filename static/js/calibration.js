/**
 * Calibration Manager - Client-side calibration storage and application
 * 
 * This module handles storing and applying user-specific calibration data
 * in browser local storage to improve prediction accuracy.
 */

class CalibrationManager {
    constructor() {
        this.storageKey = 'bpm_calibrations';
        this.maxCalibrations = 5; // Keep last 5 calibrations per model
    }

    /**
     * Load calibration data from local storage
     * @returns {Object} Calibration data with 'rf' and 'cnn' arrays
     */
    loadCalibrations() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                const parsed = JSON.parse(data);
                // Ensure structure exists
                if (!parsed.rf) parsed.rf = [];
                if (!parsed.cnn) parsed.cnn = [];
                return parsed;
            }
        } catch (error) {
            console.error('Error loading calibrations:', error);
        }
        return { rf: [], cnn: [] };
    }

    /**
     * Save calibration data to local storage
     * @param {Object} data - Calibration data object
     */
    saveCalibrations(data) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving calibrations:', error);
            throw new Error('Failed to save calibration data');
        }
    }

    /**
     * Store a new calibration measurement
     * @param {number} predictedSbp - Model's predicted systolic BP
     * @param {number} predictedDbp - Model's predicted diastolic BP
     * @param {number} predictedHr - Model's predicted heart rate
     * @param {number} actualSbp - User's actual systolic BP (from reference device)
     * @param {number} actualDbp - User's actual diastolic BP (from reference device)
     * @param {string} modelType - 'rf' or 'cnn'
     * @param {number|null} actualHr - Optional actual heart rate
     * @returns {Object} The calibration object that was saved
     */
    calibrate(predictedSbp, predictedDbp, predictedHr, actualSbp, actualDbp, modelType = 'cnn', actualHr = null) {
        modelType = modelType.toLowerCase();
        if (modelType !== 'rf' && modelType !== 'cnn') {
            modelType = 'cnn'; // Default fallback
        }

        console.log(`Calibrating for model: ${modelType.toUpperCase()}`);

        // Calculate offsets
        const sbpOffset = actualSbp - predictedSbp;
        const dbpOffset = actualDbp - predictedDbp;

        // Calculate scaling factors (ratio approach)
        const sbpScale = predictedSbp > 0 ? actualSbp / predictedSbp : 1.0;
        const dbpScale = predictedDbp > 0 ? actualDbp / predictedDbp : 1.0;

        const calibration = {
            timestamp: new Date().toISOString(),
            model: modelType,
            predicted: {
                sbp: predictedSbp,
                dbp: predictedDbp,
                hr: predictedHr
            },
            actual: {
                sbp: actualSbp,
                dbp: actualDbp,
                hr: actualHr
            },
            offsets: {
                sbp: sbpOffset,
                dbp: dbpOffset
            },
            scales: {
                sbp: sbpScale,
                dbp: dbpScale
            }
        };

        // Load existing calibrations
        const data = this.loadCalibrations();

        // Add new calibration
        data[modelType].push(calibration);

        // Keep only last N calibrations
        if (data[modelType].length > this.maxCalibrations) {
            data[modelType] = data[modelType].slice(-this.maxCalibrations);
        }

        // Save to local storage
        this.saveCalibrations(data);

        console.log(`✓ Calibration saved for ${modelType.toUpperCase()}!`);
        console.log(`  SBP offset: ${sbpOffset >= 0 ? '+' : ''}${sbpOffset.toFixed(1)} mmHg (predicted: ${predictedSbp.toFixed(1)} → actual: ${actualSbp.toFixed(1)})`);
        console.log(`  DBP offset: ${dbpOffset >= 0 ? '+' : ''}${dbpOffset.toFixed(1)} mmHg (predicted: ${predictedDbp.toFixed(1)} → actual: ${actualDbp.toFixed(1)})`);

        return calibration;
    }

    /**
     * Apply calibration to new predictions
     * Uses weighted average of recent calibrations for the specific model
     * @param {number} predictedSbp - Raw model prediction for SBP
     * @param {number} predictedDbp - Raw model prediction for DBP
     * @param {string} modelType - 'rf' or 'cnn'
     * @returns {Object} { sbp, dbp, isCalibrated }
     */
    applyCalibration(predictedSbp, predictedDbp, modelType = 'cnn') {
        modelType = modelType.toLowerCase();

        // Load calibrations
        const data = this.loadCalibrations();

        // Check if we have calibrations for this model
        if (!data[modelType] || data[modelType].length === 0) {
            return {
                sbp: predictedSbp,
                dbp: predictedDbp,
                isCalibrated: false
            };
        }

        const calibrations = data[modelType];

        // Use weighted average of offsets (more recent = higher weight)
        let sbpOffsetTotal = 0;
        let dbpOffsetTotal = 0;
        let weightTotal = 0;

        calibrations.forEach((cal, index) => {
            // Weight increases with recency (1, 2, 3, 4, 5)
            const weight = index + 1;
            sbpOffsetTotal += cal.offsets.sbp * weight;
            dbpOffsetTotal += cal.offsets.dbp * weight;
            weightTotal += weight;
        });

        const avgSbpOffset = sbpOffsetTotal / weightTotal;
        const avgDbpOffset = dbpOffsetTotal / weightTotal;

        // Apply offsets
        const calibratedSbp = predictedSbp + avgSbpOffset;
        const calibratedDbp = predictedDbp + avgDbpOffset;

        console.log(`Applied calibration (${modelType.toUpperCase()}): SBP ${predictedSbp.toFixed(1)} → ${calibratedSbp.toFixed(1)}, DBP ${predictedDbp.toFixed(1)} → ${calibratedDbp.toFixed(1)}`);

        return {
            sbp: calibratedSbp,
            dbp: calibratedDbp,
            isCalibrated: true
        };
    }

    /**
     * Get human-readable calibration status for all models
     * @returns {string} Formatted calibration info
     */
    getCalibrationInfo() {
        const data = this.loadCalibrations();
        const info = [];

        if (!data.rf || data.rf.length === 0) {
            if (!data.cnn || data.cnn.length === 0) {
                return 'No calibration data available';
            }
        }

        if (data.rf && data.rf.length > 0) {
            const latest = data.rf[data.rf.length - 1];
            info.push(`RF Model: ${data.rf.length} measurement(s)`);
            info.push(`  Latest: ${latest.timestamp.substring(0, 16)}`);
            info.push(`  Offset: SBP ${latest.offsets.sbp >= 0 ? '+' : ''}${latest.offsets.sbp.toFixed(1)}, DBP ${latest.offsets.dbp >= 0 ? '+' : ''}${latest.offsets.dbp.toFixed(1)}`);
            info.push('');
        }

        if (data.cnn && data.cnn.length > 0) {
            const latest = data.cnn[data.cnn.length - 1];
            info.push(`CNN Model: ${data.cnn.length} measurement(s)`);
            info.push(`  Latest: ${latest.timestamp.substring(0, 16)}`);
            info.push(`  Offset: SBP ${latest.offsets.sbp >= 0 ? '+' : ''}${latest.offsets.sbp.toFixed(1)}, DBP ${latest.offsets.dbp >= 0 ? '+' : ''}${latest.offsets.dbp.toFixed(1)}`);
        }

        return info.join('\n');
    }

    /**
     * Get calibration count for a specific model
     * @param {string} modelType - 'rf' or 'cnn'
     * @returns {number} Number of calibrations
     */
    getCalibrationCount(modelType = 'cnn') {
        const data = this.loadCalibrations();
        return data[modelType] ? data[modelType].length : 0;
    }

    /**
     * Clear all calibration data
     */
    clearCalibrations() {
        try {
            localStorage.removeItem(this.storageKey);
            console.log('✓ Calibration data cleared');
        } catch (error) {
            console.error('Error clearing calibrations:', error);
        }
    }

    /**
     * Export calibrations as JSON string
     * @returns {string} JSON string of calibration data
     */
    exportCalibrations() {
        const data = this.loadCalibrations();
        return JSON.stringify(data, null, 2);
    }

    /**
     * Import calibrations from JSON string
     * @param {string} jsonString - JSON string of calibration data
     */
    importCalibrations(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (!data.rf) data.rf = [];
            if (!data.cnn) data.cnn = [];
            this.saveCalibrations(data);
            console.log('✓ Calibrations imported successfully');
        } catch (error) {
            console.error('Error importing calibrations:', error);
            throw new Error('Invalid calibration data format');
        }
    }
}

// Create global instance
window.calibrationManager = new CalibrationManager();
