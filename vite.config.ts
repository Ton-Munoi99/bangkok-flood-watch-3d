import { defineConfig } from 'vite';

// ponytail: MapLibre v6 loads its worker via a relative URL; Vite's dep pre-bundling breaks that path.
export default defineConfig({ optimizeDeps: { exclude: ['maplibre-gl'] } });
