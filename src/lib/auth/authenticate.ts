import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config/env.js";
import { AppError } from "../errors.js";
import { verifyAccessToken } from "./tokens.js";

export interface AuthenticatedUser {
  id: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export function createAuthenticate(config: AppConfig) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    void reply;
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) {
      throw AppError.unauthorized();
    }
    const userId = await verifyAccessToken(config, token);
    if (!userId) {
      throw AppError.unauthorized("Invalid or expired token");
    }
    request.user = { id: userId };
  };
}
