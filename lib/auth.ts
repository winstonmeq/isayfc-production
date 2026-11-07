import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import dbConnect from "@/lib/mongodb";
import {
  loginRateLimiter,
  loginRateLimitKey,
} from "@/lib/login-rate-limit";
import RoleModel from "@/models/Role";
import UserModel from "@/models/User";
import { legacyRoleForSelection, normalizeRolePermissions } from "@/lib/role-permissions";
import { recordLogin, recordLogout } from "@/lib/login-history";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: {
          label: "Email or Username",
          type: "text",
          placeholder: "cashier or cashier@example.com",
        },
        email: {
          label: "Email",
          type: "text",
        },
        username: {
          label: "Username",
          type: "text",
        },
        name: {
          label: "Name",
          type: "text",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        await dbConnect();

        // Register Role model for populate("roleId").
        void RoleModel;

        const identifier = String(
          credentials?.identifier ||
            credentials?.email ||
            credentials?.username ||
            ""
        )
          .trim()
          .toLowerCase();

        const password = String(credentials?.password || "");

        if (!identifier || !password) {
          return null;
        }

        const rateLimitKey = loginRateLimitKey(identifier);
        if (!loginRateLimiter.check(rateLimitKey).allowed) {
          return null;
        }

        const user = await UserModel.findOne({
          isActive: true,
          $or: [{ email: identifier }, { username: identifier }],
        })
          .populate("roleId", "name permissions isActive")
          .lean();

        if (!user) {
          loginRateLimiter.recordFailure(rateLimitKey);
          await recordLogin({ userName: identifier, status: "FAILED", reason: "Invalid credentials or inactive account" });
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          String(user.password || "")
        );

        if (!isPasswordValid) {
          loginRateLimiter.recordFailure(rateLimitKey);
          await recordLogin({ userId: String(user._id), userName: user.name || identifier, status: "FAILED", reason: "Invalid credentials" });
          return null;
        }

        loginRateLimiter.clear(rateLimitKey);
        const role: any = user.roleId;
        if (role?.isActive === false) {
          await recordLogin({ userId: String(user._id), userName: user.name || identifier, status: "FAILED", reason: "Inactive role" });
          return null;
        }

        return {
          id: user._id.toString(),
          name: user.name,
          username: user.username,
          email: user.email,
          role: role ? legacyRoleForSelection(role.name || "") : user.role || "USER",
          roleId: role?._id?.toString?.() || "",
          roleName: role?.name || "",
          permissions: normalizeRolePermissions(Array.isArray(role?.permissions) ? role.permissions : []),
        };
      },
    }),
  ],
  events: {
    async signOut({ token }) {
      if (token?.loginHistoryId && token.id) await recordLogout(String(token.loginHistoryId), String(token.id));
    },
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.loginHistoryId = await recordLogin({ userId: user.id, userName: user.name || user.username, roleName: user.roleName || user.role, status: "SUCCESS" });
        token.id = user.id;
        token.username = user.username;
        token.role = user.role || "USER";
        token.roleId = user.roleId || "";
        token.roleName = user.roleName || "";
        token.permissions = Array.isArray(user.permissions) ? user.permissions : [];
        token.accessCheckedAt = Date.now();
      } else if (token.id && (trigger === "update" || Date.now() - Number(token.accessCheckedAt || 0) >= 30_000)) {
        await dbConnect(); void RoleModel;
        const current = await UserModel.findById(String(token.id)).select("role roleId isActive")
          .populate("roleId", "name permissions isActive").lean();
        const role = current?.roleId as unknown as { _id?: { toString(): string }; name?: string; permissions?: string[]; isActive?: boolean } | null;
        if (!current || !current.isActive || role?.isActive === false) {
          token.id = ""; token.role = "USER"; token.roleName = ""; token.permissions = [];
        } else {
          token.role = role ? legacyRoleForSelection(role.name || "") : current.role;
          token.roleName = role?.name || ""; token.roleId = role?._id?.toString() || "";
          token.permissions = normalizeRolePermissions(role?.permissions || []);
        }
        token.accessCheckedAt = Date.now();
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id || "");
        session.user.loginHistoryId = typeof token.loginHistoryId === "string" ? token.loginHistoryId : undefined;
        session.user.username = String(token.username || "");
        session.user.role = token.role || "USER";
        session.user.roleId = String(token.roleId || "");
        session.user.roleName = String(token.roleName || "");
        session.user.permissions = Array.isArray(token.permissions)
          ? token.permissions
          : [];
      }

      return session;
    },
  },
};
