import { AponiaCtx, AponiaRouteHandler, AponiaRouteHandlerFn } from "aponia";

interface User {
  id: string;
  name: string;
}

export const getUser: AponiaRouteHandlerFn<User> = (ctx: AponiaCtx) => {
  const { id } = ctx.params as { id: string };
  return {
    id,
    name: "John Doe",
  };
};

export const handler: AponiaRouteHandler = {
  GET: {
    fn: getUser,
  },
};
