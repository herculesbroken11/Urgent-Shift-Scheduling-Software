import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SampleBillingReport from "@/components/billing/SampleBillingReport";
import QuickBooksExport from "@/components/billing/QuickBooksExport";
import BillingIntegrations from "@/components/billing/BillingIntegrations";

export default function BillingReport() {
  return (
    <Tabs defaultValue="quickbooks" className="space-y-4">
      <TabsList>
        <TabsTrigger value="quickbooks">QuickBooks Export</TabsTrigger>
        <TabsTrigger value="integrations">Billing Integrations</TabsTrigger>
        <TabsTrigger value="sample">Sample Report</TabsTrigger>
      </TabsList>
      <TabsContent value="quickbooks">
        <QuickBooksExport />
      </TabsContent>
      <TabsContent value="integrations">
        <BillingIntegrations />
      </TabsContent>
      <TabsContent value="sample">
        <SampleBillingReport />
      </TabsContent>
    </Tabs>
  );
}
