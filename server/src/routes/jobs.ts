import { Router } from "express";
import { jobQueue } from "../jobQueue.js";

const router = Router();

// Get job status
router.get("/:id", (req, res) => {
  const job = jobQueue.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json(job);
});

export default router;
