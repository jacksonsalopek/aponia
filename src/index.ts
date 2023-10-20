import Bun from "bun";
import Elysia, {
	type AfterRequestHandler,
	type Context,
	type ElysiaInstance,
	type HTTPMethod,
	type LocalHook,
	type TypedSchema,
	type TypedSchemaToRoute,
} from "elysia";
import { MergeSchema } from "elysia/dist/types";
import { FSWatcher, watch } from "fs";
import { copyFile, mkdir, readdir, rm } from "fs/promises";
import { join } from "path";

// biome-ignore lint/suspicious/noExplicitAny: functions can accept any args and return any type
export type Fn = (...args: any[]) => any;
export type AponiaAfterRequestHandler = AfterRequestHandler<
	// biome-ignore lint/suspicious/noExplicitAny: must use any type for Elysia
	// biome-ignore lint/complexity/noBannedTypes: must use {} type for Elysia
	TypedSchemaToRoute<MergeSchema<TypedSchema<string>, TypedSchema<any>>, {}>,
	ElysiaInstance
>;
export type AponiaHooks = LocalHook<TypedSchema<string>, ElysiaInstance>;
export type AponiaCtx = Context;
export type AponiaRouteHandlerFn<Res = unknown> = (ctx: AponiaCtx) => Res;
export type AponiaKey = string | number | symbol;
export type AponiaState = [AponiaKey, string];
// biome-ignore lint/suspicious/noExplicitAny: Elysia accepts any here
export type AponiaDecorator = [string, any];
export type AponiaDerivedState = (
	ctx: AponiaCtx,
) => ReturnType<Parameters<typeof Elysia.prototype.derive>[0]>;
export type AponiaRouteHandlerConfig = {
	handler: AponiaRouteHandlerFn;
	state?: AponiaState[];
	hooks?: AponiaHooks;
	decorators?: AponiaDecorator[];
	derivedState?: AponiaDerivedState[];
};
export type AponiaRouteHandler = {
	[key in HTTPMethod]?: AponiaRouteHandlerConfig;
};
export type ElysiaAsyncPlugin = Parameters<Elysia["use"]>[0];
export type AponiaPlugin =
	| ElysiaAsyncPlugin
	| Awaited<ElysiaAsyncPlugin>["default"];

export type AponiaOptions = {
	routesDir?: string;
	basePath?: string;
	port?: number;
	origin?: string;
	plugins?: AponiaPlugin[];
};

export type AponiaBuildOptions = {
	routesDir: string;
	outDir?: string;
	sourcemaps?: boolean;
};

export const APONIA_LOG_COLORS = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	underscore: "\x1b[4m",
	blink: "\x1b[5m",
	reverse: "\x1b[7m",
	hidden: "\x1b[8m",

	fg: {
		black: "\x1b[30m",
		red: "\x1b[31m",
		green: "\x1b[32m",
		yellow: "\x1b[33m",
		blue: "\x1b[34m",
		magenta: "\x1b[35m",
		cyan: "\x1b[36m",
		white: "\x1b[37m",
		crimson: "\x1b[38m", // more colors can be added by adding more codes
	},
	bg: {
		black: "\x1b[40m",
		red: "\x1b[41m",
		green: "\x1b[42m",
		yellow: "\x1b[43m",
		blue: "\x1b[44m",
		magenta: "\x1b[45m",
		cyan: "\x1b[46m",
		white: "\x1b[47m",
		crimson: "\x1b[48m",
	},
};

export class Aponia {
	app: Elysia;
	fsr: Bun.FileSystemRouter;
	options: AponiaOptions;
	routesDir: string;
	watcher?: FSWatcher;

	constructor(options: AponiaOptions = {}) {
		this.options = options;
		this.app = new Elysia();
		this.routesDir = this.options.routesDir ?? `${process.cwd()}/src/routes`;
		this.fsr = new Bun.FileSystemRouter({
			dir: this.routesDir,
			style: "nextjs",
			origin:
				this.options.origin ?? Bun.env.APONIA_ORIGIN ?? "http://localhost",
		});
		if (this.options.plugins) {
			this.options.plugins.forEach((plugin) =>
				this.app.use(plugin as ElysiaAsyncPlugin),
			);
		}
		if (Bun.env.NODE_ENV !== "production") {
			// watch filesytem for changes in development
			Aponia.log("Watching filesystem for changes...");
			this.watcher = watch(this.routesDir, { recursive: true }, () => {
				Aponia.log("Filesystem change detected, reloading routes...");
				this.stop();
				this.fsr.reload();
				this.start();
			});
			process.on("SIGINT", () => {
				// close watcher when Ctrl-C is pressed
				Aponia.log("Shutting down filesystem watcher...");
				this.watcher?.close();

				process.exit(0);
			});
		}
	}

