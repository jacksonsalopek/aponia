import {
  Aponia,
  type AponiaAfterRequestHandler,
  type AponiaCtx,
  type AponiaDecorator,
  type AponiaHooks,
  type AponiaRouteHandler,
  type AponiaRouteHandlerFn,
} from "aponia";

export const getDateDecorator: AponiaDecorator = ["getDate", () => Date.now()];

export const getHealthcheck: AponiaRouteHandlerFn<{
  status: string;
  timestamp: number;
}> = (ctx: AponiaCtx) => {
  const decoratedCtx = ctx as AponiaCtx & {
    getDate: () => Date;
  };
  return {
    status: "ok",
    timestamp: +decoratedCtx.getDate(),
  };
};

export const postGetHealthcheck: AponiaAfterRequestHandler = ({ set }) => {
  Aponia.log("called 1");
  set.headers["Content-Type"] = "application/json";
};

export const testAsyncHook: AponiaAfterRequestHandler = async () => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  Aponia.log("called 3");
};

export const getHealthcheckHooks: AponiaHooks = {
  afterHandle: [
    postGetHealthcheck,
    () => Aponia.log("called 2"),
    testAsyncHook,
  ],
};

export const handler: AponiaRouteHandler = {
  GET: {
    fn: getHealthcheck,
    hooks: getHealthcheckHooks,
    decorators: [getDateDecorator],
  },
};
