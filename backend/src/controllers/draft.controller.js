import mongoose from "mongoose";
import Message from "../models/message.model.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { checkDraftText } from "../lib/aiToolHelpers.js";

// Drafts written by the AI assistant live on its reply message, whose
// receiverId is the user they were written for. These endpoints are the only
// way a draft is ever delivered: the assistant itself has no send tool.

function findOwnedDraft(userId, draftId, status) {
    return { receiverId: userId, drafts: { $elemMatch: { _id: draftId, status } } };
}

/**
 * POST /api/messages/drafts/:draftId/send   body: { text? }
 * Sends a pending draft as the signed-in user, optionally with edited text.
 */
export const sendDraft = async (req, res) => {
    const { draftId } = req.params;
    const userId = req.user._id;
    if (!mongoose.isValidObjectId(draftId)) {
        return res.status(400).json({ message: "Invalid draft id" });
    }

    let editedText = null;
    if (req.body?.text !== undefined) {
        const textError = checkDraftText(req.body.text);
        if (textError) return res.status(400).json({ message: textError });
        editedText = req.body.text.trim();
    }

    try {
        // 1. Atomically claim the draft: pending -> sending. If two requests race
        //    (a double click, a retried request), only one matches; the other gets 409.
        //    The filter also checks the draft belongs to this user.
        const reply = await Message.findOneAndUpdate(
            findOwnedDraft(userId, draftId, "pending"),
            { $set: { "drafts.$.status": "sending", ...(editedText ? { "drafts.$.text": editedText } : {}) } },
            { new: true },
        );
        if (!reply) {
            return res.status(409).json({ message: "This draft was already sent or cancelled." });
        }
        const draft = reply.drafts.id(draftId);

        try {
            // 2. Deliver it exactly like a message the user typed.
            const sent = await Message.create({ senderId: userId, receiverId: draft.recipientId, text: draft.text });
            // To the recipient, and to the user's tabs that have that chat open.
            for (const id of [draft.recipientId, userId]) {
                const socketId = getReceiverSocketId(id);
                if (socketId) io.to(socketId).emit("newMessage", sent);
            }

            // 3. Record the outcome on the assistant's reply.
            draft.status = "sent";
            draft.sentMessageId = sent._id;
            await reply.save();
            return res.status(200).json({ assistantMessage: reply, sentMessage: sent });
        } catch (error) {
            // Delivery failed: put the draft back so the user can try again.
            draft.status = "pending";
            await reply.save();
            throw error;
        }
    } catch (error) {
        console.log("Error in sendDraft controller:", error.message);
        return res.status(500).json({ message: "Couldn't send the message. Please try again." });
    }
};

/** POST /api/messages/drafts/:draftId/cancel */
export const cancelDraft = async (req, res) => {
    const { draftId } = req.params;
    if (!mongoose.isValidObjectId(draftId)) {
        return res.status(400).json({ message: "Invalid draft id" });
    }
    try {
        const reply = await Message.findOneAndUpdate(
            findOwnedDraft(req.user._id, draftId, "pending"),
            { $set: { "drafts.$.status": "cancelled" } },
            { new: true },
        );
        if (!reply) {
            return res.status(409).json({ message: "This draft was already sent or cancelled." });
        }
        return res.status(200).json({ assistantMessage: reply });
    } catch (error) {
        console.log("Error in cancelDraft controller:", error.message);
        return res.status(500).json({ message: "Couldn't cancel the draft. Please try again." });
    }
};
