import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import bcrypt from "bcryptjs";

import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { getReceiverSocketId, io } from "./socket.js";
import { buildClaudeMessages } from "./aiMessages.js";

// Read at call time: index.js loads .env after this module is imported.
const getModel = () => process.env.AI_MODEL || "claude-opus-5-5";
const HISTORY_LIMIT = 30; // most recent messages sent to the model as context
const ASSISTANT_EMAIL = "assistant@ai.local";

const SYSTEM_PROMPT = `You are "AI Assistant", a contact inside a real-time chat app. \
People message you the same way they message their friends.
- Reply in the language the user writes in.
- Keep replies short and conversational, like a chat message. Use a few short paragraphs or a simple list when it helps.
- The app shows plain text, so do not use Markdown headings, tables, or bold text.
- You cannot see images yet. If the user sends one, say so and ask them to describe it.`;

let client = null;
let assistantId = null;

// Created lazily so the server still starts when no API key is configured.
function getClient() {
    if (!client) client = new Anthropic();
    return client;
}

/** Finds the assistant account, creating it on first start. */
export async function ensureAssistantUser() {
    let bot = await User.findOne({ isBot: true });
    if (!bot) {
        const password = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
        bot = await User.create({
            email: ASSISTANT_EMAIL,
            fullName: "AI Assistant",
            password,
            profilePic: "/ai-avatar.svg",
            isBot: true,
        });
        console.log("Created AI assistant user");
    }
    assistantId = bot._id.toString();
    return bot;
}

export const isAssistant = (userId) => assistantId !== null && String(userId) === assistantId;

export const isReservedEmail = (email) => String(email).toLowerCase().endsWith("@ai.local");

// One reply at a time per user, so quick follow-up messages are answered in order.
const replyQueues = new Map();

/** Schedules an assistant reply to `userId`'s latest messages. Never throws. */
export function queueAssistantReply(userId) {
    const key = String(userId);
    const previous = replyQueues.get(key) || Promise.resolve();
    const next = previous
        .then(() => respond(key))
        .catch((error) => console.log("Error in assistant reply queue:", error.message));
    replyQueues.set(key, next);
    next.finally(() => {
        if (replyQueues.get(key) === next) replyQueues.delete(key);
    });
}

function emitTo(userId, event, payload) {
    const socketId = getReceiverSocketId(userId);
    if (socketId) io.to(socketId).emit(event, payload);
}

async function respond(userId) {
    const botId = assistantId;
    const replyId = crypto.randomUUID();
    emitTo(userId, "ai:start", { replyId });

    try {
        const recent = await Message.find({
            $or: [
                { senderId: userId, receiverId: botId },
                { senderId: botId, receiverId: userId },
            ],
        })
            .sort({ createdAt: -1 })
            .limit(HISTORY_LIMIT)
            .lean();

        const messages = buildClaudeMessages(recent.reverse(), botId);
        if (messages.length === 0) {
            emitTo(userId, "ai:done", { replyId });
            return;
        }

        const stream = getClient().beta.messages.stream({
            model: getModel(),
            max_tokens: 16000,
            system: SYSTEM_PROMPT,
            output_config: { effort: "low" }, // chat replies don't need deep reasoning
            // If the model declines on safety grounds, retry on a suitable fallback model.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            messages,
        });

        let text = "";
        for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                text += event.delta.text;
                emitTo(userId, "ai:delta", { replyId, text: event.delta.text });
            }
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" && !text.trim()) {
            text = "Sorry, I can't help with that one.";
        }
        if (!text.trim()) text = "(No reply was generated. Please try again.)";

        const saved = await Message.create({ senderId: botId, receiverId: userId, text: text.trim() });
        emitTo(userId, "newMessage", saved);
        emitTo(userId, "ai:done", { replyId });
    } catch (error) {
        console.log("Error in assistant reply:", error.message);
        emitTo(userId, "ai:error", { replyId, message: describeError(error) });
    }
}

function describeError(error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        return "The AI assistant's API key is invalid. Check ANTHROPIC_API_KEY on the server.";
    }
    if (error instanceof Anthropic.RateLimitError) {
        return "The AI assistant is busy right now. Please try again in a moment.";
    }
    if (error instanceof Anthropic.APIError) {
        return "The AI assistant is temporarily unavailable. Please try again.";
    }
    // Errors outside the API, e.g. no credentials configured when the client is created.
    return "The AI assistant isn't set up yet. Add ANTHROPIC_API_KEY to backend/.env.";
}
