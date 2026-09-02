export default {
  name: "Server Status",
  category: "info",
  description: "Check server latency, uptime, and memory usage",
  method: ["GET"],
  params: {},
  execute: async () => {
    return {
      uptime: `${process.uptime().toFixed(0)}s`,
      memory: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
      timestamp: new Date().toISOString()
    };
  }
};