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
  ADMIN_CONFIG,
  createSessionToken,
  verifySessionToken
} from "./function.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(__dirname, "../public")));
app.use("/media", express.static(path.resolve(__dirname, "media")));

let initialized = false;
app.use(async (req, res, next) => {
  if (!initialized) {
    await loadAllPlugins();
    initialized = true;
  }
  next();
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return sendError(res, "Username dan password wajib diisi", 400);
  }

  if (username !== ADMIN_CONFIG.username || password !== ADMIN_CONFIG.password) {
    return sendError(res, "Kredensial login admin tidak valid", 401);
  }

  const token = createSessionToken(username);
  return sendSuccess(res, {
    message: "Login admin berhasil",
    token,
    user: {
      username,
      role: "owner"
    }
  });
});

app.get("/api/auth/me", (req, res) => {
  const authHeader = req.headers.authorization || req.headers["x-session-token"];
  const user = verifySessionToken(authHeader);

  if (!user) {
    return sendError(res, "Sesi tidak valid atau telah kedaluwarsa", 401);
  }

  return sendSuccess(res, {
    user,
    system: {
      uptime: `${Math.floor(process.uptime())}s`,
      memory: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`
    }
  });
});

app.post("/api/admin/purge-cache", (req, res) => {
  const authHeader = req.headers.authorization || req.headers["x-session-token"];
  const user = verifySessionToken(authHeader);

  if (!user || user.role !== "owner") {
    return sendError(res, "Akses ditolak: Hanya Developer/Owner yang diizinkan", 403);
  }

  const purgedCount = purgeAllCache();
  return sendSuccess(res, {
    message: "Semua memory cache berhasil dibersihkan",
    purged_items: purgedCount
  });
});

app.get("/api/endpoints", async (req, res) => {
  await loadAllPlugins();

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
    target = await resolveSingleRouteOnDemand(req.params.category, req.params.plugin);
  }

  if (!target) {
    return sendError(res, `Endpoint '${routePath}' not found`, 404);
  }

  if (!target.method.includes(req.method)) {
    return sendError(res, `Method ${req.method} not allowed`, 405);
  }

  let sessionUser = null;
  if (target.owner) {
    const authHeader = req.headers.authorization || req.headers["x-session-token"] || req.query.token;
    sessionUser = verifySessionToken(authHeader);

    if (!sessionUser || sessionUser.role !== "owner") {
      return sendError(res, "Akses ditolak: Endpoint ini khusus Developer / Owner! Silakan login di /admin.html", 403);
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
      user: sessionUser,
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