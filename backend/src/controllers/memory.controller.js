import mongoose from "mongoose";
import Memory from "../models/memory.model.js";
import Message from "../models/message.model.js";
import { MAX_MEMORIES, checkMemoryText } from "../lib/aiToolHelpers.js";

// Memories the AI assistant keeps about the signed-in user. The assistant can
// only suggest one (a proposal on its reply); these endpoints are the only way a
// memory is created, and only the user can delete one.

function findOwnedProposal(userId, proposalId, status) {
    return { receiverId: userId, memoryProposals: { $elemMatch: { _id: proposalId, status } } };
}

/** GET /api/memories: the user's memories, oldest first. */
export const listMemories = async (req, res) => {
    try {
        const memories = await Memory.find({ userId: req.user._id }).sort({ createdAt: 1 });
        return res.status(200).json(memories);
    } catch (error) {
        console.log("Error in listMemories controller:", error.message);
        return res.status(500).json({ message: "Couldn't load your memories." });
    }
};

/** DELETE /api/memories/:memoryId */
export const deleteMemory = async (req, res) => {
    const { memoryId } = req.params;
    if (!mongoose.isValidObjectId(memoryId)) return res.status(400).json({ message: "Invalid memory id" });
    try {
        // Scoped to the user, so nobody can delete someone else's memory.
        const deleted = await Memory.findOneAndDelete({ _id: memoryId, userId: req.user._id });
        if (!deleted) return res.status(404).json({ message: "Memory not found." });
        return res.status(200).json({ deletedId: memoryId });
    } catch (error) {
        console.log("Error in deleteMemory controller:", error.message);
        return res.status(500).json({ message: "Couldn't delete the memory." });
    }
};

/**
 * POST /api/memories/proposals/:proposalId/save   body: { text? }
 * Saves a memory the assistant suggested, optionally with edited text.
 * A suggestion that replaces an older memory deletes that memory once the new one exists.
 */
export const saveMemoryProposal = async (req, res) => {
    const { proposalId } = req.params;
    const userId = req.user._id;
    if (!mongoose.isValidObjectId(proposalId)) return res.status(400).json({ message: "Invalid suggestion id" });

    let editedText = null;
    if (req.body?.text !== undefined) {
        const textError = checkMemoryText(req.body.text);
        if (textError) return res.status(400).json({ message: textError });
        editedText = req.body.text.trim();
    }

    try {
        // 1. Atomically claim the suggestion: pending -> saving, so a double click saves it once.
        const reply = await Message.findOneAndUpdate(
            findOwnedProposal(userId, proposalId, "pending"),
            { $set: { "memoryProposals.$.status": "saving", ...(editedText ? { "memoryProposals.$.text": editedText } : {}) } },
            { new: true },
        );
        if (!reply) return res.status(409).json({ message: "This suggestion was already saved or dismissed." });
        const proposal = reply.memoryProposals.id(proposalId);

        try {
            // 2. Room for one more, unless it replaces one of the user's memories.
            const replacing = proposal.replaces
                ? await Memory.exists({ _id: proposal.replaces, userId })
                : null;
            if (!replacing && (await Memory.countDocuments({ userId })) >= MAX_MEMORIES) {
                proposal.status = "pending";
                await reply.save();
                return res.status(409).json({
                    message: `You already have ${MAX_MEMORIES} memories. Delete some in the Memory panel first.`,
                });
            }

            // 3. Create the new memory first, then remove the one it replaces,
            //    so a failure never loses the old one.
            const memory = await Memory.create({ userId, text: proposal.text });
            if (replacing) await Memory.deleteOne({ _id: proposal.replaces, userId });

            proposal.status = "saved";
            proposal.memoryId = memory._id;
            await reply.save();
            return res.status(200).json({
                assistantMessage: reply,
                memory,
                replacedId: replacing ? String(proposal.replaces) : null,
            });
        } catch (error) {
            proposal.status = "pending";
            await reply.save();
            throw error;
        }
    } catch (error) {
        console.log("Error in saveMemoryProposal controller:", error.message);
        return res.status(500).json({ message: "Couldn't save the memory. Please try again." });
    }
};

/** POST /api/memories/proposals/:proposalId/dismiss */
export const dismissMemoryProposal = async (req, res) => {
    const { proposalId } = req.params;
    if (!mongoose.isValidObjectId(proposalId)) return res.status(400).json({ message: "Invalid suggestion id" });
    try {
        const reply = await Message.findOneAndUpdate(
            findOwnedProposal(req.user._id, proposalId, "pending"),
            { $set: { "memoryProposals.$.status": "dismissed" } },
            { new: true },
        );
        if (!reply) return res.status(409).json({ message: "This suggestion was already saved or dismissed." });
        return res.status(200).json({ assistantMessage: reply });
    } catch (error) {
        console.log("Error in dismissMemoryProposal controller:", error.message);
        return res.status(500).json({ message: "Couldn't dismiss the suggestion. Please try again." });
    }
};
