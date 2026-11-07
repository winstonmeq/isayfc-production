"use client";
import { ErrorRecovery, type ErrorRecoveryProps } from "@/components/errors/ErrorRecovery";
export default function GlobalError(props: ErrorRecoveryProps) {
  return <html lang="en"><body style={{ margin: 0 }}><ErrorRecovery {...props} root /></body></html>;
}
