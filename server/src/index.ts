import express from "express";
import cors from "cors";
import { PORT, GITHUB_TOKEN } from "./config";
import { router } from "./routes";
import { startCron } from "./cache";

if (!GITHUB_TOKEN) {
  console.error("[Cache] GITHUB_TOKEN is required. Set it via environment variable.");
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json());
app.use(router);

app.listen(PORT, () => {
  console.log(`[Cache] makeit-cache running on port ${PORT}`);
  startCron();
});
