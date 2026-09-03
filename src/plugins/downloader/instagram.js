import crypto from "node:crypto";
import { safeFetch } from "../../function.js";

const USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36";
const SALT_TEXT = "Yes, absolutely! Our website is fully responsive and optimized for all devices.";
const TS_DELTA = 7124;
const BASE_URL = "https://instashadow.com/api";
const MEDIA_BASE = "https://instashadow.com";

const KEY_MAP = {
  iu: "image_url",
  vu: "video_url",
  hu: "thumbnail_url",
  vhu: "video_thumbnail_url",
  lc: "like_count",
  cc: "comment_count",
  pd: "publish_date",
  c: "caption",
  id: "media_id",
  shortcode: "shortcode",
  om: "other_media",
  fn: "full_name",
  pp: "profile_pic",
  hpp: "hd_profile_pic",
  frc: "follower_count",
  fgc: "following_count",
  mc: "media_count",
  b: "biography"
};

const decId = (enc) => {
  try {
    if (!enc) return "";
    return decodeURIComponent(enc).split("").reverse().join("");
  } catch {
    return enc || "";
  }
};

const getMed = (id) => {
  return id ? `${MEDIA_BASE}/media?id=${encodeURIComponent(id)}` : null;
};

const cleanObject = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => cleanObject(item));

  const cleanItem = {};
  for (const key of Object.keys(obj)) {
    const newKey = KEY_MAP[key] || key;
    const val = obj[key];

    if (["iu", "vu", "hu", "vhu", "pp", "hpp"].includes(key) && typeof val === "string") {
      const decryptedId = decId(val);
      cleanItem[newKey] = getMed(decryptedId);
    } else if (typeof val === "object" && val !== null) {
      cleanItem[newKey] = cleanObject(val);
    } else {
      cleanItem[newKey] = val ?? null;
    }
  }
  return cleanItem;
};

const proc = (res) => {
  try {
    const data = res || {};
    const targetKey = ["r", "p", "s", "u"].find((k) => k in data);
    if (!targetKey) return data;
    if (targetKey === "u" && !Array.isArray(data[targetKey])) {
      return { profile: cleanObject(data.u) };
    }
    const formattedList = cleanObject(data[targetKey]);
    if (targetKey === "s" && data.u) {
      return { profile: cleanObject(data.u), stories: formattedList };
    }
    return formattedList;
  } catch {
    return [];
  }
};

const parseUrl = (url) => {
  const str = url || "";
  if (/instagram\.com\/reel\//.test(str)) return { ep: "reels", pl: { _ei: str } };
  if (/instagram\.com\/p\//.test(str)) return { ep: "posts", pl: { _u: str } };
  const storyMatch = str.match(/instagram\.com\/stories\/([^/]+)/);
  if (storyMatch) return { ep: "stories", pl: { _u: storyMatch[1] } };
  const userMatch = str.match(/instagram\.com\/([^/?]+)/);
  if (userMatch) return { ep: "posts", pl: { _u: userMatch[1] } };
  return { ep: "posts", pl: { _u: str } };
};

const signPayload = async (pl, t) => {
  try {
    const loadedAt = t ?? Date.now() - TS_DELTA;
    const U = JSON.stringify(pl || {}) + USER_AGENT;
    const p = SALT_TEXT + loadedAt;
    const xored = U.split("").map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ p.charCodeAt(i % p.length))).join("");
    const enc = new TextEncoder().encode(xored);
    const hashBuf = await crypto.webcrypto.subtle.digest("SHA-256", enc);
    const bytes = Array.from(new Uint8Array(hashBuf));
    const b64 = btoa(String.fromCharCode(...bytes));
    const _s = b64.replace(/\+/g, "*").replace(/\//g, "~").replace(/=/g, "!");
    return { ...(pl || {}), _s, _s1: loadedAt + TS_DELTA };
  } catch {
    return { ...(pl || {}), _s: "", _s1: Date.now() };
  }
};

const downloadInstagram = async (url) => {
  const { ep, pl } = parseUrl(url);
  const signedBody = await signPayload(pl);

  const response = await safeFetch(`${BASE_URL}/${ep}`, {
    method: "POST",
    headers: {
      "Accept": "*/*",
      "Accept-Language": "id-ID",
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "Origin": "https://instashadow.com",
      "Referer": "https://instashadow.com/en",
      "User-Agent": USER_AGENT
    },
    body: JSON.stringify(signedBody)
  }, 30000);

  if (!response.ok) {
    throw new Error(`Gagal mengambil data dari server Instagram (Status: ${response.status})`);
  }

  const json = await response.json();
  const processed = proc(json);
  return Array.isArray(processed) ? processed : processed?.profile ? processed : [];
};

export default {
  name: "Instagram Downloader",
  category: "downloader",
  description: "Download reels, posts, stories, and profile media from Instagram",
  method: ["GET", "POST"],
  params: {
    url: {
      type: "string",
      required: true,
      description: "Instagram URL (reels, post, story, or username)"
    }
  },
  execute: async (req) => {
    const inputUrl = req.query.url || req.body?.url;

    if (!inputUrl || !inputUrl.includes("instagram.com")) {
      throw new Error("Parameter 'url' harus berupa link Instagram yang valid");
    }

    const data = await downloadInstagram(inputUrl);

    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error("Media tidak ditemukan atau konten bersifat privat");
    }

    return {
      url: inputUrl,
      media: data
    };
  }
};