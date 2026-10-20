// Pi gives extensions the same pi-tui its transcript draws with (as of Pi 1.3.0), and in fullscreen
// it routes each click down the component tree to the Markdown holding the reply. Markdown has no
// mouse handler of its own, so stretchtext gives it one. This reaches into Pi's internals (the
// prototype and its private `cachedLines`) and is the part most likely to break with a new Pi.

import { Markdown } from "@earendil-works/pi-tui";
import type { TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";

import type { Option } from "./monad.ts";

/** What a left click at column `x` of a drawn line does, if anything is there to click. */
export type ClickAction = (line: string, x: number) => Option<() => void>;

type Clickable = { cachedLines?: string[]; handleMouse?: (event: TuiMouseEvent) => TuiMouseEventResult | undefined };

// Pi's reload runs the extension again over the same prototype: the handler is put in once, and a
// reload only swaps the action it calls.
const SLOT = Symbol.for("stretchtext.clickAction");
type Patched = Clickable & { [SLOT]?: { action: ClickAction } };

export function onMarkdownClick(action: ClickAction): void {
	const markdown = Markdown.prototype as unknown as Patched;
	const installed = markdown[SLOT];
	if (installed) {
		installed.action = action;
		return;
	}
	const slot = { action };
	markdown[SLOT] = slot;
	const previous = markdown.handleMouse;
	markdown.handleMouse = function (this: Clickable, event: TuiMouseEvent) {
		// Fullscreen Pi sends a click only to the component that took the press before it (as of Pi
		// 1.3.0); a press it does not take starts a text selection instead.
		const isLeft = (event.type === "press" || event.type === "click") && event.button === "left";
		const line = this.cachedLines?.[event.y];
		if (!isLeft || line === undefined) return previous?.call(this, event);
		return slot.action(line, event.x).match({
			some: (act) => {
				if (event.type === "click") act();
				return { handled: true, render: false };
			},
			none: () => previous?.call(this, event),
		});
	};
}
