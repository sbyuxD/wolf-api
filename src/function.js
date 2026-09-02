import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import chokidar from "chokidar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREATOR = "sbyuxD";

export const getPluginsDir = () => {
  const possibleDirs = [
    path.join(process.cwd(), "src", "plugins"),
    path.join(process.cwd(), "plugins"),
    path.resolve(__dirname, "plugins"),
    path.resolve(__dirname, "../src/plugins")
  ];

  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  return possibleDirs[0];
};

export const plugins = new Map();

export const sendSuccess = (res, result = null, statusCode = 200) => {
  return res.status(statusCode).json({
    status: true,
    creator: CREATOR,
    result
  });
};

export const sendError = (res, message = "Internal Server Error", statusCode = 500) => {
  return res.status(statusCode).json({
    status: false,
    creator: CREATOR,
    message
  });
};

export const safeFetch = async (url, options = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...(options.headers || {})
      }
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

const cacheStorage = new Map();

export const getCache = (key) => {
  const cached = cacheStorage.get(key);
  if (!cached) return null;

  if (Date.now() > cached.expireAt) {
    cacheStorage.delete(key);
    return null;
  }

  return cached.data;
};

export const setCache = (key, data, ttlSeconds = 60) => {
  cacheStorage.set(key, {
    data,
    expireAt: Date.now() + ttlSeconds * 1000
  });
};

export const validateParams = (schema, req) => {
  if (!schema || typeof schema !== "object") return null;

  for (const [key, config] of Object.entries(schema)) {
    const isRequired = typeof config === "object" ? config.required : false;
    if (isRequired) {
      const val = req.query[key] || req.body?.[key];
      if (val === undefined || val === null || val === "") {
        const desc = typeof config === "object" && config.description ? ` (${config.description})` : "";
        return `Parameter '${key}' wajib diisi${desc}`;
      }
    }
  }

  return null;
};

const parsePluginPath = (filePath, baseDir) => {
  const fullPath = path.resolve(filePath);
  const rel = path.relative(baseDir, fullPath).split(path.sep).join("/");
  const parts = rel.split("/");

  if (parts.length === 1) {
    const name = parts[0].replace(/\.(js|mjs)$/, "").toLowerCase();
    return { category: "general", name, routePath: `/general/${name}` };
  }

  const category = parts[0].toLowerCase();
  const name = parts.slice(1).join("/").replace(/\.(js|mjs)$/, "").toLowerCase();
  const routePath = `/${category}/${name}`;

  return { category, name, routePath };
};

export const loadPlugin = async (filePath) => {
  if (!filePath.endsWith(".js") && !filePath.endsWith(".mjs")) return null;
  const baseDir = getPluginsDir();
  const parsed = parsePluginPath(filePath, baseDir);
  if (!parsed) return null;

  try {
    const fullPath = path.resolve(filePath);
    const fileUrl = `${pathToFileURL(fullPath).href}?v=${Date.now()}`;
    const module = await import(fileUrl);
    const handler = module.default || module;

    if (!handler || typeof handler.execute !== "function") {
      console.warn(`[WARN] ${filePath} tidak mengekspor execute()`);
      return null;
    }

    const pluginObj = {
      name: handler.name || parsed.name,
      category: handler.category || parsed.category,
      path: parsed.routePath,
      method: (handler.method || ["GET"]).map((m) => m.toUpperCase()),
      description: handler.description || "",
      params: handler.params || {},
      cache: typeof handler.cache === "number" ? handler.cache : null,
      execute: handler.execute
    };

    plugins.set(parsed.routePath, pluginObj);
    console.log(`[✓] LOADED: ${pluginObj.method.join("/")} ${parsed.routePath}`);
    return pluginObj;
  } catch (err) {
    console.error(`[ㄨ] Gagal memuat plugin ${filePath}:`, err.message);
    return null;
  }
};

export const unloadPlugin = (filePath) => {
  const baseDir = getPluginsDir();
  const parsed = parsePluginPath(filePath, baseDir);
  if (parsed && plugins.has(parsed.routePath)) {
    plugins.delete(parsed.routePath);
    console.log(`[UNLOADED] ${parsed.routePath}`);
  }
};

const getFiles = (dir) => {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (item.isFile() && (item.name.endsWith(".js") || item.name.endsWith(".mjs"))) {
      results.push(fullPath);
    }
  }

  return results;
};

export const loadAllPlugins = async () => {
  const dir = getPluginsDir();
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
    return;
  }

  const files = getFiles(dir);
  for (const file of files) {
    await loadPlugin(file);
  }
};

export const resolveSingleRouteOnDemand = async (category, pluginName) => {
  const baseDir = getPluginsDir();
  const possiblePaths = [
    path.join(baseDir, category, `${pluginName}.js`),
    path.join(baseDir, category, `${pluginName}.mjs`),
    path.join(baseDir, `${pluginName}.js`)
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return await loadPlugin(filePath);
    }
  }

  return null;
};

export const watchPlugins = () => {
  const dir = getPluginsDir();
  if (!fs.existsSync(dir)) return;

  const watcher = chokidar.watch(dir, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  });

  watcher
    .on("add", loadPlugin)
    .on("change", loadPlugin)
    .on("unlink", unloadPlugin);
};