import { safeFetch } from "../../function.js";

const BASE_URL = "https://webappcreator.amethystlab.org";

const generatePackageName = (appName) => {
  const cleaned = appName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `com.${cleaned || "webapp"}.app`;
};

const getIconBlob = async (iconUrl, websiteUrl) => {
  const targetUrl = iconUrl || `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(websiteUrl)}`;
  const res = await safeFetch(targetUrl, {}, 10000);

  if (!res.ok) {
    throw new Error("Gagal mengunduh ikon aplikasi");
  }

  const buffer = await res.arrayBuffer();
  return new Blob([buffer], { type: "image/png" });
};

export default {
  name: "Web to APK",
  category: "tools",
  description: "Convert any website URL into an installable Android APK",
  method: ["GET", "POST"],
  params: {
    url: {
      type: "string",
      required: true,
      description: "Target website URL (e.g. https://example.com)"
    },
    name: {
      type: "string",
      required: true,
      description: "Application name"
    },
    icon_url: {
      type: "string",
      required: false,
      description: "Direct image URL for app icon (optional, defaults to website favicon)"
    },
    package_name: {
      type: "string",
      required: false,
      description: "Custom Android package name (e.g. com.example.app)"
    },
    version_name: {
      type: "string",
      required: false,
      description: "Version name (default: 1.0.0)"
    },
    version_code: {
      type: "number",
      required: false,
      description: "Version code (default: 1)"
    }
  },
  execute: async (req) => {
    const websiteUrl = req.query.url || req.body?.url;
    const appName = req.query.name || req.body?.name;
    const iconUrl = req.query.icon_url || req.body?.icon_url;
    const customPackage = req.query.package_name || req.body?.package_name;
    const versionName = req.query.version_name || req.body?.version_name || "1.0.0";
    const versionCode = req.query.version_code || req.body?.version_code || 1;

    if (!websiteUrl) {
      throw new Error("Parameter 'url' wajib disertakan");
    }

    if (!appName) {
      throw new Error("Parameter 'name' wajib disertakan");
    }

    const iconBlob = await getIconBlob(iconUrl, websiteUrl);
    const packageName = customPackage || generatePackageName(appName);

    const form = new FormData();
    form.append("websiteUrl", websiteUrl);
    form.append("appName", appName);
    form.append("icon", iconBlob, "icon.png");
    form.append("packageName", packageName);
    form.append("versionName", String(versionName));
    form.append("versionCode", String(versionCode));

    const response = await safeFetch(`${BASE_URL}/api/build-apk`, {
      method: "POST",
      body: form,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": BASE_URL,
        "Referer": `${BASE_URL}/`
      }
    }, 120000);

    if (!response.ok) {
      throw new Error(`Server builder gagal memproses permintaan (Status: ${response.status})`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || "Gagal membangun file APK");
    }

    return {
      app_name: appName,
      package_name: packageName,
      version: `${versionName} (${versionCode})`,
      website_url: websiteUrl,
      download_url: `${BASE_URL}${data.downloadUrl}`,
      file_name: data.fileName || `${appName}.apk`,
      file_size: data.fileSize || null
    };
  }
};