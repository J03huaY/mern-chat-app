import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { deleteMemory, dismissMemoryProposal, listMemories, saveMemoryProposal } from "../controllers/memory.controller.js";

const router = express.Router();

// What the AI assistant remembers about the signed-in user.
router.get("/", protectRoute, listMemories);
router.delete("/:memoryId", protectRoute, deleteMemory);

// Memories the assistant suggested: only the user can save or dismiss them.
router.post("/proposals/:proposalId/save", protectRoute, saveMemoryProposal);
router.post("/proposals/:proposalId/dismiss", protectRoute, dismissMemoryProposal);

export default router;
