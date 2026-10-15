"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { USING_MOCK_API } from "@/lib/env";
import { useSignIn, useSignUp } from "../hooks/use-session";

/**
 * Sign in and sign up.
 *
 * The original validated by hand (`checkEmail`, `checkPassword`, `checkName`),
 * wrote the result into a `signUpMessage` ref, and cleared it with a
 * `setTimeout` five seconds later — so the error vanished while the user was
 * still reading it, and nothing associated the message with the field it was
 * about. Here Zod owns the rules, the message lives next to its input, and
 * `aria-invalid` plus `aria-describedby` mean a screen reader gets it too.
 */

const emailField = z
  .string()
  .min(1, "Email is required.")
  .email("That does not look like an email address.");

const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required."),
});

const signUpSchema = z.object({
  name: z
    .string()
    .min(1, "Pick a user name.")
    .max(30, "User names can be up to 30 characters."),
  email: emailField,
  password: z
    .string()
    .min(6, "Use at least 6 characters.")
    .max(30, "Use at most 30 characters.")
    .regex(/[a-z]/, "Include at least one lowercase letter.")
    .regex(/\d/, "Include at least one digit."),
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

export function AuthForm({ redirect }: { redirect: string | null }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="w-full max-w-sm">
      <div
        role="tablist"
        aria-label="Sign in or create an account"
        className="border-edge bg-surface mb-6 grid grid-cols-2 rounded-md border p-1"
      >
        {(["signin", "signup"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            aria-controls={`${value}-panel`}
            onClick={() => setMode(value)}
            className={cn(
              "rounded px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-2",
              mode === value
                ? "bg-brand text-brand-ink"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {value === "signin" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      {mode === "signin" ? (
        <SignInPanel redirect={redirect} />
      ) : (
        <SignUpPanel redirect={redirect} />
      )}
    </div>
  );
}

function SignInPanel({ redirect }: { redirect: string | null }) {
  const signIn = useSignIn(redirect);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    // The demo accounts are pre-filled so the app can be tried in one click.
    defaultValues: { email: "domingoos@gmail.com", password: "test1234" },
  });

  return (
    <form
      id="signin-panel"
      role="tabpanel"
      noValidate
      onSubmit={form.handleSubmit((values) => signIn.mutate(values))}
      className="flex flex-col gap-4"
    >
      <Field
        label="Email"
        id="signin-email"
        type="email"
        autoComplete="email"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />
      <Field
        label="Password"
        id="signin-password"
        type="password"
        autoComplete="current-password"
        error={form.formState.errors.password?.message}
        {...form.register("password")}
      />

      <FormError error={signIn.error} />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={signIn.isPending}
      >
        {signIn.isPending && <Loader2 className="animate-spin" />}
        Log in
      </Button>

      <p className="text-ink-subtle text-xs">
        {USING_MOCK_API
          ? "This is a demo with no real backend: "
          : "With the local seed data loaded, "}
        the pre-filled account signs you straight in;{" "}
        <code className="text-ink-muted">guest@gmail.com</code> with the same
        password is the second battler.
      </p>
    </form>
  );
}

function SignUpPanel({ redirect }: { redirect: string | null }) {
  const signUp = useSignUp(redirect);
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  return (
    <form
      id="signup-panel"
      role="tabpanel"
      noValidate
      onSubmit={form.handleSubmit((values) => signUp.mutate(values))}
      className="flex flex-col gap-4"
    >
      <Field
        label="User name"
        id="signup-name"
        autoComplete="username"
        error={form.formState.errors.name?.message}
        {...form.register("name")}
      />
      <Field
        label="Email"
        id="signup-email"
        type="email"
        autoComplete="email"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />
      <Field
        label="Password"
        id="signup-password"
        type="password"
        autoComplete="new-password"
        hint="6–30 characters, with a lowercase letter and a digit."
        error={form.formState.errors.password?.message}
        {...form.register("password")}
      />

      <FormError error={signUp.error} />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={signUp.isPending}
      >
        {signUp.isPending && <Loader2 className="animate-spin" />}
        Create account
      </Button>
    </form>
  );
}

interface FieldProps extends React.ComponentProps<"input"> {
  label: string;
  id: string;
  error?: string | undefined;
  hint?: string;
}

function Field({ label, id, error, hint, ...props }: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [error !== undefined ? errorId : null, hint !== undefined ? hintId : null]
      .filter((value): value is string => value !== null)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint !== undefined && error === undefined && (
        <p id={hintId} className="text-ink-subtle text-xs">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

/** A submission failure, announced rather than silently replacing the button. */
function FormError({ error }: { error: unknown }) {
  if (error === null || error === undefined) return null;
  return (
    <p
      role="alert"
      className="border-danger/40 bg-danger/10 text-danger rounded-md border px-3 py-2 text-sm"
    >
      {describeError(error)}
    </p>
  );
}
