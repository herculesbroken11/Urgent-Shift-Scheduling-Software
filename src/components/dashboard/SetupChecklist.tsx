import { useNavigate } from "react-router-dom";
import { useCustomers, useAgencyInterpreters } from "@/hooks/useAgencyData";
import { useBillingRates } from "@/hooks/useBillingData";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ArrowRight, Rocket, Building2, Users, DollarSign, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePaginatedAppointments } from "@/hooks/usePaginatedAppointments";

interface Step {
  label: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
  icon: React.ElementType;
}

export function SetupChecklist() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const { data: customers = [] } = useCustomers();
  const { data: interpreters = [] } = useAgencyInterpreters();
  const { data: billingRates = [] } = useBillingRates();
  const { data: appointments } = usePaginatedAppointments({ pageSize: 1 });

  if (!hasRole("agency_admin")) return null;

  const hasAppointments = (appointments?.data?.length ?? 0) > 0;

  const steps: Step[] = [
    {
      label: "Add your first customer",
      description: "Create a customer organization to schedule appointments for.",
      done: customers.length > 0,
      href: "/customers",
      cta: "Add Customer",
      icon: Building2,
    },
    {
      label: "Invite an interpreter",
      description: "Add interpreters who will be assigned to appointments.",
      done: interpreters.length > 0,
      href: "/interpreters",
      cta: "Add Interpreter",
      icon: Users,
    },
    {
      label: "Set up billing rates",
      description: "Configure how appointments are billed to customers.",
      done: billingRates.length > 0,
      href: "/billing-rates",
      cta: "Configure Billing",
      icon: DollarSign,
    },
    {
      label: "Create your first appointment",
      description: "Schedule an interpreting appointment to see everything in action.",
      done: hasAppointments,
      href: "/appointments",
      cta: "Create Appointment",
      icon: CalendarPlus,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const progressPercent = (completedCount / steps.length) * 100;

  if (allDone) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Get Started</CardTitle>
        </div>
        <CardDescription>
          Complete these steps to set up your agency
        </CardDescription>
        <div className="flex items-center gap-3 pt-2">
          <Progress value={progressPercent} className="h-2 flex-1" />
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {completedCount}/{steps.length} complete
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step, idx) => {
          const StepIcon = step.icon;
          return (
            <div
              key={step.label}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                step.done
                  ? "bg-background/50 border-border/50"
                  : "bg-background border-border hover:border-primary/30"
              )}
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-muted-foreground/30 shrink-0">
                  <span className="text-[10px] font-bold text-muted-foreground">{idx + 1}</span>
                </div>
              )}
              <StepIcon className={cn("h-4 w-4 shrink-0", step.done ? "text-muted-foreground/50" : "text-primary")} />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>
                  {step.label}
                </p>
                {!step.done && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                )}
              </div>
              {!step.done && (
                <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => navigate(step.href)}>
                  {step.cta}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
