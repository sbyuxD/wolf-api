import { safeFetch } from "../../function.js";

const searchPinterest = async (query) => {
  const targetUrl = `https://www.pinterest.com/resource/BaseSearchResource/get/?data=${encodeURIComponent(JSON.stringify({ options: { query } }))}`;
  
  const response = await safeFetch(targetUrl, {
    method: "HEAD",
    headers: {
      "screen-dpr": "4",
      "x-pinterest-pws-handler": "www/search/[scope].js"
    }
  }, 15000);

  const linkHeader = response.headers.get("link") || "";
  return [...linkHeader.matchAll(/<(https:\/\/i\.pinimg\.com\/[^>]+)>/g)].map((m) => m[1]);
};

export default {
  name: "Pinterest Search",
  category: "search",
  description: "Search and retrieve image URLs from Pinterest",
  method: ["GET", "POST"],
  params: {
    query: {
      type: "string",
      required: true,
      description: "Search keyword"
    },
    limit: {
      type: "number",
      required: false,
      description: "Maximum images to return (default 5, max 20)"
    }
  },
  execute: async (req) => {
    const query = req.query.query || req.body?.query;
    const rawLimit = req.query.limit || req.body?.limit || 5;

    if (!query) {
      throw new Error("Parameter 'query' wajib disertakan");
    }

    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 5, 1), 20);
    const urls = await searchPinterest(query);

    if (!urls.length) {
      throw new Error("Tidak ada gambar ditemukan untuk query tersebut");
    }

    const results = urls.slice(0, limit);

    return {
      query,
      count: results.length,
      results
    };
  }
};