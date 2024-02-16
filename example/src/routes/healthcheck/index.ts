import type {
  AponiaAfterRequestHandler,
  AponiaDecorator,
  AponiaHooks,
  AponiaRouteHandler,
  AponiaRouteHandlerFn,
} from "aponia";
import logger from "../../logger";

export const getDateDecorator: AponiaDecorator = ["getDate", () => Date.now()];

interface DecoratedCtx {
  getDate: () => Date;
}

interface HealthcheckResponse {
  status: string;
  timestamp: number;
}

export const getHealthcheck: AponiaRouteHandlerFn<
  HealthcheckResponse,
  DecoratedCtx
> = (ctx) => {
  return {
    status: "ok",
    timestamp: +ctx.getDate(),
  };
};

export const postGetHealthcheck: AponiaAfterRequestHandler = ({ set }) => {
  logger.info("called 1");
  set.headers["Content-Type"] = "application/json";
};

export const getHealthcheckHooks: AponiaHooks = {
  afterHandle: [postGetHealthcheck, () => logger.info("called 2")],
};

export const handler: AponiaRouteHandler<HealthcheckResponse, DecoratedCtx> = {
  GET: {
    fn: getHealthcheck,
    hooks: getHealthcheckHooks,
    decorators: [getDateDecorator],
  },
};
