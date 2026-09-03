import { safeFetch } from "../../function.js";

const MEDIA_REGEX = /https?:\/\/(www\.)?mediafire\.com\/(file|folder)\/(\w+)/i;

const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export default {
  name: "MediaFire Downloader",
  category: "downloader",
  description: "Extract direct download URL and metadata from MediaFire",
  method: ["GET", "POST"],
  params: {
    url: {
      type: "string",
      required: true,
      description: "MediaFire file URL (contoh: https://www.mediafire.com/file/xxxx/name)"
    }
  },
  execute: async (req, res, { input }) => {
    const { url } = input;

    const match = MEDIA_REGEX.exec(url);
    if (!match) {
      throw new Error("Link MediaFire tidak valid! Pastikan format URL benar.");
    }

    const id = match[3];

    const response = await safeFetch(url, {}, 15000);
    if (!response.ok) {
      throw new Error(`Gagal membuka halaman MediaFire (Status: ${response.status})`);
    }

    const html = await response.text();

    const downloadMatch =
      html.match(/id=["']downloadButton["'][^>]*href=["']([^"']+)["']/i) ||
      html.match(/href=["']([^"']+)["'][^>]*id=["']downloadButton["']/i) ||
      html.match(/aria-label=["']Download file["'][^>]*href=["']([^"']+)["']/i) ||
      html.match(/href=["']([^"']+)["'][^>]*aria-label=["']Download file["']/i);

    if (!downloadMatch || !downloadMatch[1]) {
      throw new Error("Gagal mengekstrak direct link unduhan dari MediaFire.");
    }

    const downloadUrl = downloadMatch[1];

    const infoResponse = await safeFetch(
      `https://www.mediafire.com/api/1.5/file/get_info.php?response_format=json&quick_key=${id}`,
      {},
      15000
    );

    if (!infoResponse.ok) {
      throw new Error("Gagal menghubungi API MediaFire.");
    }

    const json = await infoResponse.json();

    if (json.response?.result !== "Success" || !json.response?.file_info) {
      throw new Error("Gagal mengambil informasi metadata file.");
    }

    const info = json.response.file_info;
    const size = parseInt(info.size, 10) || 0;
    const ext = (info.filename || "").split(".").pop();

    return {
      filename: info.filename,
      extension: ext,
      size,
      size_readable: formatBytes(size),
      download_url: downloadUrl,
      filetype: info.filetype,
      mimetype: info.mimetype || `application/${ext}`,
      privacy: info.privacy,
      owner_name: info.owner_name
    };
  }
};