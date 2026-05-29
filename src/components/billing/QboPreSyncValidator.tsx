import { useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { QboItemMapping } from "@/hooks/useQboConnection";
import type { BillingLineItem } from "@/lib/billing-engine";

/** All known line item types the billing engine can emit */
const ALL_LINE_ITEM_TYPES = [
  "time", "base", "after_hours", "weekend", "holiday", "overtime",
  "same_day", "same_day_fee", "same_day_travel",
  "travel_mileage", "travel_time", "parking",
  "cancellation", "minimum_adjustment",
];

interface QboPreSyncValidatorProps {
  mappings: QboItemMapping[];
  lineItems?: BillingLineItem[];
}

export function useQboMappingValidation(mappings: QboItemMapping[]) {
  return useMemo(() => {
    const activeTypes = new Set(
      mappings.filter((m) => m.is_active).map((m) => m.line_item_type)
    );
    const unmapped = ALL_LINE_ITEM_TYPES.filter((t) => !activeTypes.has(t));
    return { unmapped, allMapped: unmapped.length === 0, activeTypes };
  }, [mappings]);
}

export function validateLineItemsForSync(
  lineItems: BillingLineItem[],
  mappings: QboItemMapping[]
): { valid: boolean; unmappedTypes: string[] } {
  const activeTypes = new Set(
    mappings.filter((m) => m.is_active).map((m) => m.line_item_type)
  );
  const usedTypes = new Set(lineItems.map((li) => li.type));
  const unmappedTypes = [...usedTypes].filter((t) => !activeTypes.has(t));
  return { valid: unmappedTypes.length === 0, unmappedTypes };
}

export function QboPreSyncAlert({ mappings, lineItems }: QboPreSyncValidatorProps) {
  const { unmapped, allMapped } = useQboMappingValidation(mappings);

  // If specific line items provided, check only those
  const usedUnmapped = useMemo(() => {
    if (!lineItems) return unmapped;
    const usedTypes = new Set(lineItems.map((li) => li.type));
    return unmapped.filter((t) => usedTypes.has(t));
  }, [unmapped, lineItems]);

  if (usedUnmapped.length === 0) {
    return (
      <Alert className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/5">
        <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
        <AlertTitle>QBO Mapping Complete</AlertTitle>
        <AlertDescription>All billing line item types are mapped to QuickBooks service items.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <XCircle className="h-4 w-4" />
      <AlertTitle>QBO Sync Blocked — Unmapped Line Items</AlertTitle>
      <AlertDescription>
        <p className="mb-2">The following billing line item types have no QBO mapping and will block sync:</p>
        <div className="flex flex-wrap gap-1.5">
          {usedUnmapped.map((t) => (
            <Badge key={t} variant="destructive" className="text-xs font-mono">{t}</Badge>
          ))}
        </div>
        <p className="mt-2 text-xs">Add mappings in Settings → Billing Integrations → QBO Item Mappings.</p>
      </AlertDescription>
    </Alert>
  );
}
