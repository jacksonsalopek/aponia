import { FSWatcher, watch } from "fs";
import { join } from "path";
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
import { copyFile, mkdir, readdir, rm } from "fs/promises";
import pino from "pino";

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
  fn: AponiaRouteHandlerFn;
  state?: AponiaState[];
  hooks?: AponiaHooks;
  decorators?: AponiaDecorator[];
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
  derivedState?: AponiaDerivedState[];
  logLevel?: pino.LevelWithSilentOrString;
};

export type AponiaBuildOptions = {
  srcDir: string;
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
  static logger: ReturnType<typeof pino> = pino({
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
      },
    },
    level: "info",
  });

  constructor(options: AponiaOptions = {}) {
    Aponia.logger = pino({
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
        },
      },
      level: options.logLevel ?? "info",
    });
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
      for (const plugin of this.options.plugins) {
        this.app.use(plugin as ElysiaAsyncPlugin);
      }
    }
    if (this.options.derivedState) {
      for (const dsFn of this.options.derivedState) {
        this.app.derive(dsFn);
      }
    }
    if (Bun.env.NODE_ENV !== "production") {
      // watch filesytem for changes in development
      Aponia.logger.info("Watching filesystem for changes...");
      this.watcher = watch(this.routesDir, { recursive: true }, () => {
        Aponia.logger.info("Filesystem change detected, reloading routes...");
        this.stop();
        this.fsr.reload();
        this.start();
      });
      process.on("SIGINT", () => {
        // close watcher when Ctrl-C is pressed
        Aponia.logger.info("Shutting down filesystem watcher...");
        this.watcher?.close();

        process.exit(0);
      });
    }
  }

  async start() {
    const promises = Object.keys(this.fsr.routes).map(async (route) => {
      Aponia.logger.debug(`Loading route: ${route}...`);
      const matchedRouteHandler = this.fsr.match(route);
      if (!matchedRouteHandler) {
        throw new Error(`Couldn't match route: ${route}!`);
      }
      Aponia.logger.debug(`Matched route: ${route}`);

      let module: { handler: AponiaRouteHandler } | undefined = undefined;
      Aponia.logger.debug(
        `Matched route filePath: ${matchedRouteHandler.filePath}`,
      );

      await import(matchedRouteHandler.filePath).then((m) => {
        module = m;
      });
      if (!module) {
        throw new Error(`Module for route: ${route} not loaded!`);
      }

      module = module as { handler: AponiaRouteHandler };
      if (!module.handler) {
        throw new Error(`Couldn't find route handler for route: ${route}!`);
      }

      for (const method of Object.keys(module.handler)) {
        const key = (method as HTTPMethod).toLowerCase() as keyof Elysia;
        const { fn, hooks, state, decorators } =
          // biome-ignore lint/style/noNonNullAssertion: we've already checked for undefined
          module!.handler[method as HTTPMethod]!;
        if (!fn) throw new Error(`No handler function for route: ${route}!`);
        const elysiaRoute = this.transformRoute(route);
        Aponia.logger.debug(`Registering route: ${method} ${elysiaRoute}...`);

        try {
          if (state) {
            Aponia.logger.debug(
              `Registering state for ${method} ${elysiaRoute}, state: ${state}`,
            );
            for (const [key, value] of state) this.app.state(key, value);
          }
          if (decorators) {
            Aponia.logger.debug(
              `Registering decorators for ${method} ${elysiaRoute}, decorators: ${decorators}`,
            );
            for (const [key, value] of decorators)
              this.app.decorate(key, value);
          }
          if (hooks) {
            (this.app[key] as Fn)(elysiaRoute, fn, hooks);
          } else {
            (this.app[key] as Fn)(elysiaRoute, fn);
          }
        } catch (err) {
          Aponia.logger.error(
            `Error registering route: ${method} ${elysiaRoute}!`,
          );
          throw err;
        }
      }
    });

    const results = await Promise.allSettled(promises);
    const rejected = results.filter((result) => result.status === "rejected");
    if (rejected.length > 0) {
      Aponia.logger.error("Errors encountered while registering routes:");
      for (const result of rejected)
        Aponia.logger.error((result as PromiseRejectedResult).reason);
      throw new Error("Errors encountered while registering routes!");
    }
    Aponia.logger.debug({ msg: "Registered routes", routes: this.app.routes });
    this.app.listen(this.options.port ?? Bun.env.APONIA_PORT ?? 3000);
    return this.app;
  }

  async stop() {
    await this.app.stop();
  }

  transformRoute(route: string) {
    const wildcardRemoved = this.removeWildcard(route);
    const transformedRoute = wildcardRemoved.replace(/\[([^\]]+)\]/g, ":$1");
    if (this.options.basePath) {
      if (route === "/") return this.options.basePath;
      return `${this.options.basePath}${transformedRoute}`;
    }
    return transformedRoute;
  }

  removeWildcard(route: string) {
    const wildcardIndex = route.indexOf("[[...");
    if (wildcardIndex === -1) return route;
    return `${route.substring(0, wildcardIndex)}*`;
  }

  static async build(
    options: AponiaBuildOptions = {
      srcDir: `${process.cwd()}/src`,
      sourcemaps: false,
    },
  ) {
    Aponia.logger.info("Building Aponia...");
    const inputDir = options.srcDir ?? `${process.cwd()}/src`;

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

    Aponia.logger.info(`Transpiling routes (sourcemaps=${sourcemap})...`);
    await Aponia.copyAndTranspileDir(inputDir, outdir, sourcemap);
    Aponia.logger.info("Aponia build complete!");
  }

  static async copyAndTranspileDir(
    src: string,
    dest: string,
    sourcemap: "none" | "external" | "inline",
  ) {
    Aponia.logger.debug({ src, dest, sourcemap });

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
          Aponia.logger.info(
            `Transpiling file (sourcemaps=${sourcemap}): ${srcPath}`,
          );
          await Bun.build({
            entrypoints: [srcPath],
            external: ["*"],
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
