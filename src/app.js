import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import {
  plugins,
  ensurePluginsLoaded,
  loadAllPlugins,
  resolvePluginRoute,
  sendSuccess,
  sendError,
  extractAndValidateInput,
  buildCacheKey,
  getCache,
  setCache,
  createCombinedSignal
} from "./function.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");
app.set("json spaces", 2);

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use(
  express.static(path.resolve(__dirname, "../public"), {
    maxAge: "1h",
    etag: true
  })
);

app.use(
  "/media",
  express.static(path.resolve(__dirname, "media"), {
    maxAge: "1d",
    etag: true
  })
);

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    const rawBody = JSON.stringify(payload, null, 2);
    res.setHeader("Content-Type", "application/json; charset=utf-8");

    const acceptEncoding = req.headers["accept-encoding"] || "";
    if (rawBody.length > 1024 && acceptEncoding.includes("gzip") && !res.getHeader("Content-Encoding")) {
      try {
        const compressed = zlib.gzipSync(Buffer.from(rawBody, "utf-8"));
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Content-Length", String(compressed.length));
        return res.end(compressed);
      } catch {}
    }

    return res.send(rawBody);
  };

  next();
});

app.use(async (req, res, next) => {
  if (plugins.size === 0) {
    try {
      await ensurePluginsLoaded();
    } catch {}
  }
  next();
});

app.get("/api/endpoints", async (req, res) => {
  try {
    await loadAllPlugins();
  } catch {}

  const grouped = {};
  let totalEndpoints = 0;

  const sortedEntries = [...plugins.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [routePath, item] of sortedEntries) {
    const category = item.category || "general";
    if (!grouped[category]) {
      grouped[category] = [];
    }

    grouped[category].push({
      name: item.name,
      category: item.category,
      categories: item.categories,
      endpoint: routePath,
      method: item.method,
      description: item.description,
      params: item.params
    });

    totalEndpoints++;
  }

  return sendSuccess(res, {
    total: totalEndpoints,
    endpoints: grouped
  });
});

app.get("/tools/ping", (req, res, next) => {
  if (plugins.has("/tools/ping")) {
    return next();
  }
  return sendSuccess(res, {
    status: "online",
    runtime: typeof Bun !== "undefined" ? `Bun v${Bun.version}` : `Node ${process.version}`,
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now()
  });
});

app.all("/:category/:plugin(*)", async (req, res) => {
  const target = await resolvePluginRoute(req.params.category, req.params.plugin);

  if (!target) {
    const attemptedPath = `/${req.params.category}/${req.params.plugin}`.toLowerCase();
    return sendError(res, `Endpoint '${attemptedPath}' tidak ditemukan`, 404);
  }

  if (!target.method.includes(req.method.toUpperCase())) {
    return sendError(res, `Method ${req.method} tidak diizinkan pada endpoint ini`, 405);
  }

  const { input, error } = extractAndValidateInput(target.params, req);
  if (error) {
    return sendError(res, error, 400);
  }

  req.input = input;

  const isCacheable = Boolean(target.cache && req.method === "GET");
  const cacheKey = isCacheable ? buildCacheKey(target.path, input) : null;

  if (isCacheable && cacheKey) {
    const cachedData = getCache(cacheKey);
    if (cachedData !== null) {
      return sendSuccess(res, cachedData);
    }
  }

  const clientDisconnectController = new AbortController();
  const onClientClose = () => {
    if (!res.writableEnded) {
      clientDisconnectController.abort(new Error("Client closed connection"));
    }
  };
  req.on("close", onClientClose);

  const { signal, cleanup } = createCombinedSignal(
    target.timeout || 30000,
    clientDisconnectController.signal
  );

  req.signal = signal;

  try {
    const context = {
      input,
      query: req.query || {},
      body: req.body || {},
      params: req.params || {},
      signal
    };

    const result = await target.run(req, res, context);

    if (!res.headersSent && result !== undefined) {
      if (isCacheable && cacheKey) {
        setCache(cacheKey, result, target.cache);
      }
      return sendSuccess(res, result);
    }
  } catch (err) {
    if (!res.headersSent) {
      const isTimeout = err?.name === "AbortError" || /timed out/i.test(err?.message || "");
      const statusCode = isTimeout ? 504 : err?.statusCode || 500;
      return sendError(res, err?.message || "Internal Server Error", statusCode);
    }
  } finally {
    cleanup();
    req.off("close", onClientClose);
  }
});

app.use((req, res) => {
  return sendError(res, "Endpoint not found", 404);
});

export default app;