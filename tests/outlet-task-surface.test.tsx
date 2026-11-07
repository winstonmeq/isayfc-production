import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/pos/OutletTaskSurface";

test("outlet page surface renders inline content without modal semantics", () => {
  const html = renderToStaticMarkup(<Dialog pageMode open><DialogContent><DialogHeader><DialogTitle>Inventory</DialogTitle><DialogDescription>Outlet A</DialogDescription></DialogHeader><p>Stock list</p><DialogFooter>Save</DialogFooter></DialogContent></Dialog>);
  assert.match(html, /<section/);
  assert.match(html, /<h2[^>]*>Inventory<\/h2>/);
  assert.match(html, /Stock list/);
  assert.match(html, /<footer/);
  assert.doesNotMatch(html, /role="dialog"|aria-modal|data-slot="dialog-overlay"|position:fixed/);
});

test("closed inline surface does not render hidden transaction forms", () => {
  assert.equal(renderToStaticMarkup(<Dialog pageMode open={false}><DialogContent>Hidden</DialogContent></Dialog>), "");
});
