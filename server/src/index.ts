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

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
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
  const clientDist = path.resolve(import.meta.dir, "../../client-dist");
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
