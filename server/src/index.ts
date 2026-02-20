import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";

// Routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import playlistRoutes from "./routes/playlists/index.js";
import trackRoutes from "./routes/tracks.js";
import artistRoutes from "./routes/artists.js";
import jobRoutes from "./routes/jobs.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";

const corsOrigin = process.env.NODE_ENV === "production"
  ? true // same-origin in production (server serves client)
  : (process.env.CLIENT_URL || "http://localhost:5173");
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// Mount API routes
app.use("/api/auth", authRoutes);
app.use("/api/me", userRoutes);
app.use("/api/playlists", playlistRoutes);
app.use("/api/tracks", trackRoutes);
app.use("/api/artists", artistRoutes);
app.use("/api/jobs", jobRoutes);

// Production: serve client static files
if (process.env.NODE_ENV === "production") {
  // Docker WORKDIR = /app, client build is at /app/client-dist
  const clientDist = path.resolve(process.cwd(), "client-dist");
  console.log(`📂 Serving static files from: ${clientDist}`);

  app.use(express.static(clientDist));

  // SPA fallback — non-API routes get index.html
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api")) {
      res.sendFile(path.join(clientDist, "index.html"));
    }
  });
}

app.listen(Number(PORT), HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});
