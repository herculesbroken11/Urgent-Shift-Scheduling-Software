import { Link } from "react-router-dom";
import { isDemoFeatureEnabled } from "@/lib/demo-config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Calendar,
  Users,
  Globe,
  CreditCard,
  Bell,
  Shield,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  Star,
  Zap,
  BarChart3,
  Clock,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const features = [
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "Manage appointments with calendar views, drag-and-drop assignment, and recurring series.",
    span: "md:col-span-2",
  },
  {
    icon: Users,
    title: "Role-Based Portals",
    description: "Dedicated dashboards for admins, requesters, and interpreters — each with tailored tools.",
    span: "",
  },
  {
    icon: Globe,
    title: "Language Matching",
    description: "Track certifications, language pairs, and match jobs to qualified interpreters by region.",
    span: "",
  },
  {
    icon: CreditCard,
    title: "Billing & Invoicing",
    description: "Configurable billing bundles, rate cards, parking & mileage tracking, and invoice generation.",
    span: "md:col-span-2",
  },
  {
    icon: Bell,
    title: "Notification Templates",
    description: "Customizable email and SMS templates for every appointment lifecycle event.",
    span: "",
  },
  {
    icon: Shield,
    title: "Audit Trails & Compliance",
    description: "Full appointment history, signature capture with geolocation, and role-based access control.",
    span: "",
  },
];

