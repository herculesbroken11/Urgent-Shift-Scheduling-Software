import { useNavigate } from "react-router-dom";
import { useDemo } from "@/contexts/DemoContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  Globe,
  Shield,
  ClipboardList,
  Mic,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { AppRole } from "@/lib/supabase-helpers";
import { toast } from "sonner";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.1 },
  }),
};

const roles: {
  role: AppRole;
  label: string;
  icon: React.ElementType;
  description: string;
  features: string[];
  gradient: string;
  badgeClass: string;
}[] = [
  {
    role: "agency_admin",
    label: "Agency Admin",
    icon: Shield,
    description:
      "Full control over scheduling, billing, interpreters, and analytics.",
    features: [
      "Dashboard & analytics",
      "Appointment management",
      "Interpreter & customer management",
      "Billing rates & invoices",
      "Notification templates",
      "Reports",
    ],
    gradient: "from-[hsl(var(--role-admin))]/20 to-[hsl(var(--role-admin))]/5",
    badgeClass: "bg-[hsl(var(--role-admin))]/15 text-[hsl(var(--role-admin))]",
  },
  {
    role: "requester",
    label: "Requester",
    icon: ClipboardList,
    description:
      "Submit interpreter requests, track status, and manage your bookings.",
    features: [
      "Request interpreter form",
      "Track request status",
      "View upcoming appointments",
      "Cancel requests",
    ],
    gradient:
      "from-[hsl(var(--role-requester))]/20 to-[hsl(var(--role-requester))]/5",
    badgeClass:
      "bg-[hsl(var(--role-requester))]/15 text-[hsl(var(--role-requester))]",
  },
  {
    role: "interpreter",
    label: "Interpreter",
    icon: Mic,
    description:
      "View your schedule, manage your earnings, and track certifications.",
    features: [
      "Personal schedule view",
      "Earnings dashboard",
      "Language certifications",
    ],
    gradient:
      "from-[hsl(var(--role-interpreter))]/20 to-[hsl(var(--role-interpreter))]/5",
    badgeClass:
      "bg-[hsl(var(--role-interpreter))]/15 text-[hsl(var(--role-interpreter))]",
  },
];

export default function DemoSelect() {
  const navigate = useNavigate();
  const { startDemo } = useDemo();
  const { resetUserData } = useDemoData();

  const handleSelect = (role: AppRole) => {
    startDemo(role);
    navigate("/dashboard");
  };

  const handleClearDemo = () => {
    resetUserData();
    toast.success("Demo data reset to defaults");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-background/60 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to home</span>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/25">
              <Globe className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-['Space_Grotesk'] text-xl font-bold text-foreground">
              BlueThread
            </span>
          </div>
          <div className="w-24" />
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <motion.div
          className="text-center"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <motion.div variants={fadeUp} custom={0}>
            <Badge className="mb-4 border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Interactive Demo
            </Badge>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            custom={1}
            className="font-['Space_Grotesk'] text-3xl font-bold tracking-tight text-foreground md:text-5xl"
          >
            Choose your perspective
          </motion.h1>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="mx-auto mt-4 max-w-xl text-muted-foreground"
          >
            Explore BlueThread as different users. Each role has a tailored
            portal with dedicated tools and views. Data you add persists across role switches.
          </motion.p>
        </motion.div>

        <motion.div
          className="mx-auto mt-14 grid max-w-5xl gap-6 md:grid-cols-3"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
        >
          {roles.map((r) => (
            <motion.div key={r.role} variants={fadeUp}>
              <Card
                className="group relative h-full cursor-pointer border-border/60 overflow-hidden transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                onClick={() => handleSelect(r.role)}
              >
                <div
                  className={`h-1.5 w-full bg-gradient-to-r ${r.gradient}`}
                />
                <CardContent className="p-6">
                  <Badge className={`${r.badgeClass} border-0 mb-4`}>
                    {r.label}
                  </Badge>
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                    <r.icon className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground mb-5">
                    {r.description}
                  </p>
                  <ul className="space-y-2 mb-6">
                    {r.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full gap-2 group-hover:shadow-lg group-hover:shadow-primary/20 transition-shadow">
                    Enter as {r.label}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Clear Demo Data button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-10 flex flex-col items-center gap-3"
        >
          <Button
            variant="outline"
            size="lg"
            onClick={handleClearDemo}
            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <RotateCcw className="h-4 w-4" />
            Clear Demo Data
          </Button>
          <p className="text-xs text-muted-foreground max-w-md text-center">
            Removes all data you've added during this session and restores default sample data. 
            This won't affect the demo roles or navigation.
          </p>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 text-center text-sm text-muted-foreground"
        >
          This is a fully interactive demo with sample data. No account required.
        </motion.p>
      </div>
    </div>
  );
}