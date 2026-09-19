import { defineConfig } from 'vite';

export default defineConfig({
  // 产物使用相对路径。
  //
  // 原因：GitHub Pages 把项目站部署在 /<repo>/ 子路径下（本仓库是 /xguard-hook/），
  // 而 Vite 默认的 base: '/' 会把资源写成 /assets/index-xxx.js ——
  // 浏览器会去 https://<user>.github.io/assets/... 取，必然 404，页面白屏。
  //
  // 相对路径同时兼容根路径部署（Vercel），不需要为两个平台维护两套配置。
  base: './',
});
