// How a reply marks its stretches. `{{short|long}}` is a stretch: the reader sees `short`, and opening
// it puts `long` in its place; `long` may hold further stretches. Code spans and fences are copied as
// written, so braces in code never open a stretch. A port of cc-stretch's hooks/parse.ts.
// Copyright (c) 2026 pro-vi, MIT License: https://github.com/pro-vi/cc-stretch

import { Option } from "./monad.ts";

export type Segment = string | Stretch;

export type Stretch = {
	/**
	 * Names the stretch by its trimmed short form, each line break in it written ↵, and its parents'
	 * (`cache › key`), so a stretch added elsewhere in the reply leaves every other key as it was. A
	 * short form repeated among siblings takes `~2`, `~3`. "" when no `|` was written.
	 */
	readonly key: string;
	readonly short: string;
	/** None when no `|` was written: then there is nothing to open, and `short` is plain text. */
	readonly long: Option<readonly Segment[]>;
	/** False while the reply streams and the closing braces have not arrived. */
	readonly isClosed: boolean;
};

/** The marks a stretch is written with. Where a mark means nothing, it is text. */
type Mark = "{{" | "|" | "}}";

/** A mark, or text up to the next one, code copied as written included. */
type Lexeme = Mark | { text: string };

/** What was read, and the index of the first lexeme after it. */
type Read<A> = readonly [A, number];

const MARKS: readonly Mark[] = ["{{", "|", "}}"];
const KEY_SEPARATOR = " › ";

export function parse(text: string): Segment[] {
	const [{ segments }] = readLong(lex(text), 0, Option.none);
	return segments;
}

/** Every stretch, outermost first, in the order the reply writes them. */
export function stretches(segments: readonly Segment[]): Stretch[] {
	return segments.flatMap((segment) =>
		typeof segment === "string" ? [] : [segment, ...stretches(segment.long.getOrElse([]))],
	);
}

/** The key of the stretch holding the one keyed `key`, none when no stretch holds it. */
export function parentOf(key: string): Option<string> {
	const at = key.lastIndexOf(KEY_SEPARATOR);
	return at === -1 ? Option.none : Option.some(key.slice(0, at));
}

/** Whether a stretch is drawn as a link: openable, with its short form on one line, as a link cannot span lines. */
export function isLinkable(stretch: Stretch): boolean {
	return isOpenable(stretch) && !stretch.short.includes("\n");
}

/**
 * How the terminal draws a stretch: as plain text when there is nothing to open, already open when
 * its short form spans lines, otherwise as a link.
 */
export function drawnAs(stretch: Stretch): "text" | "open" | "link" {
	if (!isOpenable(stretch)) return "text";
	return isLinkable(stretch) ? "link" : "open";
}

const isOpenable = (stretch: Stretch) => stretch.isClosed && stretch.long.isSome;

/**
 * The segments from lexeme `at` on, to the `}}` closing the stretch keyed `parent`, or to the end
 * for the reply itself, which no `}}` closes. A `|` here is text.
 */
function readLong(lexemes: Lexeme[], at: number, parent: Option<string>): Read<{ segments: Segment[]; isClosed: boolean }> {
	const segments: Segment[] = [];
	const siblings = new Map<string, number>();
	for (let i = at; i < lexemes.length; ) {
		const lexeme = lexemes[i]!;
		if (lexeme === "}}" && parent.isSome) return [{ segments, isClosed: true }, i + 1];
		if (lexeme === "{{") {
			const [stretch, stop] = readStretch(lexemes, i + 1, parent, siblings);
			segments.push(stretch);
			i = stop;
			continue;
		}
		const last = segments.at(-1);
		if (typeof last === "string") segments[segments.length - 1] = last + textOf(lexeme);
		else segments.push(textOf(lexeme));
		i++;
	}
	return [{ segments, isClosed: false }, lexemes.length];
}

