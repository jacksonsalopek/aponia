// @bun
// src/index.ts
import {watch} from "fs";
import {join} from "path";
import Elysia from "elysia";
import {copyFile, mkdir, readdir, rm} from "fs/promises";
import pino from "pino";
var APONIA_LOG_COLORS = {
  reset: "\x1B[0m",
  bright: "\x1B[1m",
  dim: "\x1B[2m",
  underscore: "\x1B[4m",
  blink: "\x1B[5m",
  reverse: "\x1B[7m",
  hidden: "\x1B[8m",
  fg: {
    black: "\x1B[30m",
    red: "\x1B[31m",
    green: "\x1B[32m",
    yellow: "\x1B[33m",
    blue: "\x1B[34m",
    magenta: "\x1B[35m",
    cyan: "\x1B[36m",
    white: "\x1B[37m",
    crimson: "\x1B[38m"
  },
  bg: {
    black: "\x1B[40m",
    red: "\x1B[41m",
    green: "\x1B[42m",
    yellow: "\x1B[43m",
    blue: "\x1B[44m",
    magenta: "\x1B[45m",
    cyan: "\x1B[46m",
    white: "\x1B[47m",
    crimson: "\x1B[48m"
  }
};

class Aponia {
  app;
  fsr;
  options;
  routesDir;
  watcher;
  static logger = pino({
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true
      }
    },
    level: "info"
  });
  constructor(options = {}) {
    Aponia.logger = pino({
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true
        }
      },
      level: options.logLevel ?? "info"
    });
    this.options = options;
    this.app = new Elysia;
    this.routesDir = this.options.routesDir ?? `${process.cwd()}/src/routes`;
    this.fsr = new Bun.FileSystemRouter({
      dir: this.routesDir,
      style: "nextjs",
      origin: this.options.origin ?? Bun.env.APONIA_ORIGIN ?? "http://localhost"
    });
    if (this.options.plugins) {
      for (const plugin of this.options.plugins) {
        this.app.use(plugin);
      }
    }
    if (this.options.derivedState) {
      for (const dsFn of this.options.derivedState) {
        this.app.derive(dsFn);
      }
    }
    if (Bun.env.NODE_ENV !== "production") {
      Aponia.logger.info("Watching filesystem for changes...");
      this.watcher = watch(this.routesDir, { recursive: true }, () => {
        Aponia.logger.info("Filesystem change detected, reloading routes...");
        this.stop();
        this.fsr.reload();
        this.start();
      });
      process.on("SIGINT", () => {
        Aponia.logger.info("Shutting down filesystem watcher...");
        this.watcher?.close();
        process.exit(0);
      });
    }
  }
  async start() {
    const promises2 = Object.keys(this.fsr.routes).map(async (route) => {
      Aponia.logger.debug(`Loading route: ${route}...`);
      const matchedRouteHandler = this.fsr.match(route);
      if (!matchedRouteHandler) {
        throw new Error(`Couldn't match route: ${route}!`);
      }
      Aponia.logger.debug(`Matched route: ${route}`);
      let module = undefined;
      Aponia.logger.debug(`Matched route filePath: ${matchedRouteHandler.filePath}`);
      await import(matchedRouteHandler.filePath).then((m) => {
        module = m;
      });
      if (!module) {
        throw new Error(`Module for route: ${route} not loaded!`);
      }
      module = module;
      if (!module.handler) {
        throw new Error(`Couldn't find route handler for route: ${route}!`);
      }
      for (const method of Object.keys(module.handler)) {
        const key = method.toLowerCase();
        const { fn, hooks, state, decorators } = module.handler[method];
        if (!fn)
          throw new Error(`No handler function for route: ${route}!`);
        const elysiaRoute = this.transformRoute(route);
        Aponia.logger.debug(`Registering route: ${method} ${elysiaRoute}...`);
        try {
          if (state) {
            Aponia.logger.debug(`Registering state for ${method} ${elysiaRoute}, state: ${state}`);
            for (const [key2, value] of state)
              this.app.state(key2, value);
          }
          if (decorators) {
            Aponia.logger.debug(`Registering decorators for ${method} ${elysiaRoute}, decorators: ${decorators}`);
            for (const [key2, value] of decorators)
              this.app.decorate(key2, value);
          }
          if (hooks) {
            this.app[key](elysiaRoute, fn, hooks);
          } else {
            this.app[key](elysiaRoute, fn);
          }
        } catch (err) {
          Aponia.logger.error(`Error registering route: ${method} ${elysiaRoute}!`);
          throw err;
        }
      }
    });
    const results = await Promise.allSettled(promises2);
    const rejected = results.filter((result) => result.status === "rejected");
    if (rejected.length > 0) {
      Aponia.logger.error("Errors encountered while registering routes:");
      for (const result of rejected)
        Aponia.logger.error(result.reason);
      throw new Error("Errors encountered while registering routes!");
    }
    Aponia.logger.debug({ msg: "Registered routes", routes: this.app.routes });
    this.app.listen(this.options.port ?? Bun.env.APONIA_PORT ?? 3000);
    return this.app;
  }
  async stop() {
    await this.app.stop();
  }
  transformRoute(route) {
    const wildcardRemoved = this.removeWildcard(route);
    const transformedRoute = wildcardRemoved.replace(/\[([^\]]+)\]/g, ":$1");
    if (this.options.basePath) {
      if (route === "/")
        return this.options.basePath;
      return `${this.options.basePath}${transformedRoute}`;
    }
    return transformedRoute;
  }
  removeWildcard(route) {
    const wildcardIndex = route.indexOf("[[...");
    if (wildcardIndex === -1)
      return route;
    return `${route.substring(0, wildcardIndex)}*`;
  }
  static async build(options = {
    srcDir: `${process.cwd()}/src`,
    sourcemaps: false
  }) {
    Aponia.logger.info("Building Aponia...");
    const inputDir = options.srcDir ?? `${process.cwd()}/src`;
    const outdir = options.outDir ?? "./dist";
    await rm(outdir, { recursive: true, force: true });
    const sourcemap = options.sourcemaps ? "external" : "none";
    await Bun.build({
      entrypoints: ["./src/index.ts"],
      outdir,
      target: "bun",
      sourcemap
    });
    Aponia.logger.info(`Transpiling routes (sourcemaps=${sourcemap})...`);
    await Aponia.copyAndTranspileDir(inputDir, outdir, sourcemap);
    Aponia.logger.info("Aponia build complete!");
  }
  static async copyAndTranspileDir(src, dest, sourcemap) {
    Aponia.logger.debug({ src, dest, sourcemap });
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);
      if (entry.isDirectory()) {
        await Aponia.copyAndTranspileDir(srcPath, destPath, sourcemap);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          Aponia.logger.info(`Transpiling file (sourcemaps=${sourcemap}): ${srcPath}`);
          await Bun.build({
            entrypoints: [srcPath],
            external: ["*"],
            outdir: dest,
            target: "bun",
            sourcemap
          });
        } else {
          await copyFile(srcPath, destPath);
        }
      }
    }
  }
}
export {
  Aponia,
  APONIA_LOG_COLORS
};
