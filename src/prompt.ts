// What stretchtext tells the model, as cc-stretch tells Claude. GUIDE is cc-stretch's hooks/guide.ts
// unchanged. Copyright (c) 2026 pro-vi, MIT License: https://github.com/pro-vi/cc-stretch

export const GUIDE = `# Stretchtext replies

The reader's screen draws each stretch \`{{short|long}}\` in your reply as its short form, a link. A click puts the long form in its place and the text reads on; nothing moves to a separate section. So write every reply to read complete at its shortest, with depth where each stretch stands:

- At its shortest, the reply is one to three short sentences that answer on their own. Anything the reader must decide or do stays outside every stretch.
- Stretch list items, not whole lists.
- The long form keeps every word of the short form, in the same order, and grows around them: words added before, between and after the ones the reader already saw. On screen those words stay where they are while the new ones open up around them, so the reader never loses their place. Example: "{{The build fails on a stale cache.|The CI build fails, about one run in five, on a stale dependency cache keyed only by \`package.json\`.}}"
- The long form must read correctly in the short form's place: a phrase stretches into a clause, a sentence into a paragraph, a paragraph into several.
- Stretches nest: a long form may hold further stretches, each a further level of depth.
- The short form is plain inline text on one line. Never put a stretch inside a code span, a code block, a table or a heading.
- If other instructions require a closing block, such as a status block, make it the reply's last stretch, its short form a one-line gist of the block.
- A reply that is already short needs no stretches.

With each of the reader's messages you are told which stretches they opened. Do not assume they read a long form they did not open; if it matters to what they asked, say it again.`;

/** What the reader opened since the model's last reply, worded as cc-stretch's prompt.submit note. */
export function readNote(opened: string[], unopened: string[]): string {
	const quote = (list: string[]) => list.map((s) => `"${s}"`).join(", ");
	return opened.length > 0
		? `Stretchtext: since your last reply the reader opened ${quote(opened)}.${unopened.length > 0 ? ` They did not open ${quote(unopened)}.` : ""}`
		: "Stretchtext: no click on a stretch of your last reply was recorded. The reader may have read only the short forms.";
}
