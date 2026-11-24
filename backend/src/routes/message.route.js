import express from "express"
import { protectRoute } from "../middleware/auth.middleware.js";
import { sendMessage, getUsersForSidebar, getMessages } from "../controllers/message.controller.js";
import { sendDraft, cancelDraft } from "../controllers/draft.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar)
router.get("/:id",protectRoute,  getMessages);

router.post("/send/:id", protectRoute, sendMessage);

// Drafts written by the AI assistant: only the user can send or cancel them.
router.post("/drafts/:draftId/send", protectRoute, sendDraft);
router.post("/drafts/:draftId/cancel", protectRoute, cancelDraft);

export default router;



