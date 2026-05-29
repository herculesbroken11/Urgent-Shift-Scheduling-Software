import { usePlatformAgencies, usePlatformAction } from "@/hooks/usePlatformData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

const FEATURE_FLAGS = [
  { key: "self_claim", label: "Self-Claim" },
  { key: "reminders", label: "Reminders" },
  { key: "import_platform", label: "Import Platform" },
  { key: "qbo_direct_sync", label: "QBO Direct Sync" },
  { key: "csv_mode", label: "CSV Mode" },
  { key: "security_dashboard", label: "Security Dashboard" },
  { key: "regions", label: "Regions" },
  { key: "dynamic_statuses", label: "Dynamic Statuses" },
  { key: "pilot_features", label: "Pilot Features" },
];

export default function PlatformFeatureFlags() {
  const { data: agencies = [], isLoading } = usePlatformAgencies();
  const action = usePlatformAction();

  const toggleFlag = (agencyId: string, currentFlags: any, flagKey: string) => {
    const updated = { ...currentFlags, [flagKey]: !currentFlags[flagKey] };
    action.mutate({ action: 'agency.update', agency_id: agencyId, feature_flags: updated });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Feature Flag Management</h1>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-30 min-w-[150px]">Agency</TableHead>
                {FEATURE_FLAGS.map((f) => (
                  <TableHead key={f.key} className="text-center min-w-[100px] text-xs">{f.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(agencies as any[]).map((a: any) => {
                const flags = a.feature_flags || {};
                return (
                  <TableRow key={a.id}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium">{a.name}</TableCell>
                    {FEATURE_FLAGS.map((f) => (
                      <TableCell key={f.key} className="text-center">
                        <Switch
                          checked={!!flags[f.key]}
                          onCheckedChange={() => toggleFlag(a.id, flags, f.key)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
