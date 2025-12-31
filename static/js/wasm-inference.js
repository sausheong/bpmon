/**
 * WebAssembly Inference Module for Blood Pressure Estimation
 * 
 * Uses ONNX Runtime Web to run the CNN model directly in the browser.
 */

class WasmInference {
    constructor() {
        this.session = null;
        this.scaler = null;
        this.isLoading = false;
        this.isReady = false;
        this.error = null;
    }

    /**
     * Initialize the WASM inference engine
     */
    async initialize() {
        if (this.isReady || this.isLoading) return;

        try {
            this.isLoading = true;
            console.log('Initializing WASM inference...');

            // check if onnxruntime is loaded
            if (typeof ort === 'undefined') {
                throw new Error('ONNX Runtime Web not loaded');
            }

            // Load model and scaler in parallel
            await Promise.all([
                this.loadModel(),
                this.loadScaler()
            ]);

            this.isReady = true;
            this.isLoading = false;
            console.log('✓ WASM inference ready');

            // Dispatch event for UI
            window.dispatchEvent(new CustomEvent('wasm-ready'));

        } catch (err) {
            console.error('Failed to initialize WASM inference:', err);
            this.error = err.message;
            this.isLoading = false;
            // Dispatch event for UI
            window.dispatchEvent(new CustomEvent('wasm-error', { detail: err.message }));
        }
    }

    /**
     * Load the ONNX model
     */
    async loadModel() {
        const modelPath = 'static/model/bp_model_cnn.onnx';

        // Fetch model bytes explicitly to avoid file system issues
        const response = await fetch(modelPath);
        if (!response.ok) throw new Error(`Failed to fetch model from ${modelPath}`);
        const buffer = await response.arrayBuffer();

        // Create session
        // executionProviders: ['wasm'] forces WebAssembly (no WebGL for 1D CNN usually better)
        this.session = await ort.InferenceSession.create(buffer, {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        });

        console.log('✓ Model loaded:', this.session.inputNames, '->', this.session.outputNames);
    }

    /**
     * Load the scaler metadata
     */
    async loadScaler() {
        const response = await fetch('static/model/scaler.json');
        if (!response.ok) throw new Error('Failed to load scaler');

        this.scaler = await response.json();
        console.log('✓ Scaler loaded');
    }

    /**
     * Run inference on PPG signal
     * @param {Array<number>} signal - Raw PPG signal
     * @param {number} fs - Sampling frequency (usually not used if pre-resampled)
     * @returns {Object} Prediction result {sbp, dbp, source: 'wasm'}
     */
    async predict(signal) {
        if (!this.isReady) throw new Error('WASM inference not ready');

        try {
            // 1. Preprocess: Windowing and Normalization
            // Note: Signal should already be resampled to 125Hz by the recorder

            const WINDOW_SIZE = 625;
            const STRIDE = Math.floor(WINDOW_SIZE / 2);
            const windows = [];

            // Create windows
            for (let i = 0; i <= signal.length - WINDOW_SIZE; i += STRIDE) {
                const window = signal.slice(i, i + WINDOW_SIZE);
                windows.push(window);
            }

            if (windows.length === 0) {
                throw new Error('Signal too short for inference');
            }

            // Create batch tensor (Batch, 1, 625)
            const batchSize = windows.length;
            const flattenedInput = new Float32Array(batchSize * 1 * WINDOW_SIZE);

            // Normalize and fill tensor data
            for (let i = 0; i < batchSize; i++) {
                const win = windows[i];
                const normalized = this.normalize(win);

                // Copy to float32 array
                for (let j = 0; j < WINDOW_SIZE; j++) {
                    flattenedInput[i * WINDOW_SIZE + j] = normalized[j];
                }
            }

            // Create tensor
            const tensor = new ort.Tensor('float32', flattenedInput, [batchSize, 1, WINDOW_SIZE]);

            // 2. Run Inference
            const feeds = { input: tensor };
            const results = await this.session.run(feeds);

            // 3. Post-process
            const outputData = results.output.data; // Flattened [Batch, 2]

            // Average predictions
            let sumSbp = 0;
            let sumDbp = 0;

            for (let i = 0; i < batchSize; i++) {
                sumSbp += outputData[i * 2];
                sumDbp += outputData[i * 2 + 1];
            }

            return {
                sbp: sumSbp / batchSize,
                dbp: sumDbp / batchSize,
                num_windows: batchSize,
                source: 'wasm'
            };

        } catch (err) {
            console.error('WASM prediction failed:', err);
            throw err;
        }
    }

    /**
     * Normalize signal using loaded scaler
     * @param {Array<number>} window - Raw signal window
     * @returns {Float32Array} Normalized window
     */
    normalize(window) {
        if (!this.scaler) {
            // Fallback to standard scaler if no metadata (manual standardization)
            const mean = window.reduce((a, b) => a + b, 0) / window.length;
            const variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window.length;
            const std = Math.sqrt(variance) + 1e-8;
            return Float32Array.from(window.map(x => (x - mean) / std));
        }

        // Use Scikit-Learn StandardScaler parameters: z = (x - u) / s
        // Note: PyTorch/CNN might be trained on per-window normalization or global.
        // The project uses StandardScaler. If it was fitted on training data, we use that.
        // Check export details: 
        // If the scaler in metadata is global, use it.
        // However, observing model_cnn.py:
        // "Normalization: StandardScaler applied per signal (CNN)..." usually implies 
        // it fit on the training data.

        // Actually, looking at app.py lines 143-147:
        // It transforms using global scaler if available, or manual per-window if not.

        // We will implement global scaler transform here.
        // Since we process window by window here in loop for simplicity of array management,
        // but scaler expects features.
        // Wait, the scaler is likely fit on 1D features or 2D array?
        // In python it does: scaler.transform(windows) where windows is (N, 625).
        // Standard scaler works on features (last dim).
        // Since input is (N, 625), it scales each time point 0..624 independently across batches.

        const { mean, scale } = this.scaler;
        const normalized = new Float32Array(window.length);

        for (let i = 0; i < window.length; i++) {
            normalized[i] = (window[i] - mean[i]) / scale[i];
        }

        return normalized;
    }
}

// Export singleton
window.wasmInference = new WasmInference();
