import crypto from "node:crypto";
import { safeFetch } from "../../function.js";

const API = "https://t2v.aritek.app";
const SIGN = "68d6165b72a7f2d8d17b0dc6fe9691abdf77c583";
const VERSION_CODE = 85;
const UA = "okhttp/4.12.0";

let memoryDeviceId = null;
let cachedToken = null;
let tokenExpires = 0;

const getDeviceId = () => {
  if (!memoryDeviceId) {
    memoryDeviceId = "sniff_" + crypto.randomBytes(8).toString("hex");
  }
  return memoryDeviceId;
};

const apiFetch = async (url, options = {}, deviceId, token, signal) => {
  const headers = {
    "User-Agent": UA,
    "versionCode": String(VERSION_CODE),
    "Ctry-Target": "others",
    "Device-Id": deviceId,
    "Sign": SIGN,
    ...(options.headers || {})
  };

  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }

  const resp = await safeFetch(url, { ...options, headers, signal }, 60000);
  if (!resp.ok) {
    throw new Error("HTTP " + resp.status);
  }
  return resp.json();
};

const getToken = async (deviceId) => {
  if (cachedToken && Date.now() < tokenExpires) {
    return cachedToken;
  }

  const data = await apiFetch(API + "/api/v1/user/info", { method: "GET" }, deviceId, null);
  const token = data.data?.token;

  if (!token) {
    throw new Error("Gagal mengambil token sesi");
  }

  cachedToken = token;
  tokenExpires = Date.now() + 3600000;
  return token;
};

const generateVideo = async (prompt, deviceId, token, signal) => {
  const body = {
    prompt,
    versionCode: VERSION_CODE,
    deviceID: deviceId,
    isPremium: 1,
    ctry_target: "others",
    used: [],
    aspect_ratio: "16:9",
    ai_sound: 0
  };

  const res = await apiFetch(
    API + "/api/v3/video/t2v",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    deviceId,
    token,
    signal
  );

  const videoUrl = res.data?.url;
  if (!videoUrl) {
    throw new Error("Gagal membuat video, URL tidak ditemukan");
  }

  return videoUrl;
};

export default {
  name: "Text to Video AI",
  category: "tools",
  description: "Membuat video animasi AI berdasarkan teks prompt",
  method: ["GET", "POST"],
  timeout: 60000,
  params: {
    prompt: {
      type: "string",
      required: true,
      description: "Deskripsi video yang ingin dibuat (Inggris disarankan)"
    }
  },
  execute: async (req, res, { input, signal }) => {
    const { prompt } = input;

    if (!prompt) {
      throw new Error("Parameter 'prompt' wajib disertakan");
    }

    const deviceId = getDeviceId();
    const token = await getToken(deviceId);
    const videoUrl = await generateVideo(prompt, deviceId, token, signal);

    return {
      prompt,
      device_id: deviceId,
      video_url: videoUrl
    };
  }
};