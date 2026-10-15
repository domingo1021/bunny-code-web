"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateVersion } from "@/features/projects";
import { describeError } from "@/lib/api-client";
import { resourceName, versionName } from "@/lib/validation";

/**
 * Create a new version of a project.
 *
 * A new version starts from the current version's final content, so recording
 * against it captures only what changed — which is what makes replaying a
 * version a diff you can watch.
 */
function withJsExtension(fileName: string): string {
  return fileName.endsWith(".js") ? fileName : `${fileName}.js`;
}

const schema = z.object({
  versionName,
  fileName: resourceName("file").refine(
    (name) => withJsExtension(name).length <= 20,
    "20 characters or fewer, including “.js”.",
  ),
});

type Values = z.input<typeof schema>;

export function CreateVersionDialog({
  open,
  onOpenChange,
  projectName,
  nextVersionNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  nextVersionNumber: number;
}) {
  const router = useRouter();
  const createVersion = useCreateVersion(projectName);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      versionName: `version ${nextVersionNumber}`,
      fileName: "index.js",
    },
  });

  function onSubmit(values: Values) {
    const parsed = schema.parse(values);
    createVersion.mutate(
      {
        versionName: parsed.versionName,
        fileName: withJsExtension(parsed.fileName),
      },
      {
        onSuccess: (version) => {
          toast.success(`Created ${version.name}`);
          onOpenChange(false);
          form.reset();
          // Go straight to the new version: creating one and being left on the
          // old one is the kind of thing that makes people click twice.
          router.push(
            `/workspace/${encodeURIComponent(projectName)}/${version.number}`,
          );
        },
        onError: (error) => toast.error(describeError(error)),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          form.reset();
          createVersion.reset();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New version</DialogTitle>
          <DialogDescription>
            It starts from this version&rsquo;s current content, so the next
            recording captures only what you change.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-version-name"
              className="text-ink text-sm font-medium"
            >
              Version name
            </label>
            <Input
              id="new-version-name"
              aria-invalid={form.formState.errors.versionName !== undefined}
              {...form.register("versionName")}
            />
            {form.formState.errors.versionName?.message !== undefined && (
              <p className="text-danger text-xs">
                {form.formState.errors.versionName.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="new-version-file"
              className="text-ink text-sm font-medium"
            >
              File name
            </label>
            <Input
              id="new-version-file"
              aria-invalid={form.formState.errors.fileName !== undefined}
              {...form.register("fileName")}
            />
            {form.formState.errors.fileName?.message !== undefined && (
              <p className="text-danger text-xs">
                {form.formState.errors.fileName.message}
              </p>
            )}
          </div>

          {createVersion.error !== null && (
            <p
              role="alert"
              className="border-danger/40 bg-danger/10 text-danger rounded-md border px-3 py-2 text-sm"
            >
              {describeError(createVersion.error)}
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createVersion.isPending}
            >
              {createVersion.isPending && <Loader2 className="animate-spin" />}
              Create version
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
