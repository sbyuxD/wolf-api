import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import chokidar from "chokidar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PLUGINS_DIR = path.resolve(__dirname, "plugins");

const CREATOR = "sbyuxD";

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

export const plugins = new Map();

const parsePluginPath = (filePath) => {
  const rel = path.relative(PLUGINS_DIR, filePath).replace(/\\/g, "/");
  const parts = rel.split("/");
  if (parts.length < 2) return null;

  const category = parts[0].toLowerCase();
  const name = parts.slice(1).join("/").replace(/\.js$/, "").toLowerCase();
  const routePath = `/${category}/${name}`;

  return { category, name, routePath };
};

export const loadPlugin = async (filePath) => {
  if (!filePath.endsWith(".js")) return;
  const parsed = parsePluginPath(filePath);
  if (!parsed) return;

  try {
    const fileUrl = `${pathToFileURL(filePath).href}?v=${Date.now()}`;
    const module = await import(fileUrl);
    const handler = module.default;

    if (!handler || typeof handler.execute !== "function") return;

    plugins.set(parsed.routePath, {
      name: handler.name || parsed.name,
      category: handler.category || parsed.category,
      path: parsed.routePath,
      method: (handler.method || ["GET"]).map((m) => m.toUpperCase()),
      description: handler.description || "",
      params: handler.params || {},
      cache: typeof handler.cache === "number" ? handler.cache : null,
      execute: handler.execute
    });
  } catch (err) {
    console.error(`Failed to load: ${filePath}`, err);
  }
};

export const unloadPlugin = (filePath) => {
  const parsed = parsePluginPath(filePath);
  if (parsed && plugins.has(parsed.routePath)) {
    plugins.delete(parsed.routePath);
  }
};

const getFiles = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith(".js")) {
      results.push(fullPath);
    }
  }

  return results;
};

export const loadAllPlugins = async () => {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    return;
  }

  const files = getFiles(PLUGINS_DIR);
  await Promise.all(files.map(loadPlugin));
};

export const watchPlugins = () => {
  const watcher = chokidar.watch(PLUGINS_DIR, {
    ignoreInitial: true,
    persistent: true
  });

  watcher
    .on("add", loadPlugin)
    .on("change", loadPlugin)
    .on("unlink", unloadPlugin);
};