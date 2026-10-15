import { z } from "zod";

/**
 * Form rules shared with the API, so a form rejects exactly what the server
 * would — before the round trip, and with the message next to the field.
 */

/** Project, version-file and battle names: the server's `@ResourceName`. */
export const resourceName = (what: string) =>
  z
    .string()
    .min(1, `Name the ${what}.`)
    .max(20, "20 characters or fewer.")
    .regex(
      /^[a-zA-Z0-9_\-.]+$/,
      "Letters, digits, '_', '-' or '.' only — this becomes part of the URL.",
    );

/** Version names: 1–30 characters, no leading/trailing space or control characters. */
export const versionName = z
  .string()
  .trim()
  .min(1, "Name this version.")
  .max(30, "30 characters or fewer.")
  .regex(/^[^\u0000-\u001f\u007f]*$/, "No control characters.");
