import { safeFetch } from "../../function.js";

const BASE_URL = "https://a.ymcdn.org/api/v1";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Referer": "https://id.ytmp3.mobi/"
};

const extractVideoId = (url) => {
  let match = null;
  if (url.includes("youtube.com/shorts/") || url.includes("youtu.be/")) {
    match = /\/([a-zA-Z0-9\-_]{11})/.exec(url);
  } else if (url.includes("youtube.com")) {
    match = /v=([a-zA-Z0-9\-_]{11})/.exec(url);
  }
  return match ? match[1] : null;
};

const initSession = async () => {
  const url = `${BASE_URL}/init?p=y&23=1llum1n471&_=${Math.random()}`;
  const response = await safeFetch(url, { headers: HEADERS }, 15000);
  if (!response.ok) throw new Error("Gagal menginisialisasi sesi konversi");
  return response.json();
};

const startConversion = async (convertURL, videoId, format) => {
  const url = `${convertURL}&v=${videoId}&f=${format}&_=${Math.random()}`;
  const response = await safeFetch(url, { headers: HEADERS }, 15000);
  if (!response.ok) throw new Error("Gagal memulai konversi video");
  return response.json();
};

const checkProgress = async (progressURL, maxRetries = 30) => {
  let retries = 0;

  while (retries < maxRetries) {
    const response = await safeFetch(progressURL, { headers: HEADERS }, 10000);
    if (!response.ok) throw new Error("Gagal memeriksa status proses konversi");

    const data = await response.json();

    if (data.error !== 0) {
      throw new Error(`Terjadi error pada konversi (Error Code: ${data.error})`);
    }

    if (data.progress === 3) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    retries++;
  }

  throw new Error("Waktu proses konversi melebihi batas (Timeout)");
};

export default {
  name: "YouTube Downloader",
  category: "downloader",
  description: "Download YouTube video as MP3 audio or MP4 video",
  method: ["GET", "POST"],
  params: {
    url: {
      type: "string",
      required: true,
      description: "YouTube video or shorts URL"
    },
    format: {
      type: "string",
      required: false,
      description: "Output format: mp3 or mp4 (default: mp3)"
    }
  },
  execute: async (req) => {
    const url = req.query.url || req.body?.url;
    const rawFormat = (req.query.format || req.body?.format || "mp3").toLowerCase();
    const format = ["mp3", "mp4"].includes(rawFormat) ? rawFormat : "mp3";

    if (!url) {
      throw new Error("Parameter 'url' wajib disertakan");
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error("URL YouTube tidak valid atau Video ID tidak ditemukan");
    }

    const startTime = Date.now();

    const initData = await initSession();
    if (initData.error !== 0) {
      throw new Error(`Inisialisasi gagal dengan kode: ${initData.error}`);
    }

    const convertData = await startConversion(initData.convertURL, videoId, format);
    if (convertData.error !== 0) {
      throw new Error(`Konversi gagal dengan kode: ${convertData.error}`);
    }

    await checkProgress(convertData.progressURL);

    const elapsed = `${((Date.now() - startTime) / 1000).toFixed(2)}s`;

    return {
      video_id: videoId,
      title: convertData.title || "YouTube Media",
      format,
      download_url: convertData.downloadURL,
      process_time: elapsed
    };
  }
};