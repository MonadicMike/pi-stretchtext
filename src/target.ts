import type { Stretch } from "./parse.ts";

/** A stretch and the reply holding it. Pi's Markdown transformer sees only a reply's text, so the text names the reply. */
export type Target = { reply: string; stretch: Stretch };

/** One string per stretch of a reply, to key maps by: its reply's text and its key. */
export const nameIn = (reply: string, key: string) => `${reply}\u0000${key}`;

export const nameOf = (target: Target) => nameIn(target.reply, target.stretch.key);
