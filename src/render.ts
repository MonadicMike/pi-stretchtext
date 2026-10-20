// How a reply is drawn for a given state: each closed stretch as its underlined short form, each open
// one as its long form in its colour, followed by a «. Both are links a click finds again.

import type { Theme } from "@earendil-works/pi-coding-agent";

import type { LinkTable } from "./links.ts";
import { Option } from "./monad.ts";
import { closerPaint, wordsPaint } from "./palette.ts";
import type { Mode, StretchState } from "./state.ts";
import { nameOf } from "./target.ts";
import type { Target } from "./target.ts";
import { grow } from "./grow.ts";
import { drawnAs } from "./parse.ts";
import type { Segment } from "./parse.ts";

const underline = (text: string) => `\x1b[4m${text}\x1b[24m`;
const reverse = (text: string) => `\x1b[7m${text}\x1b[27m`;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** What a reply is drawn with besides its state: the links a click finds, and Pi's theme for colour. */
export type Canvas = { links: LinkTable; theme: Option<Theme> };

export function draw(state: StretchState, canvas: Canvas, reply: string, segments: readonly Segment[]): string {
	return segments
		.map((segment) => {
			if (typeof segment === "string") return segment;
			switch (drawnAs(segment)) {
				case "text":
					return segment.short;
				case "open":
					return draw(state, canvas, reply, segment.long.getOrElse([]));
				case "link":
					return drawLink(state, canvas, { reply, stretch: segment });
			}
		})
		.join("");
}

function drawLink(state: StretchState, { links, theme }: Canvas, target: Target): string {
	const name = nameOf(target);
	const hue = state.open.get(name);
	if (hue === undefined) return letter(state, name, "open") + links.link(target, underline(target.stretch.short));

	const growth = state.growth.filter((growth) => growth.name === name);
	const long = grow(
		target.stretch.short,
		target.stretch.long.getOrElse([]),
		growth.map((growth) => easeInOut(growth.progress)).getOrElse(1),
		(nested) => draw(state, { links, theme }, target.reply, [nested]),
		wordsPaint(theme, hue, state.newest.is(name)),
	);
	// While it grows or shrinks, a stretch has no « to click.
	return growth.isSome ? long : `${long} ${letter(state, name, "close")}${links.link(target, closerPaint(theme, hue)("«"))}`;
}

/** The letter over a stretch while letters for `mode` show, or "". */
function letter(state: StretchState, name: string, mode: Mode): string {
	return state.lettering
		.filter((lettering) => lettering.mode === mode)
		.flatMap((lettering) => Option.from(lettering.byName.get(name)))
		.match({ some: reverse, none: () => "" });
}
