import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl'
// base './' lets the build work on Netlify, Vercel, or a GitHub Pages sub-path.
export default defineConfig({
    base: './',
    plugins: [/* your existing plugins */, basicSsl()],
    server: { host: true },
});
