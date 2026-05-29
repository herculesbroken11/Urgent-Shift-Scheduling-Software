import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { STANDARD_TABS } from "@/lib/workbook-template";
import { downloadTemplateXlsx, downloadExportXlsx, type AgencyExportData } from "@/lib/workbook-xlsx";
import { useCustomers, useLocations, useAgencyInterpreters, useAppointments } from "@/hooks/useAgencyData";
import { useCustomerRequestors } from "@/hooks/useCustomerRequestors";
import { useBillingRates } from "@/hooks/useBillingData";
import { useInterpreterPayRates } from "@/hooks/useInterpreterPayRates";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function WorkbookTemplateDownload() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: customers = [] } = useCustomers();
  const { data: locations = [] } = useLocations();
  const { data: interpreters = [] } = useAgencyInterpreters();
  const { data: appointments = [] } = useAppointments();
  const { data: requestors = [] } = useCustomerRequestors();
  const { data: rates = [] } = useBillingRates();
  const { data: payRates = [] } = useInterpreterPayRates();
  const [exporting, setExporting] = useState(false);

  const handleExport = () => {
    setExporting(true);
    try {
      const exportData: AgencyExportData = {
        customers: customers as any[],
        locations: locations as any[],
        requesters: (requestors as any[]).map((r: any) => ({
          first_name: r.profiles?.first_name || r.first_name || "",
          last_name: r.profiles?.last_name || r.last_name || "",
          email: r.profiles?.email || r.email || "",
          phone: r.profiles?.phone || r.phone || "",
          customer_id: r.customer_id,
        })),
        interpreters: (interpreters as any[]).map((i: any) => ({
          ...i,
          languages_text: "",
        })),
        appointments: appointments as any[],
        customerBillingBundles: rates as any[],
        interpreterPayBundles: payRates as any[],
      };
      const agencyName = profile?.agency_id ? "Agency" : "Export";
      downloadExportXlsx(exportData, agencyName);
      toast.success(`Exported ${customers.length} customers, ${appointments.length} appointments`);
    } catch (e: any) {
      toast.error("Export failed: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Data Import &amp; Export
        </CardTitle>
        <CardDescription>
          Download the standard workbook template, export your agency data, or import new data.
          The same multi-tab format is used for both import and export.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Button variant="outline" onClick={downloadTemplateXlsx} className="justify-start">
            <Download className="h-4 w-4 mr-2" />
            Download Template (.xlsx)
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting}
            className="justify-start"
          >
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export Agency Data (.xlsx)
          </Button>
          <Button variant="outline" onClick={() => navigate("/import")} className="justify-start">
            <Upload className="h-4 w-4 mr-2" />
            Import Data
          </Button>
        </div>

        <div className="border rounded-md p-3 space-y-2">
          <p className="text-sm font-medium">Standard Workbook Tabs</p>
          <div className="grid gap-1">
            {STANDARD_TABS.map((tab) => (
              <div key={tab.name} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                  {tab.name}
                </span>
                <span className="text-muted-foreground">{tab.purpose}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          <strong>Key rules:</strong> Customer Name must match exactly across all tabs.
          Status defaults to "requested" when blank. Client Initials is metadata only.
          The "At" column resolves to Customer Locations by exact name match.
        </p>
      </CardContent>
    </Card>
  );
}
