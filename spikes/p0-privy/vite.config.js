import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// stellar-sdk needs Buffer in the browser (the same need the CRA app has, DataStack open list).
export default defineConfig({ plugins: [react(), nodePolyfills({ include: ['buffer'], globals: { Buffer: true } })] });
