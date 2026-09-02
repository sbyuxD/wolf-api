import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import {
  plugins,
  loadAllPlugins,
  sendSuccess,
  sendError,
  validateParams,
  getCache,
  setCache
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

app.get("/api/endpoints", (req, res) => {
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
  const target = plugins.get(routePath);

  if (!target) {
    return sendError(res, `Endpoint '${routePath}' not found`, 404);
  }

  if (!target.method.includes(req.method)) {
    return sendError(res, `Method ${req.method} not allowed`, 405);
  }

  const paramError = validateParams(target.params, req);
  if (paramError) {
    return sendError(res, paramError, 400);
  }

  const cacheKey = `${req.method}:${req.originalUrl}`;
  if (target.cache && req.method === "GET") {
    const cachedResult = getCache(cacheKey);
    if (cachedResult !== null) {
      return sendSuccess(res, cachedResult);
    }
  }

  try {
    const result = await target.execute(req, res);
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