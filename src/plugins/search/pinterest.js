import { safeFetch } from "../../function.js";

const extractFromResourceJson = async (query, bookmarkSignal) => {
  const resourceData = {
    options: {
      query,
      scope: "pins"
    },
    context: {}
  };

  const targetUrl = `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent(`/search/pins/?q=${query}`)}&data=${encodeURIComponent(JSON.stringify(resourceData))}`;

  const response = await safeFetch(
    targetUrl,
    {
      method: "GET",
      signal: bookmarkSignal,
      headers: {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "X-Pinterest-AppState": "active",
        "X-Pinterest-PWS-Handler": "www/search/[scope].js",
        "Referer": "https://www.pinterest.com/"
      }
    },
    15000
  );

  const collected = new Set();

  const linkHeader = response.headers.get("link") || "";
  for (const match of linkHeader.matchAll(/<(https:\/\/i\.pinimg\.com\/[^>]+)>/g)) {
    collected.add(match[1]);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => null);
    const items = json?.resource_response?.data?.results || [];
    for (const item of items) {
      const imageUrl =
        item?.images?.orig?.url ||
        item?.images?.["736x"]?.url ||
        item?.images?.["474x"]?.url;
      if (imageUrl) {
        collected.add(imageUrl);
      }
    }
  } else {
    const rawText = await response.text().catch(() => "");
    for (const match of rawText.matchAll(/https:\/\/i\.pinimg\.com\/(?:originals|736x|564x)\/[a-zA-Z0-9/_.-]+\.(?:jpg|png|webp)/g)) {
      collected.add(match[0]);
    }
  }

  return [...collected];
};

const extractFromSearchPage = async (query, signal) => {
  const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
  const response = await safeFetch(
    searchUrl,
    {
      method: "GET",
      signal,
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    },
    15000
  );

  const collected = new Set();
  const linkHeader = response.headers.get("link") || "";
  for (const match of linkHeader.matchAll(/<(https:\/\/i\.pinimg\.com\/[^>]+)>/g)) {
    collected.add(match[1]);
  }

  const html = await response.text().catch(() => "");
  for (const match of html.matchAll(/https:\/\/i\.pinimg\.com\/(?:originals|736x|564x|474x)\/[a-zA-Z0-9/_.-]+\.(?:jpg|png|webp)/g)) {
    collected.add(match[0]);
  }

  return [...collected];
};

const run = async (req, res, { input, signal }) => {
  const query = input.query;
  const limit = input.limit || 5;

  let urls = await extractFromResourceJson(query, signal).catch(() => []);
  if (urls.length === 0) {
    urls = await extractFromSearchPage(query, signal);
  }

  if (urls.length === 0) {
    throw new Error("Tidak ada gambar ditemukan untuk kata kunci tersebut");
  }

  const results = urls.slice(0, limit);

  return {
    query,
    count: results.length,
    results
  };
};

const plugin = {
  run,
  name: "pinterest",
  categories: ["search"],
  description: "Cari dan ambil koleksi gambar resolusi tinggi dari Pinterest",
  method: ["GET", "POST"],
  params: {
    query: {
      type: "string",
      required: true,
      description: "Kata kunci pencarian gambar"
    },
    limit: {
      type: "number",
      required: false,
      default: 5,
      min: 1,
      max: 20,
      description: "Batas jumlah gambar (1-20)"
    }
  },
  cache: 120,
  timeout: 20000
};

export default plugin;