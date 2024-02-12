import {
  AponiaCtx,
  AponiaHooks,
  AponiaRouteHandler,
  AponiaRouteHandlerFn,
} from "aponia";

export const getPublicAsset: AponiaRouteHandlerFn<void> = (ctx: AponiaCtx) => {
  console.log(ctx.params);
};

export const getPublicAssetHooks: AponiaHooks = {};

export const handler: AponiaRouteHandler = {
  GET: {
    fn: getPublicAsset,
    hooks: getPublicAssetHooks,
  },
};
