import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// Dev only: serve /api/history/* from HISTORY_DIR (e.g. output of `node scripts/backfill.ts --dry <dir>`),
// standing in for netlify/functions/history.mts which only runs on Netlify.
const devHistory = (): Plugin => ({
  name: 'dev-history',
  apply: 'serve',
  configureServer(server) {
    const dir = process.env.HISTORY_DIR;
    if (!dir) return;
    server.middlewares.use('/api/history/', (req, res) => {
      const key = (req.url ?? '').replace(/^\//, '').replace(/[^\w-]/g, '');
      const file = `${dir}/${key}.json`;
      res.setHeader('content-type', 'application/json');
      if (!existsSync(file)) { res.statusCode = 404; res.end('null'); return; }
      res.end(readFileSync(file));
    });
  },
});

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
  plugins: [devHistory()],
  // ponytail: MapLibre v6 loads its worker via a relative URL; Vite's dep pre-bundling breaks that path.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  worker: { format: 'es' }, // MapLibre's worker is an ES module
  server: { proxy },
  preview: { proxy },
});
