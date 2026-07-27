import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/LoginForm";
import { authOptions } from "@/lib/auth";

export const metadata = {
  title: "Sign in | ISAY Business Operations",
  description: "Secure staff access to ISAY Fried Chicken business operations.",
};

export default async function LoginPage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
