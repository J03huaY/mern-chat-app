import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClaudeMessages } from "./aiMessages.js";

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
