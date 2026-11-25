import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "./aiTools.js";

const memories = [{ _id: "6740000000000000000000aa", text: "Looking for backend jobs." }];
const ctx = { userId: "u1", assistantId: "bot", memories };

test("save_memory returns a pending suggestion and saves nothing", async () => {
    const result = await runTool("save_memory", { text: "Name is Josh." }, ctx);
    assert.equal(result.isError, undefined);
    assert.match(result.content, /NOT been saved/);
    assert.equal(result.memoryProposal.text, "Name is Josh.");
    assert.equal(result.memoryProposal.status, "pending");
    assert.equal(result.memoryProposal.replaces, null);
});

test("save_memory can replace one of the user's memories", async () => {
    const result = await runTool("save_memory", { text: "Looking for frontend jobs.", replaces: memories[0]._id }, ctx);
    assert.equal(String(result.memoryProposal.replaces), memories[0]._id);
    assert.equal(result.memoryProposal.replacesText, "Looking for backend jobs.");
});

test("save_memory refuses secrets and unknown memory ids", async () => {
    assert.equal((await runTool("save_memory", { text: "Password is 1234" }, ctx)).isError, true);
    assert.equal((await runTool("save_memory", { text: "x", replaces: "6740000000000000000000bb" }, ctx)).isError, true);
});
