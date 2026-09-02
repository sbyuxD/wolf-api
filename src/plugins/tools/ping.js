export default {
  name: "Server Status",
  description: "Check server status and memory usage",
  method: ["GET"],
  execute: async () => {
    return {
      uptime: `${process.uptime().toFixed(0)}s`,
      memory: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
      timestamp: new Date().toISOString()
    };
  }
};