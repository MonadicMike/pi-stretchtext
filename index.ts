// stretchtext: cc-stretch (https://github.com/pro-vi/cc-stretch) for Pi.
// Replies carry `{{short|long}}` stretches. Pi draws each closed one as its underlined short form;
// in fullscreen a click on it opens it in place and a click on « closes it. alt+o puts a letter
// over each closed stretch and typing it opens it; alt+c does the same over each « to close.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { Animator } from "./src/animation.ts";
import { LinkTable } from "./src/links.ts";
import { Store } from "./src/monad.ts";
import { onMarkdownClick } from "./src/mouse.ts";
import { GUIDE } from "./src/prompt.ts";
import { draw } from "./src/render.ts";
import { Screen } from "./src/screen.ts";
import { initialState, pickLetter, remember, setGrowth, settle, startLettering, takeReadNote, toggle } from "./src/state.ts";
import type { Mode } from "./src/state.ts";
import { nameOf } from "./src/target.ts";
import type { Target } from "./src/target.ts";
import { lengthOf } from "./src/grow.ts";
import { parse, stretches } from "./src/parse.ts";

/** How long a stretch takes to grow or shrink: longer for a longer long form, as in cc-stretch. */
const secondsFor = (target: Target) => Math.min(1.4, 0.45 + lengthOf(target.stretch.long.getOrElse([])) / 70);

export default function stretchtext(pi: ExtensionAPI) {
	const screen = new Screen();
	const store = new Store(initialState, () => screen.redraw());
	const links = new LinkTable();
	const animator = new Animator();

	/** Opens a closed stretch or closes an open one, growing or shrinking it in place. */
	function toggleStretch(target: Target) {
		const isOpening = store.run(toggle(target));
		const name = nameOf(target);
		animator.run({
			from: isOpening ? 0 : 1,
			to: isOpening ? 1 : 0,
			seconds: secondsFor(target),
			frame: (progress) => store.run(setGrowth(name, progress)),
			done: () => store.run(settle(target, isOpening)),
		});
	}

	function askForLetter(ctx: ExtensionContext, mode: Mode) {
		if (ctx.mode !== "tui") return;
		if (!store.run(startLettering(mode))) {
			ctx.ui.notify(`stretchtext: nothing to ${mode}`, "info");
			return;
		}
		void ctx.ui.custom<void>((tui, theme, _keys, done) => {
			screen.attach(tui, theme);
			return {
				render: (width: number) => [theme.fg("dim", `stretch: type a letter to ${mode} (any other key cancels)`.slice(0, width))],
				invalidate: () => {},
				handleInput: (key: string) => {
					store.run(pickLetter(key)).forEach(toggleStretch);
					done();
				},
			};
		});
	}

	onMarkdownClick((line, x) => links.at(line, x).map((target) => () => toggleStretch(target)));

	pi.registerMarkdownTransformer((markdown, { messageType }) => {
		if (messageType !== "assistant" || !markdown.includes("{{")) return markdown;
		const segments = parse(markdown);
		if (stretches(segments).length === 0) return markdown;
		store.run(remember(markdown));
		return draw(store.current, { links, theme: screen.theme }, markdown, segments);
	});

	pi.on("before_agent_start", (event) => {
		const sections = event.systemPromptOptions.sections;
		sections.stretchtext = GUIDE;
		store.run(takeReadNote()).match({
			some: (note) => {
				sections.stretchtext_read = note;
			},
			none: () => {
				delete sections.stretchtext_read;
			},
		});
	});

	// An empty widget below the editor draws nothing and takes no row; it is only how an extension gets the TUI.
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setWidget(
			"stretchtext",
			(tui, theme) => {
				screen.attach(tui, theme);
				return { render: () => [], invalidate: () => {} };
			},
			{ placement: "belowEditor" },
		);
	});

	pi.on("session_shutdown", () => animator.stop());

	pi.registerShortcut("alt+o", {
		description: "stretchtext: letters over closed stretches, to open one",
		handler: (ctx) => askForLetter(ctx, "open"),
	});
	pi.registerShortcut("alt+c", {
		description: "stretchtext: letters over open stretches, to close one",
		handler: (ctx) => askForLetter(ctx, "close"),
	});
}
