import app from "./src/app.js";
import { watchPlugins, loadAllPlugins } from "./src/utils/loader.js";

const PORT = process.env.PORT || 3000;

await loadAllPlugins();
watchPlugins();

app.listen(PORT, () => {
  console.log(`Server ready at http://localhost:${PORT}`);
});