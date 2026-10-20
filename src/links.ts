// Each short form and « is an OSC 8 link whose address names the stretch, so a click on the drawn
// line finds it again after Markdown has wrapped it. The address has no http scheme, which Pi's
// Markdown would turn into a link of its own.

import { visibleWidth } from "@earendil-works/pi-tui";

import { Option } from "./monad.ts";
import { nameOf } from "./target.ts";
import type { Target } from "./target.ts";

const HREF = "stretchtext:";
const ANSI = /^\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|\[[0-9;?]*[ -/]*[@-~]|[@-Z\\-_])/;
const OSC8 = /^\x1b\]8;[^;]*;([^\x07\x1b]*)/;

/** The stretches drawn as links, each under a number its link's address carries. */
export class LinkTable {
	private readonly targets: Target[] = [];
	private readonly ids = new Map<string, number>();

	/** `text` as a link to `target`. */
	link(target: Target, text: string): string {
		const name = nameOf(target);
		const id = this.ids.get(name) ?? this.targets.push(target) - 1;
		this.ids.set(name, id);
		return `\x1b]8;;${HREF}${id}\x07${text}\x1b]8;;\x07`;
	}

	/** The stretch linked at column `x` of a drawn line. */
	at(line: string, x: number): Option<Target> {
		return addressAt(line, x)
			.filter((address) => address.startsWith(HREF))
			.flatMap((address) => Option.from(this.targets[Number(address.slice(HREF.length))]));
	}
}

/** The address of the OSC 8 link over column `x` of a drawn line, "" outside any link; none past the line's end. */
function addressAt(line: string, x: number): Option<string> {
	let column = 0;
	let address = "";
	for (let i = 0; i < line.length; ) {
		const ansi = line[i] === "\x1b" ? ANSI.exec(line.slice(i))?.[0] : undefined;
		if (ansi) {
			address = Option.from(OSC8.exec(ansi)).map((osc) => osc[1] ?? "").getOrElse(address);
			i += ansi.length;
			continue;
		}
		const char = String.fromCodePoint(line.codePointAt(i)!);
		const width = visibleWidth(char);
		if (x >= column && x < column + Math.max(width, 1)) return Option.some(address);
		column += width;
		i += char.length;
	}
	return Option.none;
}
