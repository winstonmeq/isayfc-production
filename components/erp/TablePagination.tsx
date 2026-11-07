"use client";

import { Button } from "@/components/ui/button";
import { TABLE_PAGE_SIZES } from "@/lib/table-pagination";

type Props = {
  page: number; pageSize: number; totalPages: number; total: number; from: number; to: number;
  disabled?: boolean; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void;
};
export function TablePagination({ page, pageSize, totalPages, total, from, to, disabled, onPageChange, onPageSizeChange }: Props) {
  return <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-white px-5 py-3 text-sm">
    <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2">Rows<select aria-label="Rows per page" className="rounded-md border bg-white px-2 py-1.5" value={pageSize} disabled={disabled} onChange={event => onPageSizeChange(Number(event.target.value))}>{TABLE_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label><span className="text-slate-500" aria-live="polite">Showing {from}–{to} of {total}</span></div>
    <nav aria-label="Table pagination" className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button><span className="whitespace-nowrap text-slate-600">Page {page} of {totalPages}</span><Button size="sm" variant="outline" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button></nav>
  </div>;
}
