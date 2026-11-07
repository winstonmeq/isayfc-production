import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/models/User";

declare module "next-auth" {
  interface Session {
    user: {
      loginHistoryId?: string;
      id: string;
      username: string;
      role: UserRole;
      roleId: string;
      roleName: string;
      permissions: string[];
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    username: string;
    role: UserRole;
    roleId: string;
    roleName: string;
    permissions: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: UserRole;
    roleId: string;
    roleName: string;
    permissions: string[];
  }
}
