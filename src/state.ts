// Everything stretchtext remembers, as one immutable record, and every change to it as a State.

import { Option, State } from "./monad.ts";
import { hueAfter } from "./palette.ts";
import { readNote } from "./prompt.ts";
import { nameIn, nameOf } from "./target.ts";
import type { Target } from "./target.ts";
import { drawnAs, isLinkable, parentOf, parse, stretches } from "./parse.ts";
import type { Segment, Stretch } from "./parse.ts";

const LETTERS = "asdfghjklqwertyuiopzxcvbnm";
/** How many of the latest replies holding a stretch take letters, as in cc-stretch. */
const LETTERED_REPLIES = 3;

/** Whether letters are shown over closed stretches, to open one, or over open ones, to close one. */
export type Mode = "open" | "close";

/** The stretch growing or shrinking now, and how far it has got, from 0 (short form) to 1 (long form). */
export type Growth = { name: string; progress: number };

/** While letters show: the stretch each letter stands for, and the letter over each stretch by name. */
export type Lettering = { mode: Mode; byLetter: ReadonlyMap<string, Target>; byName: ReadonlyMap<string, string> };

export type StretchState = {
	/** Every reply text holding a stretch, in the order Pi first drew it. */
	replies: readonly string[];
	/**
	 * The open stretches by name, each with the count it was opened at, which picks its colour. A
	 * closing stretch stays here while it shrinks.
	 */
	open: ReadonlyMap<string, number>;
	/** How many stretches each reply has opened, by reply text. */
	opened: ReadonlyMap<string, number>;
	/** The stretch opened last, drawn in its colour's full form; the others are faded. */
	newest: Option<string>;
	growth: Option<Growth>;
	lettering: Option<Lettering>;
	/** Short forms opened since the model last answered, to tell it what the reader read. */
	read: ReadonlySet<string>;
	/** How many replies held a stretch when the model was last asked: those after it are its last reply. */
	repliesAtPrompt: number;
};

type Change<A = void> = State<StretchState, A>;

export const initialState: StretchState = {
	replies: [],
	open: new Map(),
	opened: new Map(),
	newest: Option.none,
	growth: Option.none,
	lettering: Option.none,
	read: new Set(),
	repliesAtPrompt: 0,
};

export const isOpen = (state: StretchState, reply: string, key: string) => state.open.has(nameIn(reply, key));

/** Notes a reply holding a stretch, the first time Pi draws it. */
export const remember = (reply: string): Change =>
	State.modify((s) => (s.replies.includes(reply) ? s : { ...s, replies: [...s.replies, reply] }));

/**
 * Opens a closed stretch or starts closing an open one, and yields whether it opens. A closing
 * stretch stays open until `settle` drops it, once it has shrunk.
 */
export const toggle = (target: Target): Change<boolean> =>
	State.gets((s: StretchState) => !s.open.has(nameOf(target))).tap((isOpening) =>
		isOpening ? open(target) : State.of(undefined),
	);

/** Opens a stretch in the next colour of its reply, never the colour of the stretch holding it. */
const open = (target: Target): Change =>
	State.modify((s) => {
		const name = nameOf(target);
		const parent = parentOf(target.stretch.key).flatMap((key) => Option.from(s.open.get(nameIn(target.reply, key))));
		const hue = hueAfter(s.opened.get(target.reply) ?? 0, parent);
		return {
			...s,
			open: withEntry(s.open, name, hue),
			opened: withEntry(s.opened, target.reply, hue + 1),
			newest: Option.some(name),
			read: new Set(s.read).add(target.stretch.short.trim()),
		};
	});

export const setGrowth = (name: string, progress: number): Change =>
	State.modify((s) => ({ ...s, growth: Option.some({ name, progress }) }));

/** Ends a stretch's growth: an opening one stays open, a closing one is closed. */
export const settle = (target: Target, isOpening: boolean): Change =>
	State.modify((s) => {
		const name = nameOf(target);
		return {
			...s,
			open: isOpening ? s.open : withoutEntry(s.open, name),
			growth: s.growth.filter((growth) => growth.name !== name),
		};
	});

/** Puts letters over the stretches `mode` acts on in the latest replies, and yields whether there were any. */
export const startLettering = (mode: Mode): Change<boolean> =>
	State.gets((s: StretchState) => letteringFor(s, mode)).flatMap((lettering) =>
		lettering.byLetter.size === 0
			? State.of(false)
			: State.modify((s: StretchState) => ({ ...s, lettering: Option.some(lettering) })).map(() => true),
	);

/** Takes the letters away, and yields the stretch the typed `key` stands for, if any. */
export const pickLetter = (key: string): Change<Option<Target>> =>
	State.gets((s: StretchState) => s.lettering.flatMap((lettering) => Option.from(lettering.byLetter.get(key)))).tap(
		() => State.modify((s) => ({ ...s, lettering: Option.none })),
	);

/**
 * The note telling the model which stretches of its last reply the reader opened, if it wrote any,
 * and starts counting again for the next reply.
 */
export const takeReadNote = (): Change<Option<string>> =>
	State.gets(readNoteFor).tap(() => State.modify((s) => ({ ...s, read: new Set(), repliesAtPrompt: s.replies.length })));

function readNoteFor(state: StretchState): Option<string> {
	const written = state.replies
		.slice(state.repliesAtPrompt)
		.flatMap((reply) => stretches(parse(reply)).filter(isLinkable))
		.map((stretch) => stretch.short.trim());
	const opened = [...state.read];
	if (opened.length === 0 && written.length === 0) return Option.none;
	return Option.some(readNote(opened, written.filter((short) => !state.read.has(short))));
}

function letteringFor(state: StretchState, mode: Mode): Lettering {
	const byLetter = new Map<string, Target>();
	const byName = new Map<string, string>();
	state.replies
		.slice(-LETTERED_REPLIES)
		.flatMap((reply) => reachable(state, reply, parse(reply)).map((stretch) => ({ reply, stretch })))
		.filter((target) => isLinkable(target.stretch) && isOpen(state, target.reply, target.stretch.key) === (mode === "close"))
		.slice(0, LETTERS.length)
		.forEach((target, i) => {
			byLetter.set(LETTERS[i]!, target);
			byName.set(nameOf(target), LETTERS[i]!);
		});
	return { mode, byLetter, byName };
}

/** The stretches a reader can reach in `segments`: those not inside a closed one, outermost first. */
function reachable(state: StretchState, reply: string, segments: readonly Segment[]): Stretch[] {
	return segments.flatMap((segment) => {
		if (typeof segment === "string") return [];
		const isShown = drawnAs(segment) === "open" || isOpen(state, reply, segment.key);
		return [segment, ...(isShown ? reachable(state, reply, segment.long.getOrElse([])) : [])];
	});
}

const withEntry = <K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> => new Map(map).set(key, value);

function withoutEntry<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
	const next = new Map(map);
	next.delete(key);
	return next;
}
