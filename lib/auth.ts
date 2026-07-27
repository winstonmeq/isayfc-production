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

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
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
          .populate("roleId", "name permissions")
          .lean();

        if (!user) {
          loginRateLimiter.recordFailure(rateLimitKey);
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          password,
          String(user.password || "")
        );

        if (!isPasswordValid) {
          loginRateLimiter.recordFailure(rateLimitKey);
          return null;
        }

        loginRateLimiter.clear(rateLimitKey);
        const role: any = user.roleId;

        return {
          id: user._id.toString(),
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role || "USER",
          roleId: role?._id?.toString?.() || "",
          roleName: role?.name || "",
          permissions: Array.isArray(role?.permissions) ? role.permissions : [],
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role || "USER";
        token.roleId = user.roleId || "";
        token.roleName = user.roleName || "";
        token.permissions = Array.isArray(user.permissions) ? user.permissions : [];
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id || "");
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
