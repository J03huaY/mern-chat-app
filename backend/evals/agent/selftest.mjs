// Sanity checks for the grader, before any paid run of the assistant:
//   null   - empty and constant replies should fail nearly every case
//   oracle - hand-written correct replies should pass
//   judge  - an empty reply, "I don't know" and a confident answer to the wrong
//            question should all fail the judge
// Run from backend/: node evals/agent/selftest.mjs   (makes ~12 small judge calls)
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { gradeRun } from "./grade.mjs";

config({ quiet: true });
const { cases } = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
const dates = { today: "2026-11-23", yesterday: "2026-11-22" };
const client = new Anthropic();

const run = ({ text = "", tools = [], drafts = [], memories = [] } = {}) => ({
    text,
    toolCalls: tools.map(([name]) => ({ name, ok: true })),
    toolInputs: tools.map(([name, input]) => ({ name, input, ok: true })),
    drafts: drafts.map(([recipientName, t]) => ({ recipientName, text: t })),
    memoryProposals: memories.map(([text, replaces = null]) => ({ text, replaces })),
});
const codeOnly = (c) => ({ ...c, checks: { ...c.checks, judge: undefined } });

let problems = 0;
const expect = (label, got, want) => {
    const ok = got === want;
    if (!ok) problems++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: pass=${got} (expected ${want})`);
};

// 1. Null outputs, code checks only (the judge would only make them fail harder).
for (const [name, r] of [["empty", run()], ["constant", run({ text: "我不知道" })]]) {
    const passed = [];
    for (const c of cases) if ((await gradeRun(client, codeOnly(c), r, dates)).grade.pass) passed.push(c);
    const unguarded = passed.filter((c) => !c.checks.judge);
    console.log(`null/${name}: ${passed.length}/${cases.length} cases pass the code checks` +
        (passed.length ? ` (${passed.map((c) => c.id).join(", ")}); without a judge to catch it: ${unguarded.length}` : ""));
    problems += unguarded.length;
}

// 2. Oracle outputs.
const S = "summarize_conversation";
const Q = "search_messages";
const oracles = {
    "lookup-zoom-link": run({ text: "Alice 昨天发的 Zoom 链接是 https://zoom.us/j/5550001234", tools: [[Q, { query: "zoom" }]] }),
    "lookup-dinner-plan": run({ text: "Tomorrow at 7pm at the ramen place on 5th.", tools: [[Q, { query: "dinner" }]] }),
    "lookup-homework-left": run({ text: "只剩索引（indexing）那道题了。", tools: [[Q, { query: "homework" }]] }),
    "lookup-next-practice": run({ text: "下次练系统设计：设计一个 URL shortener（短链接服务）。", tools: [[S, { contact: "Alice" }]] }),
    "date-three-days-ago": run({ text: "三天前 Bob 问你数据库作业做完没有。", tools: [[S, { contact: "Bob", after: "2026-11-20" }]] }),
    "draft-two-people": run({
        text: "两条草稿都准备好了，你看一下再发送。",
        tools: [["draft_message", { contact: "Alice" }], ["draft_message", { contact: "Bob" }]],
        drafts: [["Alice Chen", "我今天生病了，这周的安排可能要改一下"], ["Bob Li", "我今天生病了，这周的安排可能要改一下"]],
    }),
    "no-tool-concept": run({ text: "一致性哈希是一种把数据分配到多台服务器上的方法，增加或减少服务器时只需要移动很少的数据。" }),
    "no-tool-greeting": run({ text: "Hi! What can I help you with?" }),
    "summary-alice": run({
        text: "你们昨天约了下午 4 点的模拟面试学习小组，Alice 发了 Zoom 链接。结束后她提议下次练系统设计：设计一个短链接服务，你说会先复习一致性哈希。",
        tools: [[S, { contact: "Alice" }]],
    }),
    "draft-reply-bob": run({
        text: "草稿已经准备好了，确认没问题就点发送。",
        tools: [["draft_message", { contact: "Bob" }]],
        drafts: [["Bob Li", "明晚 7 点拉面店见！"]],
    }),
    "date-who-messaged-yesterday": run({ text: "昨天只有 Alice 给你发过消息，聊的是学习小组和 Zoom 链接。", tools: [[S, { contact: "Alice" }]] }),
    "memory-save-goal": run({ text: "我建议记住这一条，你点保存就行。", tools: [["save_memory", {}]], memories: [["Is looking for backend new grad jobs in the US."]] }),
    "memory-recall": run({ text: "记得，你在找美国的后端 new grad 工作。" }),
    "memory-update": run({ text: "好的，我建议把记忆更新为找前端工作。", tools: [["save_memory", {}]], memories: [["Is looking for frontend jobs.", "6740000000000000000000a1"]] }),
    "memory-no-secret": run({ text: "密码这类信息我不能帮你记，建议用密码管理器保存。" }),
};
for (const [id, r] of Object.entries(oracles)) {
    const g = await gradeRun(client, byId[id], r, dates);
    expect(`oracle ${id}`, g.grade.pass, 1);
    if (!g.grade.pass) console.log("     ", g.explanation.tools, "|", g.explanation.answer);
}

// 3. Judge sanity: these must all fail. Tools are "right" so only the judge decides.
const wrong = {
    "no-tool-greeting": "你最近和 Bob 聊了数据库作业和明天的晚饭。",
    "summary-alice": "你和 Alice 聊了周末去爬山的计划，约好周六早上 8 点在山脚见。",
    "draft-reply-bob": "已经帮你把消息发给 Bob 了！",
    "date-who-messaged-yesterday": "昨天 Bob 和 Alice 都给你发了消息。",
};
for (const id of Object.keys(wrong)) {
    const good = oracles[id];
    for (const [label, text] of [["empty", ""], ["dont-know", "我不知道。"], ["wrong", wrong[id]]]) {
        const g = await gradeRun(client, byId[id], { ...good, text }, dates);
        expect(`judge ${id}/${label}`, g.grade.pass, 0);
    }
}

console.log(problems ? `\n${problems} problem(s)` : "\nall grader sanity checks passed");
process.exit(problems ? 1 : 0);
