import { safeFetch } from "../../function.js";

let cachedClientId = null;
let cachedTime = 0;

const scrapeClientId = async () => {
  const res = await safeFetch("https://soundcloud.com", {}, 15000);
  if (!res.ok) {
    throw new Error("Gagal mengakses halaman utama SoundCloud");
  }
  const html = await res.text();

  const scriptUrls = [];
  const scriptRegex = /<script\s+[^>]*src="([^"]+)"/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    scriptUrls.push(match[1]);
  }

  for (const url of scriptUrls.reverse()) {
    try {
      const scriptRes = await safeFetch(url, {}, 10000);
      if (!scriptRes.ok) continue;
      const code = await scriptRes.text();

      const clientIdMatch =
        code.match(/client_id[:=]"([a-zA-Z0-9]{32})"/i) ||
        code.match(/client_id=([a-zA-Z0-9]{32})/i) ||
        code.match(/client_id:"([a-zA-Z0-9]{32})"/i);

      if (clientIdMatch) {
        cachedClientId = clientIdMatch[1];
        cachedTime = Date.now();
        return cachedClientId;
      }
    } catch {}
  }

  throw new Error("Gagal menemukan client_id SoundCloud");
};

const getClientId = async (force = false) => {
  if (!force && cachedClientId && Date.now() - cachedTime < 3600000) {
    return cachedClientId;
  }
  return await scrapeClientId();
};

const callApi = async (urlBuilder) => {
  let clientId = await getClientId();
  try {
    const res = await safeFetch(urlBuilder(clientId), {}, 15000);
    if (res.status === 401) {
      clientId = await getClientId(true);
      const retry = await safeFetch(urlBuilder(clientId), {}, 15000);
      if (!retry.ok) throw new Error(`Status API error: ${retry.status}`);
      return await retry.json();
    }
    if (!res.ok) throw new Error(`Status API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    clientId = await getClientId(true);
    const retry = await safeFetch(urlBuilder(clientId), {}, 15000);
    if (!retry.ok) throw new Error(`Status API error: ${retry.status}`);
    return await retry.json();
  }
};

const getHighResCover = (url) => {
  if (!url) return "https://soundcloud.com/images/default_album.png";
  return url.replace("-large.", "-t500x500.");
};

const getDownloadUrl = async (media, clientId) => {
  if (!media || !media.transcodings) return null;

  const progressive = media.transcodings.find((t) => t.format.protocol === "progressive");
  const hls = media.transcodings.find((t) => t.format.protocol === "hls");
  const target = progressive || hls;

  if (!target) return null;

  const cid = clientId || (await getClientId());
  const res = await safeFetch(`${target.url}?client_id=${cid}`, {}, 10000);
  if (!res.ok) return null;

  const data = await res.json();
  return {
    stream_url: data.url || null,
    protocol: target.format.protocol,
    mime_type: target.format.mime_type
  };
};

export default {
  name: "SoundCloud Search & Downloader",
  category: "search",
  description: "Search tracks or extract direct stream URL from SoundCloud",
  method: ["GET", "POST"],
  params: {
    query: {
      type: "string",
      required: true,
      description: "Search keyword or direct SoundCloud track URL"
    }
  },
  execute: async (req) => {
    const query = req.query.query || req.body?.query;

    if (!query) {
      throw new Error("Parameter 'query' wajib disertakan");
    }

    const isUrl = query.startsWith("http://") || query.startsWith("https://");

    if (isUrl) {
      const trackInfo = await callApi(
        (clientId) => `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(query)}&client_id=${clientId}`
      );

      const clientId = await getClientId();

      if (trackInfo.kind === "playlist") {
        const tracks = (trackInfo.tracks || []).map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.user?.username || "Unknown Artist",
          duration: `${Math.floor((t.duration || 0) / 1000)}s`,
          cover: getHighResCover(t.artwork_url || trackInfo.artwork_url),
          url: t.permalink_url
        }));

        return {
          type: "playlist",
          title: trackInfo.title,
          count: tracks.length,
          tracks
        };
      }

      const stream = await getDownloadUrl(trackInfo.media, clientId);

      return {
        type: "track",
        id: trackInfo.id,
        title: trackInfo.title,
        artist: trackInfo.user?.username || "Unknown Artist",
        duration: `${Math.floor((trackInfo.duration || 0) / 1000)}s`,
        cover: getHighResCover(trackInfo.artwork_url),
        url: trackInfo.permalink_url,
        download: stream
      };
    }

    const searchResult = await callApi(
      (clientId) => `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=15`
    );

    const tracks = (searchResult.collection || []).map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.user?.username || "Unknown Artist",
      duration: `${Math.floor((t.duration || 0) / 1000)}s`,
      cover: getHighResCover(t.artwork_url),
      url: t.permalink_url
    }));

    if (!tracks.length) {
      throw new Error("Tidak ada lagu ditemukan untuk query tersebut");
    }

    return {
      query,
      count: tracks.length,
      results: tracks
    };
  }
};