/** The stretch whose `{{` stands before lexeme `at`. Its short form reads to a `|` or `}}`; a `{{` there is text. */
function readStretch(lexemes: Lexeme[], at: number, parent: Option<string>, siblings: Map<string, number>): Read<Stretch> {
	let short = "";
	for (let i = at; i < lexemes.length; i++) {
		const lexeme = lexemes[i]!;
		if (lexeme === "}}") return [{ key: "", short, long: Option.none, isClosed: true }, i + 1];
		if (lexeme === "|") {
			const key = keyOf(short, parent, siblings);
			const [{ segments, isClosed }, stop] = readLong(lexemes, i + 1, Option.some(key));
			return [{ key, short, long: Option.some(segments), isClosed }, stop];
		}
		short += textOf(lexeme);
	}
	return [{ key: "", short, long: Option.none, isClosed: false }, lexemes.length];
}

const textOf = (lexeme: Lexeme) => (typeof lexeme === "string" ? lexeme : lexeme.text);

function keyOf(short: string, parent: Option<string>, siblings: Map<string, number>): string {
	// A line break in a key would split the link's address across rows; ↵ keeps the key apart from
	// the same words on one line, which a space would not.
	const name = short.trim().replaceAll("\n", "↵");
	const seen = (siblings.get(name) ?? 0) + 1;
	siblings.set(name, seen);
	const own = seen === 1 ? name : `${name}~${seen}`;
	return parent.map((key) => `${key}${KEY_SEPARATOR}${own}`).getOrElse(own);
}

function lex(text: string): Lexeme[] {
	const lexemes: Lexeme[] = [];
	for (let at = 0; at < text.length; ) {
		const [lexeme, stop] = lexemeAt(text, at);
		const last = lexemes.at(-1);
		if (typeof lexeme !== "string" && typeof last === "object") lexemes[lexemes.length - 1] = { text: last.text + lexeme.text };
		else lexemes.push(lexeme);
		at = stop;
	}
	return lexemes;
}

/** The lexeme starting at character `at`, and where it stops. */
function lexemeAt(text: string, at: number): readonly [Lexeme, number] {
	return codeEnd(text, at)
		.map((stop): readonly [Lexeme, number] => [{ text: text.slice(at, stop) }, stop])
		.orElse(() =>
			Option.from(MARKS.find((mark) => text.startsWith(mark, at))).map((mark): readonly [Lexeme, number] => [mark, at + mark.length]),
		)
		.getOrElse([{ text: text[at]! }, at + 1]);
}

/** Where code starting at `at` ends: a fence opening a line, or a code span. */
function codeEnd(text: string, at: number): Option<number> {
	const fence: Option<number> = at === 0 || text[at - 1] === "\n" ? fenceEnd(text, at) : Option.none;
	return fence.orElse(() => (text[at] === "`" ? Option.some(codeSpanEnd(text, at)) : Option.none));
}

/** Where the code span at `at` stops: past the next run of as many backticks, or at the text's end. */
function codeSpanEnd(text: string, at: number): number {
	const run = /^`+/.exec(text.slice(at))?.[0] ?? "`";
	const end = text.indexOf(run, at + run.length);
	return end === -1 ? text.length : end + run.length;
}

/** Where a fenced code block opening at `start` ends (past its closing line), none when no fence opens there. */
function fenceEnd(text: string, start: number): Option<number> {
	const lineEnd = (from: number) => {
		const end = text.indexOf("\n", from);
		return end === -1 ? text.length : end;
	};
	return openingFence(text.slice(start, lineEnd(start))).map((fence) => {
		for (let at = lineEnd(start) + 1; at < text.length; at = lineEnd(at) + 1) {
			if (closesFence(text.slice(at, lineEnd(at)), fence)) return Math.min(lineEnd(at) + 1, text.length);
		}
		return text.length;
	});
}

/** The marker `line` opens a code fence with, such as ``` or ~~~, none when it opens none. */
const openingFence = (line: string) => Option.from(/^[ \t]*(`{3,}|~{3,})/.exec(line)?.[1]);

/** Whether `line` closes the code fence `fence` opened: trimmed, it is only the fence's character, repeated at least as often. */
function closesFence(line: string, fence: string): boolean {
	const trimmed = line.trim();
	return trimmed.startsWith(fence) && trimmed === fence.charAt(0).repeat(trimmed.length);
}
