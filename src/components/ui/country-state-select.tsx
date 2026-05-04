"use client";

import { useState } from "react";
import { Country, State } from "country-state-city";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
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

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  name: string;
}

function Combobox({ value, onChange, options, placeholder, searchPlaceholder, emptyText, name }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown size={14} className="ml-2 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      size={14}
                      className={cn("mr-2 shrink-0", value === opt.value ? "opacity-100" : "opacity-0")}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

interface Props {
  defaultCountry?: string;
  defaultState?: string;
}

export function CountryStateSelect({ defaultCountry = "", defaultState = "" }: Props) {
  const [countryCode, setCountryCode] = useState(defaultCountry);
  const [stateCode, setStateCode] = useState(defaultState);

  const countryOptions = Country.getAllCountries().map((c) => ({
    value: c.isoCode,
    label: c.name,
  }));

  const stateOptions = countryCode
    ? State.getStatesOfCountry(countryCode).map((s) => ({
        value: s.isoCode,
        label: s.name,
      }))
    : [];

  return (
    <>
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">Country</label>
        <Combobox
          name="country"
          value={countryCode}
          onChange={(v) => { setCountryCode(v); setStateCode(""); }}
          options={countryOptions}
          placeholder="Select country"
          searchPlaceholder="Search countries..."
          emptyText="No country found."
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">State / Region</label>
        {stateOptions.length > 0 ? (
          <Combobox
            name="state"
            value={stateCode}
            onChange={setStateCode}
            options={stateOptions}
            placeholder="Select state"
            searchPlaceholder="Search states..."
            emptyText="No state found."
          />
        ) : (
          <input
            name="state"
            defaultValue={defaultState}
            placeholder="State / Region"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        )}
      </div>
    </>
  );
}
