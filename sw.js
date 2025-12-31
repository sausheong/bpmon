const CACHE_NAME = 'bpm-app-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './measure.html',
    './history.html',
    './calibrate.html',
    './static/js/wasm-inference.js',
    './static/js/recorder.js',
    './static/js/calibration.js',
    './static/js/history.js',
    './static/model/bp_model_cnn.onnx',
    './static/model/scaler.json',
    './static/img/bp.jpg',
    'https://cdn.jsdelivr.net/npm/daisyui@5/themes.css',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort-wasm.wasm',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort-wasm-simd.wasm'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});
