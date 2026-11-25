import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClaudeMessages, describeDrafts } from "./aiMessages.js";

const BOT = "bot1";
const USER = "user1";

test("maps senders to user and assistant roles", () => {
    const result = buildClaudeMessages(
        [
            { senderId: USER, text: "Hi" },
            { senderId: BOT, text: "Hello!" },
            { senderId: USER, text: "How are you?" },
        ],
        BOT,
    );
    assert.deepEqual(result, [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
        { role: "user", content: "How are you?" },
    ]);
});

test("merges consecutive messages from the same sender", () => {
    const result = buildClaudeMessages(
        [
            { senderId: USER, text: "first" },
            { senderId: USER, text: "second" },
        ],
        BOT,
    );
    assert.deepEqual(result, [{ role: "user", content: "first\n\nsecond" }]);
});

test("drops a leading assistant turn and a trailing assistant turn", () => {
    const result = buildClaudeMessages(
        [
            { senderId: BOT, text: "old reply" },
            { senderId: USER, text: "question" },
            { senderId: BOT, text: "partial answer" },
        ],
        BOT,
    );
    assert.deepEqual(result, [{ role: "user", content: "question" }]);
});

test("describes image messages and skips empty ones", () => {
    const result = buildClaudeMessages(
        [
            { senderId: USER, text: "", image: "https://example.com/a.png" },
            { senderId: USER, text: "   " },
            { senderId: USER, text: "what is it?", image: "https://example.com/b.png" },
        ],
        BOT,
    );
    assert.deepEqual(result, [
        {
            role: "user",
            content: "[The user sent an image.]\n\nwhat is it?\n[The user also attached an image.]",
        },
    ]);
});

test("compares ObjectId-like ids by string value", () => {
    const botId = { toString: () => BOT };
    const result = buildClaudeMessages([{ senderId: USER, text: "q" }], botId);
    assert.equal(result[0].role, "user");
});

test("returns an empty list when there is no user message", () => {
    assert.deepEqual(buildClaudeMessages([{ senderId: BOT, text: "hi" }], BOT), []);
    assert.deepEqual(buildClaudeMessages([], BOT), []);
});

test("tells the model what happened to drafts in earlier replies", () => {
    const result = buildClaudeMessages(
        [
            { senderId: USER, text: "reply to Bob" },
            {
                senderId: BOT,
                text: "Here's a draft.",
                drafts: [
                    { recipientName: "Bob Li", text: "See you at 7!", status: "sent" },
                    { recipientName: "Alice Chen", text: "Running late", status: "cancelled" },
                ],
            },
            { senderId: USER, text: "did you send it?" },
        ],
        BOT,
    );
    assert.equal(
        result[1].content,
        'Here\'s a draft.\n[Draft to Bob Li: "See you at 7!" (the user sent it)]\n' +
            '[Draft to Alice Chen: "Running late" (the user cancelled it)]',
    );
});

test("describeDrafts marks pending drafts as waiting for the user", () => {
    assert.equal(
        describeDrafts([{ recipientName: "Bob Li", text: "hi", status: "pending" }]),
        '[Draft to Bob Li: "hi" (waiting for the user to review and send it)]',
    );
    assert.equal(describeDrafts(undefined), "");
});

test("buildClaudeMessages tells the model what happened to its memory suggestions", () => {
    const messages = buildClaudeMessages(
        [
            { senderId: "u", text: "I'm job hunting for backend roles" },
            {
                senderId: "bot",
                text: "Good luck! Want me to remember that?",
                memoryProposals: [{ text: "Looking for backend jobs.", status: "saved" }, { text: "Likes ramen.", status: "dismissed" }],
            },
            { senderId: "u", text: "thanks" },
        ],
        "bot",
    );
    assert.match(messages[1].content, /\[Memory suggestion: "Looking for backend jobs\." \(the user saved it\)\]/);
    assert.match(messages[1].content, /"Likes ramen\." \(the user dismissed it\)/);
});
