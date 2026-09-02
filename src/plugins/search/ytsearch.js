import yts from "yt-search";

export default {
  name: "YouTube Search",
  category: "search",
  description: "Search and retrieve video metadata from YouTube",
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
      description: "Maximum results to return (default 10, max 20)"
    }
  },
  execute: async (req) => {
    const query = req.query.query || req.body?.query;
    const rawLimit = req.query.limit || req.body?.limit || 10;

    if (!query) {
      throw new Error("Parameter 'query' wajib disertakan");
    }

    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 10, 1), 20);
    const searchResult = await yts(query);
    const videos = searchResult.videos || [];

    if (!videos.length) {
      throw new Error("Tidak ada video ditemukan untuk query tersebut");
    }

    const results = videos.slice(0, limit).map((v) => ({
      title: v.title,
      video_id: v.videoId,
      url: v.url,
      duration: v.timestamp || "",
      seconds: v.seconds,
      views: v.views,
      uploaded: v.ago || "",
      author: {
        name: v.author?.name || "Unknown",
        url: v.author?.url || ""
      },
      thumbnail: v.thumbnail || v.image || ""
    }));

    return {
      query,
      count: results.length,
      results
    };
  }
};