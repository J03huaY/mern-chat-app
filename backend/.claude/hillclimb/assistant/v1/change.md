Fix contact matching and the per-step system prompt

1. pickContact (src/lib/aiToolHelpers.js): when no name matches exactly, prefer contacts with a word that starts with the query. "Li" used to match both "Alice Chen" (A-li-ce) and "Bob Li", so the assistant asked which one was meant; now it means Bob Li.
2. runAgent (src/lib/ai.js): build the system prompt once per reply instead of on every step. Its "Current time" line changed when a reply crossed a minute, and the API then rejected the thinking blocks passed back from the previous step (400 "bound to a different conversation"). 3 of 63 baseline attempts failed this way.

Expected: contact-partial-name goes from 0/3 to 3/3; no thinking-signature errors. The second fix is timing-dependent, so ai.test.js covers it directly.
