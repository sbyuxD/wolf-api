import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREATOR = "sbyuxD";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
];

export const plugins = new Map();
export const routeAliases = new Map();
const fileRegistry = new Map();
const cacheStorage = new Map();
const MAX_CACHE_ENTRIES = 1000;

let initPromise = null;
let activeWatcher = null;

export const getRandomUserAgent = () => {
  return USER_AGENTS[(Math.random() * USER_AGENTS.length) | 0];
};

export const normalizeSlug = (value, fallback = "general") => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
};

export const getPluginsDir = () => {
  const candidates = [
    path.join(process.cwd(), "src", "plugins"),
    path.resolve(__dirname, "plugins"),
    path.resolve(__dirname, "../src/plugins"),
    path.join(process.cwd(), "plugins")
  ];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        return dir;
      }
    } catch {}
  }

  return candidates[0];
};

export const sendSuccess = (res, result = null, statusCode = 200) => {
  if (res.headersSent) return;
  res.status(statusCode).json({
    status: true,
    creator: CREATOR,
    result
  });
};

export const sendError = (res, message = "Internal Server Error", statusCode = 500) => {
  if (res.headersSent) return;
  res.status(statusCode).json({
    status: false,
    creator: CREATOR,
    message: String(message || "Internal Server Error")
  });
};

export const createCombinedSignal = (timeoutMs = 20000, externalSignal = null) => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Operation timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason || new Error("Request aborted by client"));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  };

  return { signal: controller.signal, cleanup, abort: () => controller.abort() };
};

