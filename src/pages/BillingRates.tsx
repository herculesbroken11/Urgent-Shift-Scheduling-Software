import { BillingSetup } from "@/components/settings/BillingSetup";

export default function BillingRates() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing Rates</h1>
        <p className="text-sm text-muted-foreground">Configure rate bundles and billing models for customers</p>
      </div>
      <BillingSetup />
    </div>
  );
}
