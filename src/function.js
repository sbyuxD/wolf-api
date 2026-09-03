import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import chokidar from "chokidar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREATOR = "sbyuxD";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1"
];

export const getRandomUserAgent = () => {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

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

export const safeFetch = async (url, options = {}, timeoutMs = 20000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": getRandomUserAgent(),
        ...(options.headers || {})
      }
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

export const downloadBuffer = async (url, options = {}, timeoutMs = 30000) => {
  const res = await safeFetch(url, options, timeoutMs);
  if (!res.ok) {
    throw new Error(`Failed to download buffer from target (${res.status})`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
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
  if (cacheStorage.size > 2000) {
    const oldestKey = cacheStorage.keys().next().value;
    cacheStorage.delete(oldestKey);
  }

  cacheStorage.set(key, {
    data,
    expireAt: Date.now() + ttlSeconds * 1000
  });
};

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cacheStorage.entries()) {
    if (now > v.expireAt) {
      cacheStorage.delete(k);
    }
  }
}, 300000);

export const extractAndValidateInput = (schema, req) => {
  const input = { ...(req.query || {}), ...(req.body || {}) };

  if (!schema || typeof schema !== "object") {
    return { input, error: null };
  }

  for (const [key, config] of Object.entries(schema)) {
    const isRequired = typeof config === "object" ? config.required : false;
    let val = input[key];

    if (val === undefined || val === null || val === "") {
      if (isRequired) {
        const desc = typeof config === "object" && config.description ? ` (${config.description})` : "";
        return { input: null, error: `Parameter '${key}' wajib diisi${desc}` };
      }
      continue;
    }

    if (typeof config === "object" && config.type) {
      if (config.type === "number") {
        const num = Number(val);
        if (isNaN(num)) {
          return { input: null, error: `Parameter '${key}' harus berupa angka numerik` };
        }
        input[key] = num;
      } else if (config.type === "boolean") {
        input[key] = val === "true" || val === true || val === 1 || val === "1";
      }
    }
  }

  return { input, error: null };
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
      timeout: typeof handler.timeout === "number" ? handler.timeout : 60000,
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