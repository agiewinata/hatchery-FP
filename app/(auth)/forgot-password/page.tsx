import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Reset your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the address you signed up with and we will send you a link.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
