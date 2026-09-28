import type { AppConfig } from "../../config/env.js";
import type { Db } from "../../db/client.js";
import { authSessions, passwordResetTokens, users, type User } from "../../db/schema.js";
import type { Mailer } from "../../lib/auth/mailer.js";
import { hashPassword, verifyPassword } from "../../lib/auth/password.js";
import { signAccessToken } from "../../lib/auth/tokens.js";
import { generateToken, hashToken } from "../../lib/crypto.js";
import { AppError } from "../../lib/errors.js";
import { eq } from "drizzle-orm";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Refresh token expiry, epoch ms. */
  refreshExpiresAt: number;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  defaultCurrency: string;
  locale: string;
  createdAt: string;
}

export interface SessionMetadata {
  userAgent?: string | null;
  ipAddress?: string | null;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    defaultCurrency: user.defaultCurrency,
    locale: user.locale,
    createdAt: user.createdAt.toISOString(),
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
    private readonly mailer: Mailer,
  ) {}

  private async issueTokenPair(
    userId: string,
    metadata: SessionMetadata,
  ): Promise<TokenPair> {
    const accessToken = await signAccessToken(this.config, userId);
    const refreshToken = generateToken(32);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlMs);
    await this.db.insert(authSessions).values({
      userId,
      tokenHash: hashToken(refreshToken),
      userAgent: metadata.userAgent ?? null,
      ipAddress: metadata.ipAddress ?? null,
      expiresAt,
    });
    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt.getTime(),
    };
  }

  async signup(
    input: { email: string; password: string; name: string },
    metadata: SessionMetadata,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const email = normalizeEmail(input.email);
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get();
    if (existing) {
      throw AppError.conflict("An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const created = await this.db
      .insert(users)
      .values({
        email,
        name: input.name.trim(),
        passwordHash,
        defaultCurrency: this.config.defaultCurrency,
      })
      .returning();

    const user = created[0]!;
    const tokens = await this.issueTokenPair(user.id, metadata);
    return { user: toPublicUser(user), tokens };
  }

  async login(
    input: { email: string; password: string },
    metadata: SessionMetadata,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const email = normalizeEmail(input.email);
    const user = await this.db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !user.isActive) {
      throw AppError.unauthorized("Invalid email or password");
    }
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      throw AppError.unauthorized("Invalid email or password");
    }
    const tokens = await this.issueTokenPair(user.id, metadata);
    return { user: toPublicUser(user), tokens };
  }

  async refresh(
    refreshToken: string,
    metadata: SessionMetadata,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const session = await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, hashToken(refreshToken)))
      .get();

    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
      throw AppError.unauthorized("Invalid or expired refresh token");
    }

    const user = await this.db.select().from(users).where(eq(users.id, session.userId)).get();
    if (!user || !user.isActive) {
      throw AppError.unauthorized("Invalid or expired refresh token");
    }

    const rotatedToken = generateToken(32);
    const newExpiresAt = new Date(Date.now() + this.config.refreshTokenTtlMs);
    await this.db
      .update(authSessions)
      .set({
        tokenHash: hashToken(rotatedToken),
        lastUsedAt: now,
        userAgent: metadata.userAgent ?? session.userAgent,
        ipAddress: metadata.ipAddress ?? session.ipAddress,
        expiresAt: newExpiresAt,
      })
      .where(eq(authSessions.id, session.id));

    const accessToken = await signAccessToken(this.config, user.id);
    return {
      user: toPublicUser(user),
      tokens: {
        accessToken,
        refreshToken: rotatedToken,
        refreshExpiresAt: newExpiresAt.getTime(),
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(eq(authSessions.tokenHash, hashToken(refreshToken)));
  }

  async requestPasswordReset(email: string): Promise<string | null> {
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .get();

    // Always respond identically whether or not the email exists.
    if (!user || !user.isActive) {
      return null;
    }

    const resetToken = generateToken(32);
    const expiresAt = new Date(Date.now() + this.config.passwordResetTtlMs);
    await this.db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(resetToken),
      expiresAt,
    });

    const resetUrl = `${this.config.publicAppUrl}/reset-password?token=${resetToken}`;
    await this.mailer.send({
      to: user.email,
      subject: `Reset your ${this.config.appName} password`,
      text: [
        `Hello ${user.name},`,
        "",
        `We received a request to reset your ${this.config.appName} password.`,
        `Open the link below to choose a new password. It expires in ${
          this.config.passwordResetTtlMs / 60000
        } minutes.`,
        "",
        resetUrl,
        "",
        "If you did not request this, you can safely ignore this email.",
        "",
        "MoneyOS is free forever, for the sake of God — مجاني تمامًا لوجه الله.",
      ].join("\n"),
    });

    return resetUrl;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const reset = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hashToken(token)))
      .get();

    const now = new Date();
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= now.getTime()) {
      throw AppError.badRequest("Invalid or expired reset token");
    }

    const passwordHash = await hashPassword(newPassword);
    await this.db.transaction((tx) => {
      tx.update(users)
        .set({ passwordHash, updatedAt: now })
        .where(eq(users.id, reset.userId))
        .run();
      tx.update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, reset.id))
        .run();
      tx.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.userId, reset.userId)).run();
    });
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user || !user.isActive) {
      throw AppError.unauthorized();
    }
    return toPublicUser(user);
  }

  async updateMe(
    userId: string,
    patch: { name?: string; defaultCurrency?: string; locale?: string },
  ): Promise<PublicUser> {
    const current = await this.db.select().from(users).where(eq(users.id, userId)).get();
    if (!current || !current.isActive) {
      throw AppError.unauthorized();
    }
    const updated = await this.db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return toPublicUser(updated[0]!);
  }
}
