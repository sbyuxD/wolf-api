import { safeFetch } from "../../function.js";

const GENIUS_SEARCH_API = "https://genius.com/api/search/multi";

const searchSongs = async (query) => {
  const url = `${GENIUS_SEARCH_API}?q=${encodeURIComponent(query)}`;
  const response = await safeFetch(url, {}, 10000);

  if (!response.ok) {
    throw new Error(`Gagal mencari lagu di Genius (${response.status})`);
  }

  const data = await response.json();
  const sections = data?.response?.sections || [];
  const songs = [];
  const seenIds = new Set();

  for (const section of sections) {
    const hits = section.hits || [];
    for (const hit of hits) {
      const result = hit.result || {};
      const hitType = hit.type;
      const resultType = result._type;

      if (hitType === "song" || resultType === "song") {
        const songId = result.id;
        if (songId && !seenIds.has(songId)) {
          seenIds.add(songId);
          songs.push({
            id: songId,
            title: result.title,
            artist: result.artist_names,
            path: result.path,
            image: result.header_image_url || result.song_art_image_url || "",
            release_date: result.release_date_for_display || "-"
          });
        }
      }
    }
  }

  return songs;
};

const extractLyrics = (html) => {
  const containerRegex = /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
  const parts = [];
  let match;

  while ((match = containerRegex.exec(html)) !== null) {
    const rawContent = match[1]
      .replace(/<div[^>]*data-exclude-from-selection="true"[^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    const cleaned = rawContent.trim();
    if (cleaned) {
      parts.push(cleaned);
    }
  }

  return parts.join("\n\n").trim();
};

const fetchLyrics = async (songPath) => {
  const url = songPath.startsWith("http") ? songPath : `https://genius.com${songPath}`;
  const response = await safeFetch(url, {}, 10000);

  if (!response.ok) {
    throw new Error(`Gagal mengunduh halaman lirik (${response.status})`);
  }

  const html = await response.text();
  const lyrics = extractLyrics(html);

  if (!lyrics) {
    throw new Error("Lirik lagu tidak ditemukan pada halaman ini");
  }

  return lyrics;
};

export default {
  name: "Lyrics Search",
  category: "search",
  description: "Mencari lirik lagu dan metadata musik lengkap dari Genius",
  method: ["GET", "POST"],
  params: {
    query: {
      type: "string",
      required: true,
      description: "Judul lagu atau nama penyanyi"
    },
    index: {
      type: "number",
      required: false,
      description: "Pilihan nomor indeks lagu dari hasil pencarian (default: 0)"
    }
  },
  execute: async (req, res, { input }) => {
    const { query, index } = input;

    if (!query) {
      throw new Error("Parameter 'query' wajib disertakan");
    }

    const songs = await searchSongs(query);

    if (!songs.length) {
      throw new Error("Lagu tidak ditemukan untuk kata kunci tersebut");
    }

    const targetIndex = typeof index === "number" && index >= 0 && index < songs.length ? index : 0;
    const selected = songs[targetIndex];
    const lyrics = await fetchLyrics(selected.path);

    const related = songs.slice(0, 5).map((song, i) => ({
      index: i,
      title: song.title,
      artist: song.artist,
      release_date: song.release_date
    }));

    return {
      title: selected.title,
      artist: selected.artist,
      release_date: selected.release_date,
      thumbnail: selected.image,
      genius_url: `https://genius.com${selected.path}`,
      lyrics,
      total_found: songs.length,
      related_songs: related
    };
  }
};