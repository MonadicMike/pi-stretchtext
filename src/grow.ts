// How a long form grows around its short form. A port of cc-stretch's hooks/grow.ts, with
// `breakables` from its hooks/layout.ts. Copyright (c) 2026 pro-vi, MIT License: https://github.com/pro-vi/cc-stretch
//
// A word here is a piece a row may break between (`breakables`), so Chinese grows a character at a
// time, with the punctuation that sticks to it. The short form's words, found in the long form in
// order, are anchors and never move; the words between them arrive from the anchors outward, so the
// sentence widens at every seam at once, to the left of an anchor as much as to its right. Words
// arrive whole: a terminal has no room to fade one in, and half a word reads as a typo.

import { Option } from "./monad.ts";
import type { Segment, Stretch } from "./parse.ts";

type Token = { kind: "word" | "space"; text: string } | { kind: "nested"; stretch: Stretch };

/** A word or a run of spaces of the long form, or a nested stretch. */
type Atom = string | Stretch;

/** The long form cut at its anchors: each anchor, and each run of atoms between two of them. */
type Piece = { kind: "anchor"; atom: Atom } | { kind: "run"; atoms: Atom[] };

/** Where a run of new words sits relative to the anchors around it. */
type Side = "before" | "between" | "after";

/** A word of the long form, by the index of the token holding it. */
type Placed = { token: number; word: string };

/** A mark drawn on the letter before it, or a character no terminal draws, such as a joiner. */
const ZERO_WIDTH = /[\p{Mn}\p{Me}\p{Default_Ignorable_Code_Point}]/u;
/** Scripts written without spaces, where a row may break between any two characters. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}　-〿＀-￯]/u;
/** Scripts written without spaces whose words only a dictionary finds. */
const SEGMENTED = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
/** Characters a row may not start with. */
const NO_START = /[\p{Pe}\p{Pf},.:;!?，。、；：？！…·ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶーゝゞヽヾ々]/u;
/** Characters a row may not end with. */
const NO_END = /[\p{Ps}\p{Pi}]/u;
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: "word" });

/**
 * The long form at `progress`: 0 shows only the anchors, 1 shows all of it. `draw` writes a nested
 * stretch, which is never shown in part; `paint` marks each word the long form adds, so the reader
 * can tell it from the words they already read.
 */
export function grow(
	short: string,
	long: readonly Segment[],
	progress: number,
	draw: (nested: Stretch) => string,
	paint: (word: string) => string = (word) => word,
): string {
	const tokens = tokenize(long);
	const pieces = piecesOf(tokens, anchorsOf(short, tokens));
	const added = (atom: Atom) => (typeof atom !== "string" ? draw(atom) : /\S/.test(atom) ? paint(atom) : atom);
	return pieces
		.map((piece, i) => {
			if (piece.kind === "anchor") return typeof piece.atom === "string" ? piece.atom : draw(piece.atom);
			// Runs never touch, so a piece before or after a run is an anchor.
			return reveal(piece.atoms, sideOf(i > 0, i < pieces.length - 1), progress).map(added).join("");
		})
		.join("");
}

/** How many words and nested stretches a growth adds, to pace it. */
export function lengthOf(long: readonly Segment[]): number {
	return tokenize(long).filter((token) => token.kind !== "space").length;
}

function piecesOf(tokens: Token[], anchors: ReadonlySet<number>): Piece[] {
	const pieces: Piece[] = [];
	tokens.forEach((token, i) => {
		const atom = token.kind === "nested" ? token.stretch : token.text;
		const last = pieces.at(-1);
		if (anchors.has(i) && token.kind !== "space") pieces.push({ kind: "anchor", atom });
		else if (last?.kind === "run") last.atoms.push(atom);
		else pieces.push({ kind: "run", atoms: [atom] });
	});
	return pieces;
}

const sideOf = (hasAnchorBefore: boolean, hasAnchorAfter: boolean): Side =>
	hasAnchorBefore && hasAnchorAfter ? "between" : hasAnchorAfter ? "before" : "after";

const isSpace = (atom: Atom | undefined) => typeof atom === "string" && /^\s+$/.test(atom);

/** The atoms of `run` shown at `progress`, arriving from the anchors on `side` of it. */
function reveal(run: Atom[], side: Side, progress: number): Atom[] {
	// Two anchors stay a space apart from the start, as they stood in the short form.
	if (side === "between" && run.length > 1 && isSpace(run[0]) && isSpace(run.at(-1))) {
		const middle = reveal(run.slice(1, -1), side, progress);
		return middle.length === 0 ? [run[0]!] : [run[0]!, ...middle, run.at(-1)!];
	}
	if (side === "between" && isSpace(run[0])) return [run[0]!, ...reveal(run.slice(1), side, progress)];

	const count = Math.round(run.length * Math.min(1, Math.max(0, progress)));
	if (side === "after") return run.slice(0, count);
	if (side === "before") return run.slice(run.length - count);

	const left = run.slice(0, Math.ceil(count / 2));
	const right = run.slice(run.length - Math.floor(count / 2));
	if (left.length + right.length === run.length) return [...left, ...right];
	// The two halves meet where words are still missing: exactly one space between them. The space
	// is added only where the long form has one beside the gap; a gap between Chinese characters
	// joins without one, as the finished text reads.
	const isGapSpaced = isSpace(run[left.length]) || isSpace(run[run.length - right.length - 1]);
	if (isSpace(left.at(-1)) && isSpace(right[0])) return [...left, ...right.slice(1)];
	if (!isSpace(left.at(-1)) && !isSpace(right[0]) && left.length > 0 && right.length > 0 && isGapSpaced) {
		return [...left, " ", ...right];
	}
	return [...left, ...right];
}

