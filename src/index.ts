import Bun from "bun";
import Elysia, {
	AfterRequestHandler,
	Context,
	ElysiaInstance,
	HTTPMethod,
	LocalHook,
	TypedSchema,
	TypedSchemaToRoute,
} from "elysia";
import { MergeSchema } from "elysia/dist/types";

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
export type AponiaRouteHandler = {
	[key in HTTPMethod]?:
		| [AponiaRouteHandlerFn]
		| [AponiaRouteHandlerFn, AponiaHooks]
		| [
				AponiaRouteHandlerFn,
				AponiaHooks | undefined,
				AponiaState[] | undefined,
				AponiaDecorator[] | undefined,
		  ];
};
export type AponiaOptions = {
	basePath?: string;
	port?: number;
	origin?: string;
};

export class Aponia {
	app: Elysia;
	fsr: Bun.FileSystemRouter;
	options: AponiaOptions;

	constructor(options: AponiaOptions = {}) {
		this.options = options;
		this.app = new Elysia();
		this.fsr = new Bun.FileSystemRouter({
			dir: `${process.cwd()}/src/routes`,
			style: "nextjs",
			origin:
				this.options.origin ?? Bun.env.APONIA_ORIGIN ?? "http://localhost",
		});
	}

	async start() {
		const promises = Object.keys(this.fsr.routes).map(async (route) => {
			console.info(`Loading route: ${route}...`);
			const matchedRouteHandler = this.fsr.match(route);
			if (!matchedRouteHandler) {
				throw new Error(`Couldn't match route: ${route}!`);
			}
			console.info(`Matched route: ${route}`);
			let module: { handler: AponiaRouteHandler } | undefined = undefined;
			await import(matchedRouteHandler.filePath).then((m) => {
				module = m;
			});
			if (!module) {
				throw new Error(`Module for route: ${route} not loaded!`);
			}
			console.info(`Loaded module: ${module}`);
			module = module as { handler: AponiaRouteHandler };
			if (!module.handler) {
				throw new Error(`Couldn't find route handler for route: ${route}!`);
			}

			Object.keys(module.handler).forEach((method) => {
				const key = (method as HTTPMethod).toLowerCase() as keyof Elysia;
				const [fn, hooks, state, decorators] =
					// biome-ignore lint/style/noNonNullAssertion: we've already checked for undefined
					module!.handler[method as HTTPMethod]!;
				const elysiaRoute = this.transformRoute(route);
				console.info(`Registering route: ${method} ${elysiaRoute}...`);

				try {
					if (state) {
						console.log(
							`Registering state for ${method} ${elysiaRoute}, state: ${state}`,
						);
						state.forEach(([key, value]) => this.app.state(key, value));
					}
					if (decorators) {
						console.log(
							`Registering decorators for ${method} ${elysiaRoute}, decorators: ${decorators}`,
						);
						decorators.forEach(([key, value]) => this.app.decorate(key, value));
					}
					(this.app[key] as Fn)(elysiaRoute, fn, hooks);
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

	transformRoute(route: string) {
		const transformedRoute = route.replace(/\[([^\]]+)\]/g, ":$1");
		if (this.options.basePath && route === "/") return this.options.basePath;
		else if (this.options.basePath)
			return `${this.options.basePath}${transformedRoute}`;
		return transformedRoute;
	}
}
