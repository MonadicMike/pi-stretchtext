import { Option } from "./monad.ts";

const FRAME_MS = 30;

export type Animation = {
	from: number;
	to: number;
	seconds: number;
	/** Called on each frame with the progress, from `from` to `to`. */
	frame: (progress: number) => void;
	/** Called once, when the animation ends or another takes its place. */
	done: () => void;
};

/** Runs one animation at a time: starting another lands the running one where it stands. */
export class Animator {
	private finishRunning: Option<() => void> = Option.none;

	run(animation: Animation): void {
		this.stop();
		const start = Date.now();
		const timer = setInterval(() => {
			const t = (Date.now() - start) / (animation.seconds * 1000);
			if (t >= 1) finish();
			else animation.frame(animation.from + (animation.to - animation.from) * t);
		}, FRAME_MS);
		const finish = () => {
			clearInterval(timer);
			this.finishRunning = Option.none;
			animation.done();
		};
		this.finishRunning = Option.some(finish);
		animation.frame(animation.from);
	}

	stop(): void {
		this.finishRunning.forEach((finish) => finish());
	}
}