function tokenize(long: readonly Segment[]): Token[] {
	return long.flatMap((part): Token[] =>
		typeof part === "string"
			? part
					.split(/(\s+)/)
					.filter((text) => text !== "")
					.flatMap((text): Token[] =>
						/^\s+$/.test(text) ? [{ kind: "space", text }] : breakables(text).map((word) => ({ kind: "word", text: word })),
					)
			: [{ kind: "nested", stretch: part }],
	);
}

/**
 * One part of a line split at spaces, cut into the pieces a row may break between and growth adds
 * one at a time; a run of spaces stays whole.
 */
function breakables(text: string): string[] {
	// Nothing below Thai breaks, so a Latin word or a run of spaces comes back whole without a look at
	// each character.
	if (!/[^\0-෿]/.test(text)) return [text];
	const wordStarts = new Set<number>();
	if (SEGMENTED.test(text)) for (const word of SEGMENTER.segment(text)) wordStarts.add(word.index);
	const pieces: string[] = [];
	let piece = "";
	let last = "";
	let isAfterUnspaced = false;
	let at = 0;
	for (const char of text) {
		const isUnspaced = UNSPACED.test(char);
		const isWordStart = wordStarts.has(at) && SEGMENTED.test(last + char);
		const mayBreak = isUnspaced || isAfterUnspaced || isWordStart;
		if (piece !== "" && mayBreak && !NO_START.test(char) && !NO_END.test(last) && !ZERO_WIDTH.test(char)) {
			pieces.push(piece);
			piece = "";
		}
		piece += char;
		last = char;
		isAfterUnspaced = isUnspaced || (isAfterUnspaced && NO_START.test(char));
		at += char.length;
	}
	if (piece !== "") pieces.push(piece);
	return pieces;
}

/**
 * The token indexes of the long form that carry the short form's words, as many as can be kept in
 * order. A nested stretch shows its own short form, so its words count where it stands.
 */
function anchorsOf(short: string, tokens: Token[]): ReadonlySet<number> {
	const want = wordsIn(short).map(bare).filter((word) => word !== "");
	const have = tokens.flatMap((token, i): Placed[] =>
		wordsOf(token)
			.map(bare)
			.filter((word) => word !== "")
			.map((word) => ({ token: i, word })),
	);
	const anchors = new Set(inOrder(want, have).match({ some: (found) => found, none: () => longestCommon(want, have) }));

	// Punctuation standing on its own right after an anchor (`{{...}}.`) belongs to that anchor.
	let last = -1;
	tokens.forEach((token, i) => {
		if (token.kind === "space") return;
		if (token.kind === "word" && bare(token.text) === "" && anchors.has(last)) anchors.add(i);
		last = i;
	});
	return anchors;
}

const wordsIn = (text: string) => text.split(/\s+/).flatMap(breakables);

const wordsOf = (token: Token) => (token.kind === "word" ? [token.text] : token.kind === "nested" ? wordsIn(token.stretch.short) : []);

/**
 * The tokens carrying the earliest match of each wanted word, none when some word finds no place.
 * The guide asks the long form to keep every word of the short form, in order, and when it does,
 * these are already the longest common subsequence: a Chinese long form, with a word per
 * character, never pays for the table `longestCommon` builds.
 */
function inOrder(want: string[], have: Placed[]): Option<number[]> {
	const found: number[] = [];
	for (const { token, word } of have) {
		if (found.length === want.length) break;
		if (word === want[found.length]) found.push(token);
	}
	return found.length === want.length ? Option.some(found) : Option.none;
}

/** The tokens carrying the most wanted words that can be kept in order, a longest common subsequence. */
function longestCommon(want: string[], have: Placed[]): number[] {
	// lengths[i][j]: the longest common run of want[i..] and have[j..].
	const lengths = Array.from({ length: want.length + 1 }, () => new Array<number>(have.length + 1).fill(0));
	for (let i = want.length - 1; i >= 0; i--) {
		for (let j = have.length - 1; j >= 0; j--) {
			lengths[i]![j] = want[i] === have[j]!.word ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
		}
	}
	const found: number[] = [];
	for (let i = 0, j = 0; i < want.length && j < have.length; ) {
		if (want[i] === have[j]!.word) {
			found.push(have[j]!.token);
			i++;
			j++;
		} else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i++;
		else j++;
	}
	return found;
}

/** A word without its surrounding punctuation or markdown marks, lowercased, so `cache.` meets `**cache**`. */
const bare = (word: string) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
