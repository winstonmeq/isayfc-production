"use client";

import { createContext, useContext, type ComponentProps } from "react";
import * as Modal from "@/components/ui/dialog";

// One transaction body for both legacy modal callers and dedicated pages.
// Page mode has no portal, overlay, focus trap or viewport-height constraint.
const PageContext = createContext(false);
export function Dialog({ pageMode = false, ...props }: ComponentProps<typeof Modal.Dialog> & { pageMode?: boolean }) {
  return <PageContext.Provider value={pageMode}>{pageMode ? (props.open ? props.children : null) : <Modal.Dialog {...props} />}</PageContext.Provider>;
}
export function DialogContent(props: ComponentProps<typeof Modal.DialogContent>) {
  const page = useContext(PageContext);
  return page ? <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-white">{props.children}</section> : <Modal.DialogContent {...props} />;
}
export function DialogHeader(props: ComponentProps<typeof Modal.DialogHeader>) {
  const page = useContext(PageContext);
  return page ? <header {...props} /> : <Modal.DialogHeader {...props} />;
}
export function DialogTitle(props: ComponentProps<typeof Modal.DialogTitle>) {
  const page = useContext(PageContext);
  return page ? <h2 className={props.className}>{props.children}</h2> : <Modal.DialogTitle {...props} />;
}
export function DialogDescription(props: ComponentProps<typeof Modal.DialogDescription>) {
  const page = useContext(PageContext);
  return page ? <p className={props.className}>{props.children}</p> : <Modal.DialogDescription {...props} />;
}
export function DialogFooter(props: ComponentProps<typeof Modal.DialogFooter>) {
  const page = useContext(PageContext);
  return page ? <footer {...props} className={`flex flex-wrap justify-end gap-2 ${props.className || ""}`} /> : <Modal.DialogFooter {...props} />;
}
