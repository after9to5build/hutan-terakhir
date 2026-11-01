// Setelan build. `base: './'` bikin semua alamat file relatif,
// biar game jalan di subfolder (itch.io naruh game di html5.itch.zone/html/<id>/).
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1500, // three.js emang gede, peringatannya gak perlu
  },
});
