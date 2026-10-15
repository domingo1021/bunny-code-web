import { apiRequest } from "@/lib/api-client";
import { authResultSchema, userProfileSchema } from "@/lib/schemas";

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpInput extends Credentials {
  name: string;
}

export function signIn(credentials: Credentials) {
  return apiRequest("/auth/sign-in", {
    method: "POST",
    body: credentials,
    schema: authResultSchema,
  });
}

export function signUp(input: SignUpInput) {
  return apiRequest("/auth/sign-up", {
    method: "POST",
    body: input,
    schema: authResultSchema,
  });
}

/** Verify a token and return the id of the user it belongs to. Rejects with a 401. */
export async function verifyToken(token: string): Promise<number> {
  const me = await apiRequest("/users/me", {
    schema: userProfileSchema,
    token,
  });
  return me.id;
}
