import fs from "node:fs";
import path from "node:path";
import { getPluginsDir, loadPlugin } from "../../function.js";

export default {
  name: "Add Dynamic Endpoint",
  category: "owner",
  description: "Membuat file plugin baru secara langsung dari code script ke src/plugins/<folder>/<nama>.js",
  method: ["POST"],
  owner: true,
  params: {
    path: {
      type: "string",
      required: true,
      description: "Lokasi file plugin (contoh: main/menu atau downloader/ig)"
    },
    code: {
      type: "string",
      required: true,
      description: "Source code plugin JavaScript lengkap"
    }
  },
  execute: async (req, res, { input }) => {
    const rawPath = input.path;
    const rawCode = input.code;

    if (!rawPath || typeof rawPath !== "string") {
      throw new Error("Parameter 'path' wajib diisi (contoh: main/menu)");
    }

    if (!rawCode || typeof rawCode !== "string") {
      throw new Error("Parameter 'code' wajib diisi berupa string JavaScript");
    }

    const cleanPath = rawPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

    if (cleanPath.includes("..")) {
      throw new Error("Karakter '..' (Path traversal) dilarang!");
    }

    const parts = cleanPath.split("/").filter(Boolean);
    if (parts.length < 2) {
      throw new Error("Format path harus berupa 'kategori/nama_file' (contoh: main/menu)");
    }

    const category = parts[0].toLowerCase();
    const fileName = parts.slice(1).join("/").replace(/\.(js|mjs)$/, "");
    const finalFileName = `${fileName}.js`;

    const baseDir = getPluginsDir();
    const targetFolder = path.join(baseDir, category);
    const targetFile = path.join(targetFolder, finalFileName);

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    fs.writeFileSync(targetFile, rawCode, "utf-8");

    const loaded = await loadPlugin(targetFile);

    if (!loaded) {
      throw new Error("File berhasil dibuat, namun gagal di-load ke router. Pastikan code memiliki 'export default { execute: ... }' yang valid.");
    }

    return {
      message: "Endpoint plugin berhasil dibuat dan langsung aktif",
      file_path: targetFile,
      endpoint: loaded.path,
      method: loaded.method,
      name: loaded.name,
      category: loaded.category,
      owner_only: loaded.owner,
      file_size: `${(Buffer.byteLength(rawCode, "utf-8") / 1024).toFixed(2)} KB`,
      created_at: new Date().toISOString()
    };
  }
};