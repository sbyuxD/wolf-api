import crypto from "node:crypto";
import { safeFetch } from "../../function.js";

let cachedSession = null;

const createSession = async () => {
  const androidId = crypto.randomBytes(16).toString("hex");
  const deviceId = crypto
    .createHash("sha256")
    .update(`bypasstools:${androidId}`)
    .digest("hex");

  const initRes = await safeFetch("https://bypass.tools/api/mobile/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId,
      platform: "android",
      appVersion: "1.0.0"
    })
  }, 15000);

  if (!initRes.ok) {
    throw new Error(`Inisialisasi session gagal dengan status: ${initRes.status}`);
  }

  const initData = await initRes.json();
  if (!initData.sessionToken) {
    throw new Error("Token session tidak ditemukan pada response server");
  }

  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  cachedSession = { deviceId, sessionToken: initData.sessionToken, expiresAt };
  return cachedSession;
};

const getSession = async (force = false) => {
  if (!force && cachedSession && Date.now() < cachedSession.expiresAt) {
    return cachedSession;
  }
  return await createSession();
};

const requestBypass = async (url, session) => {
  const res = await safeFetch("https://bypass.tools/api/mobile/bypass", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.sessionToken}`,
      "X-Device-ID": session.deviceId
    },
    body: JSON.stringify({ url, forceRefresh: false })
  }, 20000);

  if (!res.ok) {
    throw new Error(`Permintaan bypass gagal (${res.status})`);
  }

  return await res.json();
};

const executeBypass = async (url) => {
  let session = await getSession();
  try {
    return await requestBypass(url, session);
  } catch (err) {
    session = await getSession(true);
    return await requestBypass(url, session);
  }
};

export default {
  name: "Linkvertise & Ad-Link Bypasser",
  category: "tools",
  description: "Bypass shorteners, countdowns, and ad-link redirects",
  method: ["GET", "POST"],
  params: {
    url: {
      type: "string",
      required: true,
      description: "Shortlink / ad-link URL to bypass"
    }
  },
  execute: async (req) => {
    const inputUrl = req.query.url || req.body?.url;

    if (!inputUrl) {
      throw new Error("Parameter 'url' wajib disertakan");
    }

    const isUrl = inputUrl.startsWith("http://") || inputUrl.startsWith("https://");
    if (!isUrl) {
      throw new Error("Format URL tidak valid (harus diawali http:// atau https://)");
    }

    const data = await executeBypass(inputUrl);

    if (data.status !== "success" || !data.result) {
      throw new Error(data.message || data.error || "Gagal melakukan bypass pada link tersebut");
    }

    return {
      original_url: inputUrl,
      destination_url: data.result,
      cached: Boolean(data.cached),
      access_granted: Boolean(data.has_access),
      rate_limit: data.rate_limit || null
    };
  }
};