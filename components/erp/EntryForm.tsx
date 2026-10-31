"use client";

import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Only opted-in entry dialogs use this layout. Read-only detail/report dialogs
// and confirmations retain their original descriptions and presentation.
export function splitEntryChildren(children: ReactNode) {
  const nodes = Children.toArray(children);
  return {
    headers: nodes.filter((node) => isValidElement(node) && node.type === DialogHeader),
    footers: nodes.filter((node) => isValidElement(node) && node.type === DialogFooter),
    body: nodes.filter((node) => !isValidElement(node) || (node.type !== DialogHeader && node.type !== DialogFooter)),
  };
}

function footer(node: ReactNode) {
  const element = node as ReactElement<{ className?: string }>;
  return cloneElement(element, { className: cn(element.props.className, "mx-0 mb-0 shrink-0 rounded-none bg-white px-5 py-4") });
}

export function EntryDialogContent({ children, className, ...props }: ComponentProps<typeof DialogContent>) {
  const parts = splitEntryChildren(children);
  const form = parts.body.length === 1 && isValidElement(parts.body[0]) && parts.body[0].type === "form"
    ? parts.body[0] as ReactElement<ComponentProps<"form">> : null;
  const formParts = form ? splitEntryChildren(form.props.children) : null;
  return <DialogContent {...props} className={cn("sm:max-w-2xl", className, "flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0")}>
    {parts.headers.map((node) => {
      const element = node as ReactElement<{ className?: string }>;
      return cloneElement(element, { className: cn(element.props.className, "shrink-0 border-b px-5 py-4 pr-12 [&_[data-slot=dialog-description]]:sr-only [&_[data-slot=dialog-title]]:text-xl") });
    })}
    {form && formParts ? cloneElement(form, { className: "flex min-h-0 flex-1 flex-col" },
      <div className={cn(form.props.className, "min-h-0 flex-1 overflow-y-auto px-5 py-4")}>{formParts.body}</div>,
      ...formParts.footers.map(footer),
    ) : <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{parts.body}</div>}
    {parts.footers.map(footer)}
  </DialogContent>;
}

export function EntryActions({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} data-slot="entry-actions" className={cn("sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t bg-white/95 px-4 py-3 shadow-[0_-4px_16px_-12px_rgba(15,23,42,0.3)] backdrop-blur-sm", className)} />;
}
