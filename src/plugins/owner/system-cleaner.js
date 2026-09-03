import { purgeAllCache } from "../../function.js";

export default {
  name: "System Memory Cleaner",
  category: "owner",
  description: "Membersihkan cache memory & mengosongkan heap RAM (Khusus Owner)",
  method: ["POST", "GET"],
  owner: true,
  params: {},
  execute: async (req, res, { user }) => {
    const purged = purgeAllCache();

    if (global.gc) {
      global.gc();
    }

    return {
      message: "Proses pembersihan memori sistem selesai",
      authorized_user: user.username,
      purged_cache_items: purged,
      current_memory: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
      timestamp: new Date().toISOString()
    };
  }
};