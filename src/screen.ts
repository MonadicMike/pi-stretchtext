import type { Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

import { Option } from "./monad.ts";

/**
 * Pi's TUI and theme, held once a component hands them over, so a state change can redraw the
 * transcript in the theme's colours. Redraws asked for in one tick run once, after it, so a redraw
 * asked for while Pi draws waits.
 */
export class Screen {
	private tui: Option<TUI> = Option.none;
	private isRedrawPending = false;
	theme: Option<Theme> = Option.none;

	/** Replies drawn before the theme arrived have no colour, so the first one redraws them. */
	attach(tui: TUI, theme: Theme): void {
		const isFirstTheme = !this.theme.isSome;
		this.tui = Option.some(tui);
		this.theme = Option.some(theme);
		if (isFirstTheme) this.redraw();
	}

	redraw(): void {
		if (this.isRedrawPending) return;
		this.isRedrawPending = true;
		queueMicrotask(() => {
			this.isRedrawPending = false;
			this.tui.forEach((tui) => {
				tui.invalidate();
				tui.requestRender();
			});
		});
	}
}
