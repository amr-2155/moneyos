import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseOrThrow } from "../../lib/zod.js";
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  resetPasswordSchema,
  signupSchema,
  updateMeSchema,
} from "./auth.schema.js";
import type { AuthService } from "./auth.service.js";

type AuthenticateHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface AuthRoutesDeps {
  service: AuthService;
  authenticate: AuthenticateHandler;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  const { service, authenticate } = deps;

  const sessionMetadata = (request: {
    headers: { [k: string]: string | string[] | undefined };
    ip: string;
  }) => ({
    userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
    ipAddress: request.ip,
  });

  app.post(
    "/auth/signup",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = parseOrThrow(signupSchema, request.body);
      const result = await service.signup(body, sessionMetadata(request));
      return reply.code(201).send(result);
    },
  );

  app.post(
    "/auth/login",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = parseOrThrow(loginSchema, request.body);
      const result = await service.login(body, sessionMetadata(request));
      return reply.send(result);
    },
  );

  app.post(
    "/auth/refresh",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = parseOrThrow(refreshSchema, request.body);
      const result = await service.refresh(body.refreshToken, sessionMetadata(request));
      return reply.send(result);
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const body = parseOrThrow(logoutSchema, request.body);
    await service.logout(body.refreshToken);
    return reply.code(204).send();
  });

  app.post(
    "/auth/forgot-password",
    {
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const body = parseOrThrow(forgotPasswordSchema, request.body);
      const resetUrl = await service.requestPasswordReset(body.email);
      const isDev = process.env.NODE_ENV !== "production";
      return reply.send({ ok: true, ...(isDev && resetUrl ? { devResetUrl: resetUrl } : {}) });
    },
  );

  app.post(
    "/auth/reset-password",
    {
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const body = parseOrThrow(resetPasswordSchema, request.body);
      await service.resetPassword(body.token, body.password);
      return reply.send({ ok: true });
    },
  );

  app.get("/auth/me", { preHandler: authenticate }, async (request) => {
    return service.getMe(request.user!.id);
  });

  app.patch("/auth/me", { preHandler: authenticate }, async (request) => {
    const body = parseOrThrow(updateMeSchema, request.body);
    return service.updateMe(request.user!.id, body);
  });
}
