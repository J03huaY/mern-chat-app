import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ASSISTANT_MESSAGE_CHARS, checkAssistantLimits, checkAssistantMessageText, readLimits } from "./aiRateLimit.js";

const limits = { perMinute: 5, perDay: 40, totalPerDay: 200 };

test("readLimits uses the defaults unless a variable is a positive whole number", () => {
    assert.deepEqual(readLimits({}), limits);
    assert.deepEqual(readLimits({ AI_LIMIT_PER_MINUTE: "2", AI_LIMIT_PER_DAY: "10", AI_LIMIT_TOTAL_PER_DAY: "50" }), {
        perMinute: 2,
        perDay: 10,
        totalPerDay: 50,
    });
    // Empty, zero, negative or fractional values fall back instead of disabling the limit.
    assert.deepEqual(readLimits({ AI_LIMIT_PER_MINUTE: "", AI_LIMIT_PER_DAY: "0", AI_LIMIT_TOTAL_PER_DAY: "-3" }), limits);
    assert.equal(readLimits({ AI_LIMIT_PER_MINUTE: "1.5" }).perMinute, 5);
});

test("checkAssistantLimits allows messages up to each limit", () => {
    assert.equal(checkAssistantLimits({ minute: 0, day: 0, total: 0 }, limits), null);
    assert.equal(checkAssistantLimits({ minute: 4, day: 39, total: 199 }, limits), null);
});

test("checkAssistantLimits blocks the message after a limit and says when to retry", () => {
    const minute = checkAssistantLimits({ minute: 5, day: 5, total: 5 }, limits);
    assert.match(minute.error, /too quickly/);
    assert.equal(minute.retryAfterSeconds, 60);

    const day = checkAssistantLimits({ minute: 0, day: 40, total: 40 }, limits);
    assert.match(day.error, /40 messages .* last 24 hours/);

    // The shared daily budget wins over a user's own counts.
    const total = checkAssistantLimits({ minute: 0, day: 0, total: 200 }, limits);
    assert.match(total.error, /all users/);
});

test("checkAssistantMessageText caps the length of a message to the assistant", () => {
    assert.equal(checkAssistantMessageText("hi"), null);
    assert.equal(checkAssistantMessageText(undefined), null); // an image-only message
    assert.equal(checkAssistantMessageText("x".repeat(MAX_ASSISTANT_MESSAGE_CHARS)), null);
    assert.match(checkAssistantMessageText("x".repeat(MAX_ASSISTANT_MESSAGE_CHARS + 1)), /at most 4000/);
});
