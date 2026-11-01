import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { authOptions } from "@/lib/auth";
import { userLandingPage } from "@/lib/page-access";

export const metadata = {
  title: "Sign in | ISAY Business Operations",
  description: "Secure staff access to ISAY Fried Chicken business operations.",
};

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    redirect(userLandingPage(session.user.permissions, session.user.role === "ADMIN" || session.user.roleName === "ADMIN"));
  }

  return <LoginForm />;
}
