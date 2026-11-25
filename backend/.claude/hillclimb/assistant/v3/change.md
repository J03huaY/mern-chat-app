Timestamps on the user's messages in history, ask when a message is unclear, and the sender's own tabs get their messages

- History: each user message starts with when it was sent ([YYYY-MM-DD HH:mm] in the user's time zone), so the model can tell an hours-old request from the current one.
- Prompt: if the latest message is unclear (a single word like "check" or "continue"), ask what the user wants instead of picking up an earlier request; a short answer to a question the assistant just asked ("好") is clear.
- New cases: unclear-check-stale-task (from the live site), unclear-continue-stale-task, clear-yes-after-question. All 3/3.

Result 92/96. Two earlier cases dropped; neither is a regression in the change itself:
- lookup-dinner-plan 1/3: this run happened at 03:05, before the demo seed's fixed "today" times (09:30...), so Bob's messages were dated in the future and the model found only his invitation. The seed now keeps today's messages in the past; rerun with the fixed seed: 3/3.
- date-who-messaged-yesterday 1/3 (2/3 on the rerun): no tool lists messages by date. The model either searches for "e" to get every message or, now that it is told not to guess, asks the user for a keyword. Needs a list-by-date tool.
