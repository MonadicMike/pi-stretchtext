// The two monads stretchtext is written with. Option replaces `T | undefined` wherever a lookup may
// find nothing; State describes a change to the extension's state as a value, which Store runs.

/** A value that may be missing. */
export class Option<A> {
	private constructor(
		private readonly value: A | undefined,
		readonly isSome: boolean,
	) {}

	static some<A>(value: A): Option<A> {
		return new Option(value, true);
	}

	static readonly none: Option<never> = new Option<never>(undefined, false);

	/** Some for a value, none for `undefined` or `null`. */
	static from<A>(value: A | undefined | null): Option<A> {
		return value === undefined || value === null ? Option.none : Option.some(value);
	}

	map<B>(f: (value: A) => B): Option<B> {
		return this.isSome ? Option.some(f(this.value as A)) : Option.none;
	}

	flatMap<B>(f: (value: A) => Option<B>): Option<B> {
		return this.isSome ? f(this.value as A) : Option.none;
	}

	filter(predicate: (value: A) => boolean): Option<A> {
		return this.isSome && predicate(this.value as A) ? this : Option.none;
	}

	orElse<B>(other: () => Option<B>): Option<A | B> {
		return this.isSome ? this : other();
	}

	getOrElse<B>(fallback: B): A | B {
		return this.isSome ? (this.value as A) : fallback;
	}

	match<B>(cases: { some: (value: A) => B; none: () => B }): B {
		return this.isSome ? cases.some(this.value as A) : cases.none();
	}

	/** Runs `f` on the value, if there is one. */
	forEach(f: (value: A) => void): void {
		if (this.isSome) f(this.value as A);
	}

	/** Whether there is a value and it is `other`. */
	is(other: A): boolean {
		return this.isSome && this.value === other;
	}
}

/** A change to a state of type `S` that also yields a result of type `A`. */
export class State<S, A> {
	constructor(readonly run: (state: S) => readonly [A, S]) {}

	static of<S, A>(value: A): State<S, A> {
		return new State((state) => [value, state]);
	}

	/** Reads the state without changing it. */
	static gets<S, A>(f: (state: S) => A): State<S, A> {
		return new State((state) => [f(state), state]);
	}

	/** Changes the state and yields nothing. */
	static modify<S>(f: (state: S) => S): State<S, void> {
		return new State((state) => [undefined, f(state)]);
	}

	map<B>(f: (value: A) => B): State<S, B> {
		return new State((state) => {
			const [value, next] = this.run(state);
			return [f(value), next];
		});
	}

	flatMap<B>(f: (value: A) => State<S, B>): State<S, B> {
		return new State((state) => {
			const [value, next] = this.run(state);
			return f(value).run(next);
		});
	}

	/** Runs `next` after this one, keeping this one's result. */
	tap(next: (value: A) => State<S, unknown>): State<S, A> {
		return this.flatMap((value) => next(value).map(() => value));
	}
}

/** Holds a state and runs changes on it, telling `onChange` whenever one changed something. */
export class Store<S> {
	constructor(
		private state: S,
		private readonly onChange: () => void,
	) {}

	get current(): S {
		return this.state;
	}

	run<A>(change: State<S, A>): A {
		const [value, next] = change.run(this.state);
		if (next !== this.state) {
			this.state = next;
			this.onChange();
		}
		return value;
	}
}
