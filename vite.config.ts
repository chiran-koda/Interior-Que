import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig(({mode})=>{
 const base=loadEnv(mode,'.','').VITE_BASE_PATH||'/';
 return {base,plugins:[react(),VitePWA({registerType:'prompt',includeAssets:['icon.svg','icon-192.png','icon-512.png'],manifest:{name:'Interior Que — Project Management',short_name:'Interior Que',description:'Manage interior projects, quotations, payments and site progress in one place.',theme_color:'#4f46e5',background_color:'#f3f5fa',display:'standalone',start_url:base,scope:base,icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]},workbox:{globPatterns:['**/*.{js,css,html,png,jpg,svg,woff2,ttf}'],navigateFallback:base+'index.html',navigateFallbackDenylist:[/^\/api/],maximumFileSizeToCacheInBytes:5000000}})],build:{chunkSizeWarningLimit:800}};
});
