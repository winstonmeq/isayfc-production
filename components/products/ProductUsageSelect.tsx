"use client";

import { PRODUCT_USAGE_OPTIONS } from "@/lib/product-usage";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ProductUsageSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>Usage</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label="Product usage"><SelectValue /></SelectTrigger><SelectContent>{PRODUCT_USAGE_OPTIONS.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>;
}
