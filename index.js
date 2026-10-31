import app from "./src/app.js";
import { ensurePluginsLoaded, watchPlugins } from "./src/function.js";

const PORT = Number(process.env.PORT) || 3000;

await ensurePluginsLoaded();
watchPlugins();

app.listen(PORT, () => {
  console.log(`WolfApi running on http://localhost:${PORT}`);
});