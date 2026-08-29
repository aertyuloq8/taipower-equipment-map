import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// dev 專用：把 /data/* 代理到專案根目錄的 data/（在 web/ root 之外）
// 讓 V2 的 ../data/*.json 在 dev 模式也能讀到（線上 GitHub Pages 無此限制）
function dataDirPlugin() {
  const dataDir = path.join(projectRoot, "data");
  return {
    name: "serve-project-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url?.split("?")[0] || "";
        if (!urlPath.startsWith("/data/")) return next();
        const target = path.join(dataDir, urlPath.slice("/data/".length));
        if (!target.startsWith(dataDir)) return next();
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return next();
        const ext = path.extname(target).toLowerCase();
        const types = { ".json": "application/json", ".csv": "text/csv", ".png": "image/png" };
        res.setHeader("Content-Type", types[ext] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(target).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: "web",
  base: "./",
  plugins: [dataDirPlugin()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "web/V2/indexV2.html"
    }
  },
  server: {
    open: false,
    // 允許 dev 模式讀取專案根目錄的 data/（在 web/ root 之外）
    fs: {
      allow: [".."]
    }
  },
  html: {
    cspNonce: undefined
  }
});
