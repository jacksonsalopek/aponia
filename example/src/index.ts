import { Aponia } from "aponia";
import { performance } from "perf_hooks";

const start = performance.now();
const app = new Aponia({ basePath: "api" });

await app.start().then(
	(instance) => {
		const end = performance.now();
		const timeToStart = end - start;
		console.log(
			`🐎 Aponia started: ${instance.server?.hostname}:${instance.server?.port} (${timeToStart}ms)`,
		);
	},
	(reason) => console.error(`Couldn't boostrap Aponia!\nreason: ${reason}`),
);
