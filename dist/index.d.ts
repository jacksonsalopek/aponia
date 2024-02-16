/// <reference types="bun-types" />
import { FSWatcher } from "fs";
import Bun from "bun";
import Elysia, { type AfterRequestHandler, type Context, type ElysiaInstance, type HTTPMethod, type LocalHook, type TypedSchema, type TypedSchemaToRoute } from "elysia";
import { MergeSchema } from "elysia/dist/types";
import pino from "pino";
export type Fn = (...args: any[]) => any;
export type AponiaAfterRequestHandler = AfterRequestHandler<TypedSchemaToRoute<MergeSchema<TypedSchema<string>, TypedSchema<any>>, {}>, ElysiaInstance>;
export type AponiaHooks = LocalHook<TypedSchema<string>, ElysiaInstance>;
export type AponiaCtx = Context;
export type AponiaRouteHandlerFn<Res = unknown> = (ctx: AponiaCtx) => Res;
export type AponiaKey = string | number | symbol;
export type AponiaState = [AponiaKey, string];
export type AponiaDecorator = [string, any];
export type AponiaDerivedState = (ctx: AponiaCtx) => ReturnType<Parameters<typeof Elysia.prototype.derive>[0]>;
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
export type AponiaPlugin = ElysiaAsyncPlugin | Awaited<ElysiaAsyncPlugin>["default"];
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
export declare const APONIA_LOG_COLORS: {
    reset: string;
    bright: string;
    dim: string;
    underscore: string;
    blink: string;
    reverse: string;
    hidden: string;
    fg: {
        black: string;
        red: string;
        green: string;
        yellow: string;
        blue: string;
        magenta: string;
        cyan: string;
        white: string;
        crimson: string;
    };
    bg: {
        black: string;
        red: string;
        green: string;
        yellow: string;
        blue: string;
        magenta: string;
        cyan: string;
        white: string;
        crimson: string;
    };
};
export declare class Aponia {
    app: Elysia;
    fsr: Bun.FileSystemRouter;
    options: AponiaOptions;
    routesDir: string;
    watcher?: FSWatcher;
    static logger: ReturnType<typeof pino>;
    constructor(options?: AponiaOptions);
    start(): Promise<Elysia<"", {
        store: {};
        request: {};
        schema: {};
        error: {};
        meta: {
            schema: {};
            defs: {};
            exposed: {};
        };
    }>>;
    stop(): Promise<void>;
    transformRoute(route: string): string;
    removeWildcard(route: string): string;
    static build(options?: AponiaBuildOptions): Promise<void>;
    static copyAndTranspileDir(src: string, dest: string, sourcemap: "none" | "external" | "inline"): Promise<void>;
}
