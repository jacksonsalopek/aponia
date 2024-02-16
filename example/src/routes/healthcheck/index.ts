import type {
  AponiaAfterRequestHandler,
  AponiaCtx,
  AponiaDecorator,
  AponiaHooks,
  AponiaRouteHandler,
  AponiaRouteHandlerFn,
} from "aponia";
import logger from "../../logger";

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
  logger.info("called 1");
  set.headers["Content-Type"] = "application/json";
};

export const getHealthcheckHooks: AponiaHooks = {
  afterHandle: [postGetHealthcheck, () => logger.info("called 2")],
};

export const handler: AponiaRouteHandler = {
  GET: {
    fn: getHealthcheck,
    hooks: getHealthcheckHooks,
    decorators: [getDateDecorator],
  },
};
