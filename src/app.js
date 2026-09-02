import express from "express";
import cors from "cors";
import { plugins, loadAllPlugins } from "./utils/loader.js";
import { sendSuccess, sendError } from "./utils/response.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let initialized = false;
app.use(async (req, res, next) => {
  if (!initialized) {
    await loadAllPlugins();
    initialized = true;
  }
  next();
});

app.get("/", (req, res) => {
  const endpoints = {};

  for (const [routePath, data] of plugins.entries()) {
    if (!endpoints[data.category]) {
      endpoints[data.category] = [];
    }

    endpoints[data.category].push({
      name: data.name,
      endpoint: routePath,
      method: data.method,
      description: data.description
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

  try {
    const result = await target.execute(req, res);
    if (!res.headersSent && result !== undefined) {
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