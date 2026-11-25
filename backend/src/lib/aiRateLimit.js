// Limits on messages to the AI assistant, so a public deployment can't run up
// an unbounded API bill. Usage is counted from the messages already stored, so
// the limits survive restarts and need no extra storage.
import Message from "../models/message.model.js";

export const MAX_ASSISTANT_MESSAGE_CHARS = 4000;

const DEFAULT_LIMITS = {
    perMinute: 5, // per user
    perDay: 40, // per user, rolling 24 hours
    totalPerDay: 200, // all users together, rolling 24 hours
};

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Limits from AI_LIMIT_PER_MINUTE / AI_LIMIT_PER_DAY / AI_LIMIT_TOTAL_PER_DAY, else the defaults. */
export function readLimits(env = process.env) {
    const read = (name, fallback) => {
        const n = Number(env[name]);
        return Number.isInteger(n) && n > 0 ? n : fallback;
    };
    return {
        perMinute: read("AI_LIMIT_PER_MINUTE", DEFAULT_LIMITS.perMinute),
        perDay: read("AI_LIMIT_PER_DAY", DEFAULT_LIMITS.perDay),
        totalPerDay: read("AI_LIMIT_TOTAL_PER_DAY", DEFAULT_LIMITS.totalPerDay),
    };
}

/** An error string when a message to the assistant is too long, else null. */
export function checkAssistantMessageText(text) {
    if (typeof text === "string" && text.length > MAX_ASSISTANT_MESSAGE_CHARS) {
        return `Messages to the AI assistant can be at most ${MAX_ASSISTANT_MESSAGE_CHARS} characters.`;
    }
    return null;
}

/**
 * Decides whether one more message to the assistant is allowed.
 * `counts` is { minute, day, total }: messages already sent in each window.
 * Returns null when allowed, else { error, retryAfterSeconds }.
 */
export function checkAssistantLimits(counts, limits) {
    if (counts.total >= limits.totalPerDay) {
        return {
            error: "The AI assistant has reached today's limit for all users. Please try again tomorrow.",
            retryAfterSeconds: 3600,
        };
    }
    if (counts.day >= limits.perDay) {
        return {
            error: `You've sent ${limits.perDay} messages to the AI assistant in the last 24 hours. Please try again later.`,
            retryAfterSeconds: 3600,
        };
    }
    if (counts.minute >= limits.perMinute) {
        return {
            error: "You're messaging the AI assistant too quickly. Please wait a minute and try again.",
            retryAfterSeconds: 60,
        };
    }
    return null;
}

/** How many messages were sent to the assistant in each window: { minute, day, total }. */
export async function assistantUsage(userId, assistantId, now = Date.now()) {
    const lastDay = new Date(now - DAY_MS);
    const [minute, day, total] = await Promise.all([
        Message.countDocuments({ senderId: userId, receiverId: assistantId, createdAt: { $gte: new Date(now - MINUTE_MS) } }),
        Message.countDocuments({ senderId: userId, receiverId: assistantId, createdAt: { $gte: lastDay } }),
        Message.countDocuments({ receiverId: assistantId, createdAt: { $gte: lastDay } }),
    ]);
    return { minute, day, total };
}