const pricingTiers = [
  {
    name: "Starter",
    price: "$100",
    period: "/month",
    description: "For small agencies getting started",
    features: [
      "Up to 200 appointments/month",
      "3 admin users",
      "Email notifications",
      "Basic reports",
      "Email support",
    ],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Professional",
    price: "$0.50",
    period: "/appointment",
    description: "Pay as you grow, $100/mo minimum",
    features: [
      "Unlimited appointments",
      "Unlimited users",
      "SMS & email notifications",
      "Advanced billing bundles",
      "Calendar sync",
      "Priority support",
    ],
    cta: "Request Demo",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large agencies with custom needs",
    features: [
      "Everything in Professional",
      "Custom billing bundles & workflows",
      "Dedicated account manager",
      "SLA & uptime guarantee",
      "On-boarding assistance",
      "Audit log & compliance reports",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

const testimonials = [
  {
    quote: "BlueThread cut our scheduling time in half. The signature capture and billing automation are game-changers.",
    author: "Agency Director",
    role: "Interpreting Agency",
  },
  {
    quote: "The automated billing alone paid for itself in the first month. No more spreadsheet nightmares.",
    author: "Agency Owner",
    role: "Language Services Provider",
  },
  {
    quote: "Finally a platform that understands interpreter agencies. Role-based access makes all the difference.",
    author: "Operations Manager",
    role: "Interpreting Services",
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/60 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/25">
              <Globe className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-['Space_Grotesk'] text-xl font-bold text-foreground">
              BlueThread
            </span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild><Link to="/login">Log In</Link></Button>
            <Button asChild className="shadow-lg shadow-primary/25"><Link to="/signup">Get Started</Link></Button>
          </div>
        </div>
      </header>

      {/* Hero — dark gradient section */}
      <section className="relative overflow-hidden bg-[hsl(var(--sidebar-background))] py-20 md:py-28">
        {/* Gradient orbs */}
        <div className="absolute top-[-200px] left-1/4 h-[500px] w-[500px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-[-100px] right-1/4 h-[400px] w-[400px] rounded-full bg-accent/15 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[300px] w-[600px] rounded-full bg-primary/10 blur-[80px]" />

        <div className="container relative mx-auto px-4">
          <motion.div
            className="mx-auto max-w-4xl text-center"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
          >
            <motion.div variants={fadeUp} custom={0}>
              <Badge className="mb-6 border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary-foreground/80 backdrop-blur-sm">
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                Built for interpreter agencies
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              custom={1}
              className="font-['Space_Grotesk'] text-4xl font-bold leading-[1.1] tracking-tight text-white md:text-6xl lg:text-7xl"
            >
              Scheduling that{" "}
              <span className="bg-gradient-to-r from-[hsl(var(--sidebar-primary))] to-[hsl(var(--accent))] bg-clip-text text-transparent">
                speaks your language
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              custom={2}
              className="mx-auto mt-6 max-w-2xl text-lg text-[hsl(var(--sidebar-foreground))]/70 md:text-xl"
            >
              Schedule, assign, bill, and communicate — all from one place.
              BlueThread streamlines your agency so you can focus on connecting people.
            </motion.p>

            <motion.div variants={fadeUp} custom={3} className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" className="gap-2 text-base shadow-xl shadow-primary/30 h-12 px-8" asChild>
                <Link to="/signup">Start Free Trial <ArrowRight className="h-4 w-4" /></Link>
              </Button>
              {isDemoFeatureEnabled() && (
                <Button size="lg" variant="secondary" className="gap-2 text-base h-12 px-8 bg-white text-[hsl(var(--sidebar-background))] hover:bg-white/90 font-semibold shadow-xl" asChild>
                  <Link to="/demo">Explore Demo</Link>
                </Button>
              )}
            </motion.div>
          </motion.div>

          {/* Stats bar */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="mx-auto mt-16 max-w-3xl"
          >
            <div className="grid grid-cols-3 gap-px rounded-2xl bg-white/5 p-px overflow-hidden">
              {[
                { value: "∞", label: "Appointments capacity", icon: Calendar },
                { value: "24/7", label: "Always available", icon: Clock },
                { value: "99.9%", label: "Uptime target", icon: Zap },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col items-center gap-1 bg-white/[0.03] p-6 backdrop-blur-sm first:rounded-l-2xl last:rounded-r-2xl">
                  <stat.icon className="h-4 w-4 text-[hsl(var(--sidebar-primary))] mb-1" />
                  <span className="font-['Space_Grotesk'] text-2xl font-bold text-white md:text-3xl">{stat.value}</span>
                  <span className="text-xs text-[hsl(var(--sidebar-foreground))]/50">{stat.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Industry section */}
      <section className="border-b border-border py-8">
        <div className="container mx-auto px-4">
          <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Purpose-built for the language services industry
          </p>
        </div>
      </section>

      {/* Features — Bento grid */}
      <section id="features" className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            <motion.div variants={fadeUp}>
              <Badge variant="outline" className="mb-4">Features</Badge>
            </motion.div>
            <motion.h2 variants={fadeUp} className="font-['Space_Grotesk'] text-3xl font-bold text-foreground md:text-5xl">
              Everything your agency needs
            </motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              From scheduling to invoicing, BlueThread covers every step of your interpreting workflow.
            </motion.p>
          </motion.div>

          <motion.div
            className="mt-14 grid gap-4 md:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          >
            {features.map((feature) => (
              <motion.div key={feature.title} variants={fadeUp} className={feature.span}>
                <Card className="group relative h-full overflow-hidden border-border/60 bg-card transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <CardContent className="relative p-6 md:p-8">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-['Space_Grotesk'] text-lg font-semibold text-foreground">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How it works — visual flow */}
      <section className="bg-muted/40 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            <motion.h2 variants={fadeUp} className="font-['Space_Grotesk'] text-3xl font-bold text-foreground md:text-5xl">
              Up and running in minutes
            </motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Three steps to transform your agency operations.
            </motion.p>
          </motion.div>

          <motion.div
            className="mt-14 grid gap-6 md:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={{ visible: { transition: { staggerChildren: 0.15 } } }}
          >
            {[
              { step: "01", title: "Create your agency", desc: "Sign up and configure your billing rates, languages, regions, and notification templates.", icon: Zap },
              { step: "02", title: "Invite your team", desc: "Add interpreters and requesters. Each gets their own tailored portal with dedicated tools.", icon: Users },
              { step: "03", title: "Start scheduling", desc: "Accept requests, assign interpreters, capture signatures, and let automated billing handle the rest.", icon: BarChart3 },
            ].map((s) => (
              <motion.div key={s.step} variants={fadeUp}>
                <Card className="relative h-full border-border/60 overflow-hidden">
                  <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-primary to-accent" />
                  <CardContent className="p-8">
                    <span className="font-['Space_Grotesk'] text-5xl font-bold text-primary/10">{s.step}</span>
                    <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <s.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="mt-4 font-['Space_Grotesk'] text-xl font-semibold text-foreground">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Role Breakdown */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            <motion.h2 variants={fadeUp} className="font-['Space_Grotesk'] text-3xl font-bold text-foreground md:text-5xl">
              Built for every role
            </motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Each user gets a tailored experience with only the tools they need.
            </motion.p>
          </motion.div>
          <motion.div
            className="mt-14 grid gap-4 md:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          >
            {[
              { role: "Agency Admin", color: "from-primary/20 to-primary/5", badge: "bg-primary/15 text-primary", items: ["Dashboard & analytics", "Appointment management", "Interpreter & customer management", "Billing rates, rules & invoices", "Notification templates & audit log", "Reports & calendar sync"] },
              { role: "Requester", color: "from-accent/20 to-accent/5", badge: "bg-accent/15 text-accent", items: ["Request interpreter form", "Track request status", "View upcoming appointments", "Cancel requests"] },
              { role: "Interpreter", color: "from-orange-500/20 to-orange-500/5", badge: "bg-orange-500/15 text-orange-600", items: ["Personal schedule view", "Earnings dashboard", "Language certifications", "Signature capture & completion", "Block time / availability"] },
            ].map((portal) => (
              <motion.div key={portal.role} variants={fadeUp}>
                <Card className="group h-full border-border/60 overflow-hidden transition-all hover:shadow-md">
                  <div className={`h-1.5 w-full bg-gradient-to-r ${portal.color}`} />
                  <CardContent className="p-6">
                    <Badge className={`${portal.badge} border-0 mb-4`}>{portal.role}</Badge>
                    <ul className="space-y-2.5">
                      {portal.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-muted/40 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            <motion.div variants={fadeUp}><Badge variant="outline" className="mb-4">Pricing</Badge></motion.div>
            <motion.h2 variants={fadeUp} className="font-['Space_Grotesk'] text-3xl font-bold text-foreground md:text-5xl">
              Simple, transparent pricing
            </motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Start free, scale as you grow. No hidden fees.
            </motion.p>
          </motion.div>
          <motion.div
            className="mt-14 grid gap-6 md:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            {pricingTiers.map((tier) => (
              <motion.div key={tier.name} variants={fadeUp}>
                <Card className={`relative h-full border-border/60 overflow-hidden transition-all ${tier.highlighted ? "ring-2 ring-primary shadow-xl shadow-primary/10 scale-[1.02]" : "hover:shadow-md"}`}>
                  {tier.highlighted && (
                    <>
                      <div className="absolute top-0 left-0 h-1 w-full bg-gradient-to-r from-primary to-accent" />
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground shadow-lg">Most Popular</Badge>
                      </div>
                    </>
                  )}
                  <CardContent className="p-8">
                    <h3 className="font-['Space_Grotesk'] text-xl font-semibold text-foreground">{tier.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="font-['Space_Grotesk'] text-4xl font-bold text-foreground">{tier.price}</span>
                      <span className="text-muted-foreground">{tier.period}</span>
                    </div>
                    <Button className={`mt-6 w-full ${tier.highlighted ? "shadow-lg shadow-primary/25" : ""}`} variant={tier.highlighted ? "default" : "outline"} asChild>
                      <Link to="/signup">{tier.cta}</Link>
                    </Button>
                    <ul className="mt-8 space-y-3">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <motion.div
            className="text-center"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            <motion.h2 variants={fadeUp} className="font-['Space_Grotesk'] text-3xl font-bold text-foreground md:text-5xl">
              Loved by agencies everywhere
            </motion.h2>
          </motion.div>
          <motion.div
            className="mt-14 grid gap-6 md:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            {testimonials.map((t) => (
              <motion.div key={t.author} variants={fadeUp}>
                <Card className="h-full border-border/60">
                  <CardContent className="p-8">
                    <div className="mb-4 flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                      ))}
                    </div>
                    <p className="text-base leading-relaxed text-foreground">"{t.quote}"</p>
                    <div className="mt-6 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-['Space_Grotesk'] text-sm font-bold text-primary">
                        {t.author.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.author}</p>
                        <p className="text-xs text-muted-foreground">{t.role}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA — dark */}
      <section id="demo" className="relative overflow-hidden bg-[hsl(var(--sidebar-background))] py-20 md:py-28">
        <div className="absolute top-[-100px] right-1/4 h-[300px] w-[300px] rounded-full bg-primary/15 blur-[100px]" />
        <div className="absolute bottom-[-50px] left-1/3 h-[250px] w-[250px] rounded-full bg-accent/10 blur-[80px]" />
        <div className="container relative mx-auto px-4 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
          >
            <motion.h2 variants={fadeUp} className="font-['Space_Grotesk'] text-3xl font-bold text-white md:text-5xl">
              Ready to streamline your agency?
            </motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-lg text-[hsl(var(--sidebar-foreground))]/70">
              Start your free trial today — no credit card required.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" className="gap-2 shadow-xl shadow-primary/30 h-12 px-8" asChild>
                <Link to="/signup">Get Started Free <ChevronRight className="h-4 w-4" /></Link>
              </Button>
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10 h-12 px-8" asChild>
                <a href="mailto:sales@bluethread.io">Contact Sales</a>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-md shadow-primary/20">
                <Globe className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-['Space_Grotesk'] text-lg font-bold text-foreground">BlueThread Solution</span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors">Features</a>
              <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
              <Link to="/login" className="hover:text-foreground transition-colors">Log In</Link>
              <Link to="/signup" className="hover:text-foreground transition-colors">Sign Up</Link>
            </div>
          </div>
          <div className="mt-8 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} BlueThread Solution. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
