import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
const result = dotenv.config({ path: envPath });
if (result.error) {
    console.warn("[env] Could not load .env:", result.error.message);
}
else if (result.parsed) {
    console.log("[env] Loaded .env from", envPath);
}
//# sourceMappingURL=load-env.js.map