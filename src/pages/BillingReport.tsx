import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SampleBillingReport from "@/components/billing/SampleBillingReport";
import QuickBooksExport from "@/components/billing/QuickBooksExport";
import BillingIntegrations from "@/components/billing/BillingIntegrations";
import { isDemoFeatureEnabled } from "@/lib/demo-config";

export default function BillingReport() {
  const showSampleReport = isDemoFeatureEnabled();

  return (
    <Tabs defaultValue="quickbooks" className="space-y-4">
      <TabsList>
        <TabsTrigger value="quickbooks">QuickBooks Export</TabsTrigger>
        <TabsTrigger value="integrations">Billing Integrations</TabsTrigger>
        {showSampleReport && <TabsTrigger value="sample">Sample Report</TabsTrigger>}
      </TabsList>
      <TabsContent value="quickbooks">
        <QuickBooksExport />
      </TabsContent>
      <TabsContent value="integrations">
        <BillingIntegrations />
      </TabsContent>
      {showSampleReport && (
        <TabsContent value="sample">
          <SampleBillingReport />
        </TabsContent>
      )}
    </Tabs>
  );
}
