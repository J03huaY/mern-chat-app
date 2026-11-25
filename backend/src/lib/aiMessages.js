// Turns stored chat messages into the `messages` array the Claude API expects.
// Kept free of database and SDK imports so it can be unit-tested on its own.
import { formatTime } from "./aiToolHelpers.js";

const DRAFT_STATUS_TEXT = {
    pending: "waiting for the user to review and send it",
    sending: "waiting for the user to review and send it",
    sent: "the user sent it",
    cancelled: "the user cancelled it",
};

/** One line per draft, so the model knows what happened to drafts it wrote earlier. */
export function describeDrafts(drafts) {
    return (drafts || [])
        .map((d) => `[Draft to ${d.recipientName || "a contact"}: "${d.text}" (${DRAFT_STATUS_TEXT[d.status] || d.status})]`)
        .join("\n");
}

const MEMORY_STATUS_TEXT = {
    pending: "waiting for the user to save or dismiss it",
    saving: "waiting for the user to save or dismiss it",
    saved: "the user saved it",
    dismissed: "the user dismissed it",
};

/** One line per memory suggestion, so the model knows which ones the user saved. */
export function describeMemoryProposals(proposals) {
    return (proposals || [])
        .map((p) => `[Memory suggestion: "${p.text}" (${MEMORY_STATUS_TEXT[p.status] || p.status})]`)
        .join("\n");
}

/**
 * @param {Array<{senderId: unknown, text?: string, image?: string, createdAt?: Date, drafts?: Array, memoryProposals?: Array}>} history
 *   Messages between one user and the assistant, oldest first.
 * @param {string} assistantId The assistant user's id.
 * @param {string} [timeZone] The user's time zone, for the times on their messages.
 * @returns {Array<{role: "user" | "assistant", content: string}>}
 *
 * Each user message starts with when it was sent ("[2026-11-24 18:22] ..."), so the
 * model can tell a request from hours ago apart from the current one.
 */
export function buildClaudeMessages(history, assistantId, timeZone) {
    const out = [];

    for (const message of history) {
        const role = String(message.senderId) === String(assistantId) ? "assistant" : "user";

        let text = (message.text || "").trim();
        if (message.image) {
            // The assistant cannot see images yet; tell it one was sent.
            text = text ? `${text}\n[The user also attached an image.]` : "[The user sent an image.]";
        }
        if (role === "assistant" && message.drafts?.length) {
            text = [text, describeDrafts(message.drafts)].filter(Boolean).join("\n");
        }
        if (role === "assistant" && message.memoryProposals?.length) {
            text = [text, describeMemoryProposals(message.memoryProposals)].filter(Boolean).join("\n");
        }
        if (!text) continue;
        if (role === "user" && message.createdAt) text = `[${formatTime(message.createdAt, timeZone)}] ${text}`;

        const last = out[out.length - 1];
        if (last && last.role === role) {
            last.content += `\n\n${text}`;
        } else {
            out.push({ role, content: text });
        }
    }

    // The conversation must start with the user and end with a user turn
    // (the current models reject a trailing assistant message as a prefill).
    while (out.length && out[0].role !== "user") out.shift();
    while (out.length && out[out.length - 1].role !== "user") out.pop();

    return out;
}
