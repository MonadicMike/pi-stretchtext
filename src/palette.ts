// The colours open stretches take in turn, read from Pi's theme, so they follow it, light or dark,
// and change with it. The order is cc-stretch's: yellow, violet, green, then blue. Each open stretch
// keeps its colour; all but the newest take a faded form of it, mixed 35% toward the theme's
// background side, quieter but still that colour. Before Pi hands over its theme, stretches are drawn
// without colour.

import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { foregroundAnsi, mixColors, rgbColor } from "@earendil-works/pi-tui";

import type { Option } from "./monad.ts";

type Paint = (text: string) => string;

const COLOURS: readonly ThemeColor[] = ["warning", "accent", "success", "mdLink"];
const FADE = 0.35;

const colourAt = (count: number) => COLOURS[count % COLOURS.length]!;
const plain: Paint = (text) => text;

const full = (theme: Theme, colour: ThemeColor): Paint => (text) => theme.fg(colour, text);

/** `colour` faded toward the background the theme is made for. Only the colour changes, not bold or dim, so Markdown's own marks stand. */
function faded(theme: Theme, colour: ThemeColor): Paint {
	const background = theme.appearance === "dark" ? rgbColor(0, 0, 0) : rgbColor(255, 255, 255);
	const ansi = foregroundAnsi(mixColors(theme.colors[colour], background, FADE, "srgb"), theme.getColorMode());
	return (text) => `${ansi}${text}\x1b[39m`;
}

/** `count`, or the next count when `count` would give the colour of the stretch holding it, opened at `parent`. */
export const hueAfter = (count: number, parent: Option<number>) =>
	parent.filter((hue) => hue % COLOURS.length === count % COLOURS.length).isSome ? count + 1 : count;

/** The paint for the words a stretch opened at `count` adds: full for the newest stretch, else faded. */
export const wordsPaint = (theme: Option<Theme>, count: number, isNewest: boolean): Paint =>
	theme.map((theme) => (isNewest ? full : faded)(theme, colourAt(count))).getOrElse(plain);

/** The paint for the « closing a stretch opened at `count`, which always takes its full colour. */
export const closerPaint = (theme: Option<Theme>, count: number): Paint =>
	theme.map((theme) => full(theme, colourAt(count))).getOrElse(plain);
