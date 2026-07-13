import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    // Absolute base: hashed assets must resolve from /assets/* no matter how deep
    // the route is. With './', a hard reload at /admin/users resolves them against
    // /admin/ -> 404 -> the SPA fallback serves index.html as JS -> blank page.
    base: '/',
    plugins: [react()],
    server: { port: 5050, host: true },
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
