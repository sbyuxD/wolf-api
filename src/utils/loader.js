import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import chokidar from "chokidar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PLUGINS_DIR = path.resolve(__dirname, "../plugins");

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