import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format, subDays } from "date-fns";

const FAKE_AGENCY = { name: "Blue Thread Solutions", address: "1200 Main St, Suite 400, Charlotte, NC 28202", phone: "(704) 555-0199", email: "billing@bluethreadsolutions.com" };

const FAKE_CUSTOMER = { name: "Atrium Health – Mercy Campus", contact: "Patricia Alvarez", email: "palvarez@atriumhealth.org", address: "2001 Vail Ave, Charlotte, NC 28207" };

const today = new Date();
const periodStart = subDays(today, 30);

const FAKE_LINE_ITEMS = [
  { date: subDays(today, 28), interpreter: "Maria Santos", language: "Spanish", duration: 2.0, rate: 55, travel: 12.5, type: "on_site", title: "Cardiology Follow-up" },
  { date: subDays(today, 25), interpreter: "Maria Santos", language: "Spanish", duration: 1.5, rate: 55, travel: 0, type: "vri", title: "Lab Results Review" },
  { date: subDays(today, 22), interpreter: "Li Wei Chen", language: "Mandarin", duration: 3.0, rate: 65, travel: 18.75, type: "on_site", title: "Surgical Consult" },
  { date: subDays(today, 20), interpreter: "Ahmed Hassan", language: "Arabic", duration: 1.0, rate: 60, travel: 0, type: "opi", title: "Pharmacy Consultation" },
  { date: subDays(today, 18), interpreter: "Maria Santos", language: "Spanish", duration: 2.5, rate: 55, travel: 12.5, type: "on_site", title: "Post-Op Check" },
  { date: subDays(today, 15), interpreter: "Fatou Diallo", language: "French", duration: 1.5, rate: 55, travel: 8.25, type: "on_site", title: "OB-GYN Appointment" },
  { date: subDays(today, 12), interpreter: "Li Wei Chen", language: "Mandarin", duration: 2.0, rate: 65, travel: 18.75, type: "on_site", title: "Oncology Consult" },
  { date: subDays(today, 10), interpreter: "Maria Santos", language: "Spanish", duration: 1.0, rate: 55, travel: 0, type: "vri", title: "Discharge Instructions" },
  { date: subDays(today, 7), interpreter: "Ahmed Hassan", language: "Arabic", duration: 4.0, rate: 60, travel: 22.0, type: "on_site", title: "Mental Health Eval" },
  { date: subDays(today, 5), interpreter: "Yuki Tanaka", language: "Japanese", duration: 1.5, rate: 70, travel: 0, type: "opi", title: "Specialist Referral" },
  { date: subDays(today, 3), interpreter: "Maria Santos", language: "Spanish", duration: 2.0, rate: 55, travel: 12.5, type: "on_site", title: "Pediatric Well-Visit" },
  { date: subDays(today, 1), interpreter: "Li Wei Chen", language: "Mandarin", duration: 1.5, rate: 65, travel: 18.75, type: "on_site", title: "Physical Therapy" },
];

const modalityLabel = (t: string) => t === "on_site" ? "On-Site" : t === "vri" ? "VRI" : "OPI";
const modalityColor = (t: string) => t === "on_site" ? "default" : t === "vri" ? "secondary" : "outline";

