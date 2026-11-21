import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import phoneRoutes from "./routes/phone.js";

dotenv.config();
const app = express();
const port = Number(process.env.PORT || 8787);
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "http://localhost:8888" }));
app.use(express.json({ limit: "32kb" }));
app.use("/api/phone", phoneRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "PHONE INTEL API", version: "1.0.0", scope: "public-data-only" });
});

// Foundation endpoint only. Public-source connectors will be added after source review,
// terms-of-use review, evidence model, and privacy controls are implemented.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan internal." });
});
app.listen(port, () => console.log(`PHONE INTEL API listening on ${port}`));
