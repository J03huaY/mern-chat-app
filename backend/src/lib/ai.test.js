import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { runAgent } from "./ai.js";

/** A stand-in for the Anthropic client that returns `responses` in order and records each request. */
function fakeClient(responses, { onStep } = {}) {
    const requests = [];
    const client = {
        beta: {
            messages: {
                stream(params) {
                    requests.push(structuredClone(params));
                    const step = requests.length;
                    const handlers = {};
                    return {
                        on(event, fn) {
                            handlers[event] = fn;
                        },
                        async finalMessage() {
                            onStep?.(step);
                            const message = responses[step - 1];
                            for (const block of message.content) {
                                if (block.type === "text") handlers.text?.(block.text);
                            }
                            return message;
                        },
                    };
                },
            },
        },
    };
    return { client, requests };
}

const usage = { input_tokens: 10, output_tokens: 5 };

test("runAgent sends the same system prompt on every step, even across a minute", async () => {
    // 10:00:59, one second before the minute changes.
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-24T10:00:59Z") });
    try {
        const { client, requests } = fakeClient(
            [
                {
                    model: "claude-opus-5-5",
                    stop_reason: "tool_use",
                    usage,
                    content: [
                        { type: "thinking", thinking: "Look it up.", signature: "sig" },
                        // An unknown tool fails without touching the database.
                        { type: "tool_use", id: "toolu_1", name: "no_such_tool", input: {} },
                    ],
                },
                { model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: "Done." }] },
            ],
            // The first model call takes two seconds, so the second starts at 10:01:01.
            { onStep: (step) => step === 1 && mock.timers.tick(2000) },
        );

        const result = await runAgent([{ role: "user", content: "hi" }], {
            userId: "u1",
            assistantId: "bot",
            timeZone: "UTC",
            client,
        });

        assert.equal(requests.length, 2);
        assert.match(requests[0].system, /Current time: 2026-11-24 10:00 \(UTC\)/);
        assert.equal(requests[1].system, requests[0].system);
        assert.equal(result.system, requests[0].system);
        assert.equal(result.text, "Done.");
        // The thinking block is passed back unchanged with the tool result.
        assert.deepEqual(requests[1].messages[1].content[0], { type: "thinking", thinking: "Look it up.", signature: "sig" });
        assert.equal(requests[1].messages[2].content[0].is_error, true);
    } finally {
        mock.timers.reset();
    }
});

test("runAgent puts the user's memories in the system prompt and collects memory suggestions", async () => {
    const { client, requests } = fakeClient([
        {
            model: "claude-opus-5-5",
            stop_reason: "tool_use",
            usage,
            content: [{ type: "tool_use", id: "toolu_1", name: "save_memory", input: { text: "Prefers Python." } }],
        },
        { model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: "I suggested remembering that." }] },
    ]);
    const shown = [];
    const result = await runAgent([{ role: "user", content: "I prefer Python" }], {
        userId: "u1",
        assistantId: "bot",
        timeZone: "UTC",
        memories: [{ _id: "m1", text: "Name is Josh.", createdAt: new Date("2026-11-20T10:00:00Z") }],
        events: { memory: (p) => shown.push(p) },
        client,
    });

    assert.match(requests[0].system, /\[m1\] Name is Josh\./);
    assert.equal(result.memoryProposals.length, 1);
    assert.equal(result.memoryProposals[0].text, "Prefers Python.");
    assert.deepEqual(shown, result.memoryProposals);
    assert.equal(result.drafts.length, 0);
});
