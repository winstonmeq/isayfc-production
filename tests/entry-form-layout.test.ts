import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ComponentProps } from "react";
import { DialogHeader, DialogFooter } from "../components/ui/dialog";
import { EntryDialogContent, splitEntryChildren } from "../components/erp/EntryForm";

test("entry layout separates actions from fields without changing form handlers", () => {
  const submit = () => undefined;
  const children = [
    createElement("input", { name: "name", required: true }),
    createElement(DialogFooter, null, createElement("button", { type: "submit" }, "Save")),
  ];
  const form = createElement("form", { onSubmit: submit, id: "purchase-entry" } as ComponentProps<"form">, ...children);
  const sections = splitEntryChildren([createElement(DialogHeader, { key: "h" }, "Add"), form]);
  assert.equal(sections.headers.length, 1);
  assert.equal(sections.body.length, 1);
  assert.equal(form.props.onSubmit, submit);
  const fields = splitEntryChildren(form.props.children);
  assert.equal(fields.body.length, 1);
  assert.equal(fields.footers.length, 1);
  const layout = EntryDialogContent({ children: [createElement(DialogHeader, { key: "header" }, "Add"), form] });
  const layoutForm = Children.toArray(layout.props.children).find((node) => isValidElement(node) && node.type === "form");
  assert.ok(isValidElement<ComponentProps<"form">>(layoutForm));
  assert.equal(layoutForm.props.onSubmit, submit);
  assert.equal(layoutForm.props.id, "purchase-entry");
  assert.equal(Children.toArray(layoutForm.props.children).length, 2); // Scrolling fields + visible actions, within the original form.
});

test("entry layout retains inline warnings and non-form action buttons", () => {
  const nodes = splitEntryChildren([
    createElement(DialogHeader, { key: "header" }, "Edit"),
    createElement("p", { key: "warning", role: "alert" }, "Stock will be deducted"),
    createElement(DialogFooter, { key: "footer" }, createElement("button", { type: "button" }, "Post Adjustment")),
  ]);
  assert.equal(nodes.body.length, 1);
  assert.equal(nodes.footers.length, 1);
});
