import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import {
  plugins,
  loadAllPlugins,
  resolveSingleRouteOnDemand,
  sendSuccess,
  sendError,
  extractAndValidateInput,
  getCache,
  setCache,
  purgeAllCache,
  OWNER_USERNAME,
  validateGitHubOwner
} from "./function.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

try {
  app.use(express.static(path.resolve(__dirname, "../public")));
  app.use("/media", express.static(path.resolve(__dirname, "media")));
} catch {}

let initialized = false;
app.use(async (req, res, next) => {
  if (!initialized) {
    try {
      await loadAllPlugins();
    } catch (err) {
      console.error("[Init Error]:", err.message);
    }
    initialized = true;
  }
  next();
});

app.post("/api/admin/purge-cache", async (req, res) => {
  const authHeader = req.headers.authorization || req.headers["x-github-token"];
  const ownerUser = await validateGitHubOwner(authHeader);

  if (!ownerUser) {
    return sendError(res, `Akses ditolak: Hanya @${OWNER_USERNAME} yang diizinkan`, 403);
  }

  const purgedCount = purgeAllCache();
  return sendSuccess(res, {
    message: "Semua memory cache berhasil dibersihkan",
    purged_items: purgedCount
  });
});

app.get("/api/endpoints", async (req, res) => {
  try {
    await loadAllPlugins();
  } catch {}

  const endpoints = {};

  for (const [routePath, data] of plugins.entries()) {
    const category = data.category || "general";

    if (!endpoints[category]) {
      endpoints[category] = [];
    }

    endpoints[category].push({
      name: data.name,
      category: data.category,
      endpoint: routePath,
      method: data.method,
      description: data.description,
      owner: data.owner,
      params: data.params
    });
  }

  return sendSuccess(res, {
    total: plugins.size,
    endpoints
  });
});

app.all("/:category/:plugin(*)", async (req, res) => {
  const routePath = `/${req.params.category}/${req.params.plugin}`.toLowerCase();
  let target = plugins.get(routePath);

  if (!target) {
    try {
      target = await resolveSingleRouteOnDemand(req.params.category, req.params.plugin);
    } catch {}
  }

  if (!target) {
    return sendError(res, `Endpoint '${routePath}' not found`, 404);
  }

  if (!target.method.includes(req.method)) {
    return sendError(res, `Method ${req.method} not allowed`, 405);
  }

  let ownerUser = null;
  if (target.owner) {
    const authHeader = req.headers.authorization || req.headers["x-github-token"] || req.query.token;
    ownerUser = await validateGitHubOwner(authHeader);

    if (!ownerUser) {
      return sendError(res, `Akses ditolak: Endpoint ini khusus Owner (@${OWNER_USERNAME})`, 403);
    }
  }

  const { input, error } = extractAndValidateInput(target.params, req);
  if (error) {
    return sendError(res, error, 400);
  }

  const cacheKey = `${req.method}:${req.originalUrl}`;
  if (target.cache && req.method === "GET") {
    const cachedResult = getCache(cacheKey);
    if (cachedResult !== null) {
      return sendSuccess(res, cachedResult);
    }
  }

  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request execution timed out")), target.timeout || 60000);
    });

    const executionPromise = target.execute(req, res, {
      input,
      user: ownerUser,
      query: req.query || {},
      body: req.body || {},
      params: req.params || {}
    });

    const result = await Promise.race([executionPromise, timeoutPromise]);

    if (!res.headersSent && result !== undefined) {
      if (target.cache && req.method === "GET") {
        setCache(cacheKey, result, target.cache);
      }
      return sendSuccess(res, result);
    }
  } catch (err) {
    if (!res.headersSent) {
      return sendError(res, err.message || "Internal Server Error", 500);
    }
  }
});

app.use((req, res) => {
  return sendError(res, "Endpoint not found", 404);
});

export default app;