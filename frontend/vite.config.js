import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: '../ansible_template_ui/client/',
    emptyOutDir: true,
    // Monaco Editor's core is ~3.6 MB — a known outlier that cannot be split further.
    chunkSizeWarningLimit: 4000,
    // Built-in Vite plugins (css-post, worker, asset) dominate timing stats due to Monaco's
    // ~90 language chunks — not actionable. Suppress this informational noise.
    rolldownOptions: {
      checks: {
        pluginTimings: false,
      },
    },
  },
  server: {
    proxy: {
      '/render': process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
      '/plugins': process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
    }
  }
})
