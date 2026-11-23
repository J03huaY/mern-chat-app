import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import {
    escapeRegex,
    formatMessageLine,
    formatTime,
    pickContact,
    validateConversationInput,
    validateSearchInput,
    wrapChatData,
} from "./aiToolHelpers.js";

const dateProperties = {
    after: {
        type: "string",
        description: "Only include messages on or after this date (YYYY-MM-DD, or an ISO timestamp).",
    },
    before: {
        type: "string",
        description: "Only include messages on or before this date (YYYY-MM-DD includes that whole day).",
    },
};

/** Tool definitions sent to the Claude API (Anthropic.Tool[]). */
export const TOOL_DEFINITIONS = [
    {
        name: "search_messages",
        description:
            "Search the user's own chat messages with other people for a word or phrase " +
            "(case-insensitive). Use it when the user asks who said something, when something " +
            "was mentioned, or to find a link, address, time or other detail in their chats. " +
            "Returns matching messages, newest first, with time, sender and receiver. " +
            "Does not search the user's conversation with you.",
        eager_input_streaming: true,
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Word or phrase to look for, e.g. \"zoom\" or \"dinner\"." },
                contact: {
                    type: "string",
                    description: "Optional: only search the conversation with this person (their name).",
                },
                ...dateProperties,
                limit: { type: "integer", description: "Maximum messages to return (default 20, max 50)." },
            },
            required: ["query"],
            additionalProperties: false,
        },
    },
    {
        name: "summarize_conversation",
        description:
            "Fetch the user's conversation with one contact so you can summarize it or answer " +
            "questions about it. Returns the most recent messages in the date range, oldest first. " +
            "Use it for requests like \"what did Alice and I talk about yesterday\". " +
            "Write the summary yourself from the returned messages.",
        eager_input_streaming: true,
        input_schema: {
            type: "object",
            properties: {
                contact: { type: "string", description: "The other person's name." },
                ...dateProperties,
                max_messages: {
                    type: "integer",
                    description: "Maximum messages to return, most recent first (default 100, max 200).",
                },
            },
            required: ["contact"],
            additionalProperties: false,
        },
    },
];

/**
 * Short text the chat UI shows for a tool call: present tense while it runs,
 * past tense once it has finished (`done`).
 */
export function describeToolCall(name, input, { done = false } = {}) {
    const contact = typeof input?.contact === "string" && input.contact ? input.contact : null;
    if (name === "search_messages") {
        const query = typeof input?.query === "string" ? input.query : "";
        const verb = done ? "Searched" : "Searching";
        return `${verb} your messages for "${query}"${contact ? ` with ${contact}` : ""}`;
    }
    if (name === "summarize_conversation") {
        return `${done ? "Read" : "Reading"} your conversation with ${contact || "a contact"}`;
    }
    return `${done ? "Ran" : "Running"} ${name}`;
}

/** The user's contacts whose names contain `name` (never the user or the assistant). */
async function findContacts(name, ctx) {
    return User.find({
        _id: { $nin: [ctx.userId, ctx.assistantId] },
        isBot: { $ne: true },
        fullName: { $regex: escapeRegex(name), $options: "i" },
    })
        .select("fullName")
        .limit(10)
        .lean();
}

function dateFilter(after, before) {
    if (!after && !before) return {};
    const createdAt = {};
    if (after) createdAt.$gte = after;
    if (before) createdAt.$lte = before;
    return { createdAt };
}

/** Only messages between the signed-in user and `otherId`. */
function conversationWith(userId, otherId) {
    return {
        $or: [
            { senderId: userId, receiverId: otherId },
            { senderId: otherId, receiverId: userId },
        ],
    };
}

async function nameMap(messages) {
    const ids = new Set();
    for (const m of messages) {
        ids.add(String(m.senderId));
        ids.add(String(m.receiverId));
    }
    const users = await User.find({ _id: { $in: [...ids] } }).select("fullName").lean();
    return new Map(users.map((u) => [String(u._id), u.fullName]));
}

async function searchMessages(input, ctx) {
    const { value, error } = validateSearchInput(input);
    if (error) return { isError: true, content: error };

    const filters = [
        // Only the signed-in user's own messages...
        { $or: [{ senderId: ctx.userId }, { receiverId: ctx.userId }] },
        // ...excluding their conversation with the assistant itself.
        { senderId: { $ne: ctx.assistantId }, receiverId: { $ne: ctx.assistantId } },
        { text: { $regex: escapeRegex(value.query), $options: "i" } },
        dateFilter(value.after, value.before),
    ];

    let scope = "all your chats";
    if (value.contact) {
        const picked = pickContact(await findContacts(value.contact, ctx), value.contact);
        if (picked.error) return { isError: true, content: picked.error };
        filters.push(conversationWith(ctx.userId, picked.match._id));
        scope = `your chat with ${picked.match.fullName}`;
    }

    const messages = await Message.find({ $and: filters })
        .sort({ createdAt: -1 })
        .limit(value.limit)
        .lean();

    if (messages.length === 0) {
        return { content: `No messages in ${scope} contain "${value.query}".`, resultCount: 0 };
    }

    const names = await nameMap(messages);
    const lines = messages.map((m) => formatMessageLine(m, names, ctx.userId));
    const more = messages.length === value.limit ? " There may be more; narrow the search to see others." : "";
    return {
        content: wrapChatData(
            `Found ${messages.length} message(s) in ${scope} containing "${value.query}", newest first.${more}`,
            lines,
        ),
        resultCount: messages.length,
    };
}

async function summarizeConversation(input, ctx) {
    const { value, error } = validateConversationInput(input);
    if (error) return { isError: true, content: error };

    const picked = pickContact(await findContacts(value.contact, ctx), value.contact);
    if (picked.error) return { isError: true, content: picked.error };
    const contact = picked.match;

    const filter = { ...conversationWith(ctx.userId, contact._id), ...dateFilter(value.after, value.before) };
    const [total, recent] = await Promise.all([
        Message.countDocuments(filter),
        Message.find(filter).sort({ createdAt: -1 }).limit(value.limit).lean(),
    ]);

    if (total === 0) {
        return { content: `You have no messages with ${contact.fullName} in that time range.`, resultCount: 0 };
    }

    const messages = recent.reverse();
    const names = new Map([[String(contact._id), contact.fullName]]);
    const lines = messages.map((m) => formatMessageLine(m, names, ctx.userId));
    const span = `${formatTime(messages[0].createdAt)} to ${formatTime(messages[messages.length - 1].createdAt)}`;
    const shown = total > messages.length ? ` Showing the most recent ${messages.length} of ${total}.` : "";
    return {
        content: wrapChatData(
            `Conversation between you and ${contact.fullName}: ${messages.length} message(s), ${span}, oldest first.${shown}`,
            lines,
        ),
        resultCount: messages.length,
    };
}

const EXECUTORS = {
    search_messages: searchMessages,
    summarize_conversation: summarizeConversation,
};

/**
 * Runs one tool for the signed-in user.
 * `ctx` is { userId, assistantId } and comes from the server, never from the model,
 * so a tool can only ever read the requesting user's own messages.
 * Returns { content, isError?, resultCount? }.
 */
export async function runTool(name, input, ctx) {
    const executor = EXECUTORS[name];
    if (!executor) return { isError: true, content: `Unknown tool: ${name}` };
    try {
        return await executor(input, ctx);
    } catch (error) {
        console.log(`Error in tool ${name}:`, error.message);
        return { isError: true, content: `The ${name} tool failed. Tell the user you could not look that up.` };
    }
}