export const safeFetch = async (url, options = {}, timeoutMs = 20000) => {
  const { signal, cleanup } = createCombinedSignal(timeoutMs, options.signal);

  try {
    return await fetch(url, {
      ...options,
      signal,
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept": "*/*",
        ...(options.headers || {})
      }
    });
  } finally {
    cleanup();
  }
};

export const downloadBuffer = async (url, options = {}, timeoutMs = 30000) => {
  const response = await safeFetch(url, options, timeoutMs);
  if (!response.ok) {
    throw new Error(`Upstream responded with status ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

export const pipeStream = async (url, res, options = {}, timeoutMs = 30000) => {
  const response = await safeFetch(url, options, timeoutMs);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to open media stream (${response.status})`);
  }

  const contentType = response.headers.get("content-type");
  const contentLength = response.headers.get("content-length");

  if (contentType) res.setHeader("Content-Type", contentType);
  if (contentLength) res.setHeader("Content-Length", contentLength);
  res.setHeader("Accept-Ranges", "bytes");

  const readable = Readable.fromWeb(response.body);

  return new Promise((resolve, reject) => {
    const destroyStream = () => {
      if (!readable.destroyed) readable.destroy();
    };

    res.on("close", () => {
      destroyStream();
      resolve();
    });

    readable.on("end", resolve);
    readable.on("error", (err) => {
      destroyStream();
      reject(err);
    });

    readable.pipe(res);
  });
};

export const buildCacheKey = (routePath, input = {}) => {
  const keys = Object.keys(input).filter((k) => k !== "_t");
  if (keys.length === 0) return routePath;
  keys.sort();
  const normalizedQuery = keys.map((k) => `${k}=${String(input[k])}`).join("&");
  return `${routePath}?${normalizedQuery}`;
};

export const getCache = (key) => {
  const entry = cacheStorage.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expireAt) {
    cacheStorage.delete(key);
    return null;
  }

  cacheStorage.delete(key);
  cacheStorage.set(key, entry);
  return entry.data;
};

export const setCache = (key, data, ttlSeconds = 60) => {
  if (!ttlSeconds || ttlSeconds <= 0) return;

  if (cacheStorage.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cacheStorage.keys().next().value;
    if (oldestKey !== undefined) {
      cacheStorage.delete(oldestKey);
    }
  }

  cacheStorage.set(key, {
    data,
    expireAt: Date.now() + ttlSeconds * 1000
  });
};

export const purgeAllCache = () => {
  const total = cacheStorage.size;
  cacheStorage.clear();
  return total;
};

const cacheMaintenanceTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cacheStorage.entries()) {
    if (now > entry.expireAt) {
      cacheStorage.delete(key);
    }
  }
}, 120000);

if (typeof cacheMaintenanceTimer.unref === "function") {
  cacheMaintenanceTimer.unref();
}

export const extractAndValidateInput = (schema, req) => {
  const rawInput = { ...(req.query || {}), ...(req.body || {}) };
  const sanitized = { ...rawInput };

  if (!schema || typeof schema !== "object") {
    return { input: sanitized, error: null };
  }

  for (const [key, config] of Object.entries(schema)) {
    const rule = typeof config === "object" && config !== null ? config : {};
    const isRequired = Boolean(rule.required);
    let value = sanitized[key];

    if (value === undefined || value === null || String(value).trim() === "") {
      if (rule.default !== undefined) {
        sanitized[key] = rule.default;
        continue;
      }
      if (isRequired) {
        const hint = rule.description ? ` (${rule.description})` : "";
        return { input: null, error: `Parameter '${key}' wajib diisi${hint}` };
      }
      delete sanitized[key];
      continue;
    }

    if (typeof value === "string") {
      value = value.trim();
    }

    if (rule.type === "number") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return { input: null, error: `Parameter '${key}' harus berupa angka yang valid` };
      }
      if (typeof rule.min === "number" && parsed < rule.min) {
        return { input: null, error: `Parameter '${key}' minimal bernilai ${rule.min}` };
      }
      if (typeof rule.max === "number" && parsed > rule.max) {
        return { input: null, error: `Parameter '${key}' maksimal bernilai ${rule.max}` };
      }
      sanitized[key] = parsed;
    } else if (rule.type === "boolean") {
      if (typeof value === "boolean") {
        sanitized[key] = value;
      } else {
        const str = String(value).toLowerCase();
        sanitized[key] = str === "true" || str === "1" || str === "yes";
      }
    } else {
      sanitized[key] = String(value);
    }

    if (Array.isArray(rule.enum) && !rule.enum.includes(sanitized[key])) {
      return {
        input: null,
        error: `Parameter '${key}' harus salah satu dari: ${rule.enum.join(", ")}`
      };
    }
  }

  return { input: sanitized, error: null };
};

const parseFileCoordinates = (filePath, baseDir) => {
  const fullPath = path.resolve(filePath);
  const relative = path.relative(baseDir, fullPath).split(path.sep).join("/");
  const segments = relative.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  if (segments.length === 1) {
    const fileSlug = normalizeSlug(segments[0].replace(/\.(js|mjs|ts)$/, ""), "index");
    return { fullPath, folderCategory: "general", fileSlug };
  }

  const folderCategory = normalizeSlug(segments[0], "general");
  const rawName = segments
    .slice(1)
    .join("-")
    .replace(/\.(js|mjs|ts)$/, "");
  const fileSlug = normalizeSlug(rawName, "index");

  return { fullPath, folderCategory, fileSlug };
};

const detachFileRoutes = (fullPath) => {
  const existing = fileRegistry.get(fullPath);
  if (!existing) return;

  for (const route of existing.routes) {
    plugins.delete(route);
  }
  for (const alias of existing.aliases) {
    routeAliases.delete(alias);
  }

  fileRegistry.delete(fullPath);
};

export const unloadPlugin = (filePath) => {
  const fullPath = path.resolve(filePath);
  detachFileRoutes(fullPath);
};

export const loadPlugin = async (filePath, forceReload = false) => {
  if (!/\.(js|mjs|ts)$/.test(filePath)) return null;

  const baseDir = getPluginsDir();
  const coords = parseFileCoordinates(filePath, baseDir);
  if (!coords) return null;

  const { fullPath, folderCategory, fileSlug } = coords;

  let stat;
  try {
    stat = fs.statSync(fullPath);
    if (!stat.isFile()) return null;
  } catch {
    detachFileRoutes(fullPath);
    return null;
  }

  const mtimeMs = Math.trunc(stat.mtimeMs);
  const previous = fileRegistry.get(fullPath);

  if (!forceReload && previous && previous.mtimeMs === mtimeMs) {
    const firstRoute = previous.routes[0];
    return firstRoute ? plugins.get(firstRoute) : null;
  }

  try {
    const importUrl = `${pathToFileURL(fullPath).href}?v=${mtimeMs}`;
    const imported = await import(importUrl);
    const definition = imported.default || imported.plugin || imported;

    const runner =
      typeof definition?.run === "function"
        ? definition.run
        : typeof definition?.execute === "function"
          ? definition.execute
          : null;

    if (!runner) {
      detachFileRoutes(fullPath);
      return null;
    }

    const pluginName = normalizeSlug(definition.name || fileSlug, fileSlug);

    const rawCategories = Array.isArray(definition.categories) && definition.categories.length > 0
      ? definition.categories
      : definition.category
        ? [definition.category]
        : [folderCategory];

    const categories = [...new Set(rawCategories.map((c) => normalizeSlug(c, folderCategory)))];

    const methods = Array.isArray(definition.method) && definition.method.length > 0
      ? definition.method.map((m) => String(m).toUpperCase())
      : ["GET"];

    detachFileRoutes(fullPath);

    const registeredRoutes = [];
    const registeredAliases = [];
    let primaryDescriptor = null;

    for (const category of categories) {
      const canonicalRoute = `/${category}/${pluginName}`;
      const descriptor = {
        run: runner,
        execute: runner,
        name: pluginName,
        category,
        categories,
        path: canonicalRoute,
        method: methods,
        description: typeof definition.description === "string" ? definition.description.trim() : "",
        params: definition.params && typeof definition.params === "object" ? definition.params : {},
        cache: typeof definition.cache === "number" && definition.cache > 0 ? definition.cache : null,
        timeout: typeof definition.timeout === "number" && definition.timeout > 0 ? definition.timeout : 30000,
        filePath: fullPath
      };

      plugins.set(canonicalRoute, descriptor);
      registeredRoutes.push(canonicalRoute);

      if (!primaryDescriptor) {
        primaryDescriptor = descriptor;
      }

      const fileBasedRoute = `/${category}/${fileSlug}`;
      if (fileBasedRoute !== canonicalRoute) {
        routeAliases.set(fileBasedRoute, canonicalRoute);
        registeredAliases.push(fileBasedRoute);
      }
    }

    const folderRoute = `/${folderCategory}/${fileSlug}`;
    if (!plugins.has(folderRoute) && !routeAliases.has(folderRoute) && registeredRoutes.length > 0) {
      routeAliases.set(folderRoute, registeredRoutes[0]);
      registeredAliases.push(folderRoute);
    }

    fileRegistry.set(fullPath, {
      mtimeMs,
      routes: registeredRoutes,
      aliases: registeredAliases
    });

    return primaryDescriptor;
  } catch (err) {
    console.error(`[Plugin Error] ${path.basename(fullPath)}: ${err.message}`);
    return null;
  }
};

const walkPluginFiles = (dir) => {
  const results = [];
  try {
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const resolved = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkPluginFiles(resolved));
      } else if (entry.isFile() && /\.(js|mjs|ts)$/.test(entry.name)) {
        results.push(resolved);
      }
    }
  } catch {}
  return results;
};

export const loadAllPlugins = async () => {
  const dir = getPluginsDir();
  const discoveredFiles = new Set(walkPluginFiles(dir));

  for (const trackedPath of fileRegistry.keys()) {
    if (!discoveredFiles.has(trackedPath)) {
      detachFileRoutes(trackedPath);
    }
  }

  await Promise.allSettled([...discoveredFiles].map((file) => loadPlugin(file, false)));
  return plugins;
};

export const ensurePluginsLoaded = async () => {
  if (!initPromise) {
    initPromise = loadAllPlugins().finally(() => {
      initPromise = null;
    });
  }
  return initPromise;
};

export const resolvePluginRoute = async (category, slug) => {
  const cleanCat = normalizeSlug(category, "general");
  const cleanSlug = normalizeSlug(slug, "");
  const requestedPath = `/${cleanCat}/${cleanSlug}`;

  if (plugins.has(requestedPath)) {
    return plugins.get(requestedPath);
  }

  if (routeAliases.has(requestedPath)) {
    const targetRoute = routeAliases.get(requestedPath);
    if (plugins.has(targetRoute)) {
      return plugins.get(targetRoute);
    }
  }

  const baseDir = getPluginsDir();
  const candidates = [
    path.join(baseDir, cleanCat, `${cleanSlug}.js`),
    path.join(baseDir, cleanCat, `${cleanSlug}.mjs`),
    path.join(baseDir, `${cleanSlug}.js`)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const loaded = await loadPlugin(candidate, false);
      if (loaded) return loaded;
    }
  }

  await ensurePluginsLoaded();
  const resolvedCanonical = routeAliases.get(requestedPath) || requestedPath;
  return plugins.get(resolvedCanonical) || null;
};

export const watchPlugins = () => {
  if (activeWatcher) return;
  const dir = getPluginsDir();
  if (!fs.existsSync(dir)) return;

  const debounceTimers = new Map();

  try {
    activeWatcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename || !/\.(js|mjs|ts)$/.test(filename)) return;

      const fullPath = path.resolve(dir, filename);
      if (debounceTimers.has(fullPath)) {
        clearTimeout(debounceTimers.get(fullPath));
      }

      const timer = setTimeout(async () => {
        debounceTimers.delete(fullPath);
        if (fs.existsSync(fullPath)) {
          await loadPlugin(fullPath, true);
        } else {
          unloadPlugin(fullPath);
        }
      }, 120);

      debounceTimers.set(fullPath, timer);
    });
  } catch {}
};