"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type CustomerOption = {
  _id: string;
  name: string;
  outletName?: string;
};

export function CustomerPicker({
  customers,
  value,
  onChange,
}: {
  customers: CustomerOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((customer) => customer._id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between bg-white font-normal">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.name}${selected.outletName ? ` — Outlet: ${selected.outletName}` : ""}` : "Search customer..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[calc(100vw-2rem)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search customer name..." />
          <CommandList>
            <CommandEmpty>No customer found.</CommandEmpty>
            <CommandGroup>
              {customers.map((customer) => (
                <CommandItem
                  key={customer._id}
                  value={`${customer.name} ${customer.outletName || ""}`}
                  onSelect={() => {
                    onChange(customer._id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check className={cn("mr-2 h-4 w-4", value === customer._id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{customer.name}{customer.outletName ? ` — Outlet: ${customer.outletName}` : ""}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