export default function SampleBillingReport() {
  const items = FAKE_LINE_ITEMS.map((li) => {
    const serviceAmt = li.duration * li.rate;
    return { ...li, serviceAmt, totalAmt: serviceAmt + li.travel };
  });

  const subtotalServices = items.reduce((s, i) => s + i.serviceAmt, 0);
  const subtotalTravel = items.reduce((s, i) => s + i.travel, 0);
  const subtotal = subtotalServices + subtotalTravel;
  const taxRate = 0;
  const taxAmt = subtotal * taxRate;
  const total = subtotal + taxAmt;

  const totalHours = items.reduce((s, i) => s + i.duration, 0);
  const uniqueInterpreters = new Set(items.map((i) => i.interpreter)).size;
  const uniqueLanguages = new Set(items.map((i) => i.language)).size;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing Report</h1>
          <p className="text-sm text-muted-foreground">
            Sample report — {format(periodStart, "MMM d, yyyy")} to {format(today, "MMM d, yyyy")}
          </p>
        </div>
        <Badge variant="outline" className="text-xs uppercase tracking-wider border-destructive/50 text-destructive">
          Sample / Preview
        </Badge>
      </div>

      {/* Agency & Customer Info */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">From</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-semibold text-foreground">{FAKE_AGENCY.name}</p>
            <p className="text-muted-foreground">{FAKE_AGENCY.address}</p>
            <p className="text-muted-foreground">{FAKE_AGENCY.phone}</p>
            <p className="text-muted-foreground">{FAKE_AGENCY.email}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bill To</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-semibold text-foreground">{FAKE_CUSTOMER.name}</p>
            <p className="text-muted-foreground">Attn: {FAKE_CUSTOMER.contact}</p>
            <p className="text-muted-foreground">{FAKE_CUSTOMER.address}</p>
            <p className="text-muted-foreground">{FAKE_CUSTOMER.email}</p>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{items.length}</p>
            <p className="text-xs text-muted-foreground">Appointments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{totalHours.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Total Hours</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{uniqueInterpreters}</p>
            <p className="text-xs text-muted-foreground">Interpreters</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{uniqueLanguages}</p>
            <p className="text-xs text-muted-foreground">Languages</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">${total.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Total Due</p>
          </CardContent>
        </Card>
      </div>

      {/* Line Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service Detail</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Interpreter</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Service</TableHead>
                <TableHead className="text-right">Travel</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-nowrap text-sm">{format(item.date, "MM/dd")}</TableCell>
                  <TableCell className="text-sm">{item.title}</TableCell>
                  <TableCell className="text-sm">{item.interpreter}</TableCell>
                  <TableCell className="text-sm">{item.language}</TableCell>
                  <TableCell>
                    <Badge variant={modalityColor(item.type) as any} className="text-xs">
                      {modalityLabel(item.type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">{item.duration.toFixed(1)}</TableCell>
                  <TableCell className="text-right text-sm">${item.rate.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-sm">${item.serviceAmt.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-sm">{item.travel > 0 ? `$${item.travel.toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="text-right text-sm font-medium">${item.totalAmt.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={7} className="text-right font-medium">Subtotal — Services</TableCell>
                <TableCell className="text-right font-medium">${subtotalServices.toFixed(2)}</TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell colSpan={7} className="text-right font-medium">Subtotal — Travel</TableCell>
                <TableCell />
                <TableCell className="text-right font-medium">${subtotalTravel.toFixed(2)}</TableCell>
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell colSpan={9} className="text-right text-base font-bold">Grand Total</TableCell>
                <TableCell className="text-right text-base font-bold text-primary">${total.toFixed(2)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Per-interpreter summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interpreter Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Interpreter</TableHead>
                <TableHead className="text-right">Appointments</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Service $</TableHead>
                <TableHead className="text-right">Travel $</TableHead>
                <TableHead className="text-right">Total $</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(
                items.reduce((acc, item) => {
                  if (!acc[item.interpreter]) acc[item.interpreter] = { count: 0, hours: 0, service: 0, travel: 0 };
                  acc[item.interpreter].count++;
                  acc[item.interpreter].hours += item.duration;
                  acc[item.interpreter].service += item.serviceAmt;
                  acc[item.interpreter].travel += item.travel;
                  return acc;
                }, {} as Record<string, { count: number; hours: number; service: number; travel: number }>)
              )
                .sort((a, b) => b[1].service - a[1].service)
                .map(([name, s]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                    <TableCell className="text-right">{s.hours.toFixed(1)}</TableCell>
                    <TableCell className="text-right">${s.service.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${s.travel.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium">${(s.service + s.travel).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            Payment terms: Net 30 · Please reference invoice number when remitting payment ·
            Rates applied per contract agreement dated Jan 1, 2026 · Travel reimbursement at IRS standard mileage rate ($0.655/mi) ·
            Minimum 1-hour billing per appointment
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