	async start() {
		const promises = Object.keys(this.fsr.routes).map(async (route) => {
			Aponia.log(`Loading route: ${route}...`);
			const matchedRouteHandler = this.fsr.match(route);
			if (!matchedRouteHandler) {
				throw new Error(`Couldn't match route: ${route}!`);
			}
			Aponia.log(`Matched route: ${route}`);
			let module: { handler: AponiaRouteHandler } | undefined = undefined;
			await import(matchedRouteHandler.filePath).then((m) => {
				module = m;
			});
			if (!module) {
				throw new Error(`Module for route: ${route} not loaded!`);
			}
			Aponia.log("Loaded module:", module);
			module = module as { handler: AponiaRouteHandler };
			if (!module.handler) {
				throw new Error(`Couldn't find route handler for route: ${route}!`);
			}

			Object.keys(module.handler).forEach((method) => {
				const key = (method as HTTPMethod).toLowerCase() as keyof Elysia;
				const { handler, hooks, state, decorators, derivedState } =
					// biome-ignore lint/style/noNonNullAssertion: we've already checked for undefined
					module!.handler[method as HTTPMethod]!;
				const elysiaRoute = this.transformRoute(route);
				Aponia.log(`Registering route: ${method} ${elysiaRoute}...`);

				try {
					if (state) {
						Aponia.log(
							`Registering state for ${method} ${elysiaRoute}, state: ${state}`,
						);
						state.forEach(([key, value]) => this.app.state(key, value));
					}
					if (decorators) {
						Aponia.log(
							`Registering decorators for ${method} ${elysiaRoute}, decorators: ${decorators}`,
						);
						decorators.forEach(([key, value]) => this.app.decorate(key, value));
					}
					if (derivedState) {
						Aponia.log(
							`Registering derived state for ${method} ${elysiaRoute}, derived state fns: ${derivedState.map(
								(fn) => fn.name,
							)}`,
						);
						derivedState.forEach((ds) => this.app.derive(ds));
					}
					(this.app[key] as Fn)(elysiaRoute, handler, hooks);
				} catch (err) {
					console.error(`Error registering route: ${method} ${elysiaRoute}!`);
					throw err;
				}
			});
		});

		const results = await Promise.allSettled(promises);
		const rejected = results.filter((result) => result.status === "rejected");
		if (rejected.length > 0) {
			console.error("Errors encountered while registering routes:");
			rejected.forEach((result) =>
				console.error((result as PromiseRejectedResult).reason),
			);
			throw new Error("Errors encountered while registering routes!");
		}
		this.app.listen(this.options.port ?? Bun.env.APONIA_PORT ?? 3000);
		return this.app;
	}

	async stop() {
		await this.app.stop();
	}

	transformRoute(route: string) {
		const transformedRoute = route.replace(/\[([^\]]+)\]/g, ":$1");
		if (this.options.basePath && route === "/") return this.options.basePath;
		else if (this.options.basePath)
			return `${this.options.basePath}${transformedRoute}`;
		return transformedRoute;
	}

	// biome-ignore lint/suspicious/noExplicitAny: this.log accepts any args
	static log(...data: any[]) {
		console.log(
			`${APONIA_LOG_COLORS.fg.cyan}[${Date.now()}]${APONIA_LOG_COLORS.reset} ${
				APONIA_LOG_COLORS.fg.magenta
			}[APONIA]${APONIA_LOG_COLORS.reset}`,
			...data,
		);
	}

	static async build(
		options: AponiaBuildOptions = {
			routesDir: `${process.cwd()}/src/routes`,
			sourcemaps: false,
		},
	) {
		Aponia.log("Building Aponia...");
		// remove
		const outdir = options.outDir ?? "./dist";
		await rm(outdir, { recursive: true, force: true });

		const sourcemap = options.sourcemaps ? "external" : "none";

		await Bun.build({
			entrypoints: ["./src/index.ts"],
			outdir,
			target: "bun",
			sourcemap,
		});

		Aponia.log(`Transpiling routes (sourcemaps=${sourcemap})...`);
		await Aponia.copyAndTranspileDir(
			options.routesDir,
			`${outdir}/routes`,
			sourcemap,
		);
		Aponia.log("Aponia build complete!");
	}

	static async copyAndTranspileDir(
		src: string,
		dest: string,
		sourcemap: "none" | "external" | "inline",
	) {
		// Ensure the destination directory exists
		await mkdir(dest, { recursive: true });

		// Read the source directory
		const entries = await readdir(src, { withFileTypes: true });

		// Iterate through each entry in the source directory
		for (const entry of entries) {
			const srcPath = join(src, entry.name);
			const destPath = join(dest, entry.name);

			if (entry.isDirectory()) {
				// If the entry is a directory, recursively copy it
				await Aponia.copyAndTranspileDir(srcPath, destPath, sourcemap);
			} else if (entry.isFile()) {
				// If the entry is a file, copy it
				if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
					// transpile the file
					Aponia.log(`Transpiling file (sourcemaps=${sourcemap}): ${srcPath}`);
					await Bun.build({
						entrypoints: [srcPath],
						outdir: dest,
						target: "bun",
						sourcemap,
					});
				} else {
					await copyFile(srcPath, destPath);
				}
			}
		}
	}
}
