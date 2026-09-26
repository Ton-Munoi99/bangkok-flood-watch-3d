import { defineConfig } from 'vite';

// weather.bangkok.go.th sends no CORS headers, so the browser reaches it via a
// same-origin proxy. Production uses the equivalent rewrite in netlify.toml.
const proxy = {
  '/proxy/bma': {
    target: 'https://weather.bangkok.go.th',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/proxy\/bma/, ''),
  },
};

export default defineConfig({
  // ponytail: MapLibre v6 loads its worker via a relative URL; Vite's dep pre-bundling breaks that path.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' }, // MapLibre's worker is an ES module
  server: { proxy },
  preview: { proxy },
});
