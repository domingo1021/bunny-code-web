"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { describeError } from "@/lib/api-client";
import { resourceName, versionName } from "@/lib/validation";
import { useCreateProject } from "../hooks/use-projects";

/**
 * Create a project.
 *
 * The rules are the server's (see `lib/validation.ts`), checked before the
 * round trip, and each message sits with its field.
 */
/** `.js` is appended because the sandbox only runs JavaScript. */
function withJsExtension(fileName: string): string {
  return fileName.endsWith(".js") ? fileName : `${fileName}.js`;
}

const schema = z.object({
  projectName: resourceName("project"),
  projectDescription: z.string().max(50, "50 characters or fewer.").default(""),
  versionName,
  fileName: resourceName("first file").refine(
    (name) => withJsExtension(name).length <= 20,
    "20 characters or fewer, including “.js”.",
  ),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
});

type Values = z.input<typeof schema>;

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const createProject = useCreateProject();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectName: "",
      projectDescription: "",
      versionName: "version 1",
      fileName: "index.js",
      visibility: "PUBLIC",
    },
  });

  function onSubmit(values: Values) {
    const parsed = schema.parse(values);
    createProject.mutate(
      {
        name: parsed.projectName,
        description: parsed.projectDescription,
        // Appended here rather than by rewriting the input, so the user never
        // watches their own text change under the cursor.
        fileName: withJsExtension(parsed.fileName),
        versionName: parsed.versionName,
        visibility: parsed.visibility,
      },
      {
        onSuccess: (created) => {
          toast.success(`Created ${created.name}`);
          form.reset();
          setOpen(false);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
          createProject.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="primary">
          <Plus aria-hidden="true" />
          New project
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project holds versions, and each version records a coding session
            you can replay.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <Field
            label="Project name"
            id="project-name"
            hint="Used in the URL, so no spaces."
            error={form.formState.errors.projectName?.message}
            {...form.register("projectName")}
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="project-description"
              className="text-ink text-sm font-medium"
            >
              Description
            </label>
            <Textarea
              id="project-description"
              rows={2}
              aria-invalid={
                form.formState.errors.projectDescription !== undefined
              }
              {...form.register("projectDescription")}
            />
            {form.formState.errors.projectDescription?.message !==
              undefined && (
              <p className="text-danger text-xs">
                {form.formState.errors.projectDescription.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="First version"
              id="version-name"
              error={form.formState.errors.versionName?.message}
              {...form.register("versionName")}
            />
            <Field
              label="First file"
              id="file-name"
              hint="JavaScript only, for now."
              error={form.formState.errors.fileName?.message}
              {...form.register("fileName")}
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-ink text-sm font-medium">Visibility</legend>
            <div className="flex gap-4">
              {(
                [
                  ["PUBLIC", "Public", "Anyone can watch the replay."],
                  ["PRIVATE", "Private", "Only you can see it."],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className="border-edge hover:border-edge-strong has-checked:border-brand flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 text-sm"
                >
                  <input
                    type="radio"
                    value={value}
                    className="accent-brand mt-0.5"
                    {...form.register("visibility")}
                  />
                  <span>
                    <span className="text-ink block font-medium">{label}</span>
                    <span className="text-ink-subtle block text-xs">
                      {hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {createProject.error !== null && (
            <p
              role="alert"
              className="border-danger/40 bg-danger/10 text-danger rounded-md border px-3 py-2 text-sm"
            >
              {describeError(createProject.error)}
            </p>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={createProject.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createProject.isPending}
            >
              {createProject.isPending && <Loader2 className="animate-spin" />}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <div className="flex min-w-0 flex-col gap-1.5">
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
