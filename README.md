# Aponia

A lightweight, FSR-based framework built on top of Elysia.

_Note_: Docs are in-progress!

## Getting Started

### Installation

```bash
# from source
bun add github:jacksonsalopek/aponia
```

### Setup

Similar to Next.js, Aponia's routing is based on the file system. First, create an instance by adding a `src/index.ts` file with the
following contents:

```ts
import { Aponia } from "aponia";
import { performance } from "perf_hooks";

const start = performance.now();
const app = new Aponia({ basePath: "api" });

await app.start().then(
  (instance) => {
    const end = performance.now();
    const timeToStart = end - start;
    console.log(
      `🐎 Aponia started: ${instance.server?.hostname}:${instance.server?.port} (${timeToStart}ms)`
    );
  },
  (reason) => console.error(`Couldn't boostrap Aponia!\nreason: ${reason}`)
);
```

After creating the instance, we can start adding some routes. Create a route by creating an `index.ts` file inside of `src/routes`, i.e.
`src/routes/user/index.ts`, which will bootstrap as `/user`. This file should export a handler, which is used by Aponia to boostrap your routes. For example:

```ts
import type {
  AponiaAfterRequestHandler,
  AponiaCtx,
  AponiaDecorator,
  AponiaHooks,
  AponiaRouteHandler,
  AponiaRouteHandlerFn,
  AponiaState,
} from "aponia";
import { v4 } from "uuid";

interface User {
  id: string;
  created: number;
  version: number;
}

export const createUserState: AponiaState = ["version", 1];
export const createUserDateDecorator: AponiaDecorator = [
  "getDate",
  () => Date.now(),
];

export const createUser: AponiaRouteHandlerFn<User> = (ctx: AponiaCtx) => {
  const decoratedCtx = ctx as AponiaCtx & {
    getDate: () => Date;
    store: { version: number };
  };
  return {
    id: v4(),
    created: +decoratedCtx.getDate(),
    version: decoratedCtx.store.version,
  };
};

export const createUserPostHook: AponiaAfterRequestHandler = ({ set }) => {
  set.headers["Test-Header"] = "Test";
};

export const createUserHooks: AponiaHooks = {
  afterHandle: [createUserPostHook],
};

export const handler: AponiaRouteHandler = {
  // HTTP method to bind the handler to
  POST: [
    // Handler fn first
    createUser,
    // Hooks second
    createUserHooks,
    // State array (must be array!)
    [createUserState],
    // Decorators array (must be array!)
    [createUserDateDecorator],
  ],
};
```

The above example shows all of the ways you can configure a given endpoint, including the usage of hooks, state, and decorators. For more information on these concepts, refer to the Elysia documentation.

### A Note on Monorepos

If you have a monorepo and Aponia is nested within a subdirectory, you can use the following pattern to ensure that the routes directory is always loaded properly:

```ts
import { Aponia } from "aponia";
import { dirname } from "path";
// other imports

// other setup

// set moduleDir to the directory of the current file,
// this will ensure that the routes directory is always
// loaded properly!
const moduleDir = dirname(Bun.fileURLToPath(new URL(import.meta.url)));
const app = new Aponia({ basePath: "api", routesDir: `${moduleDir}/routes` });
// start app below
```

### Building for Production

Aponia provides a build function for you to programmatically build your routes. To use it, setup a build script (i.e. `build.ts`) containing the following:

```ts
import { Aponia } from "aponia";

await Aponia.build({
  // routesDir is mandatory, can be relative or absolute
	routesDir: `${process.cwd()}/src/routes`,
  // outDir is optional, defaults to process.cwd() + "/dist"
  outDir: `${process.cwd()}/dist`,
});
```

This will build your application and bundle your routes in `outDir`. You can then run your application by running `bun run dist/index.js`.
