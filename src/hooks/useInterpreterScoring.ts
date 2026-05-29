/**
 * ScheduleAssist scoring — patient-continuity-first ranking.
 *
 * Healthcare interpretation depends on interpreter-patient relationships more
 * than technical qualifications. Weights:
 *   Patient continuity   50  (recency-tiered + frequency bonus, capped at 50)
 *   Availability         30  (no conflict)
 *   Language match       12  (baseline — incompatible already filtered)
 *   Certification bonus   8  (added when certified for the language)
 *   Region coverage       5  (or neutral 5 when regions disabled / no region)
 *
 * Previously-rejected interpreters get a -20 penalty.
 * Final score is clamped to [0, 100].
 */
import { useMemo } from "react";
import type {
  InterpreterScheduleEntry, UnassignedAppointment, WizardInterpreter,
} from "./useScheduleWizard";
import type { ConflictHit } from "@/components/scheduleWizard/dispatch-utils";
import type { PatientAppointment } from "./usePatientHistory";

export interface ContinuityInfo {
  hasHistory: boolean;
  appointmentCount: number;
  lastAppointmentIso: string | null;
  daysSinceLast: number | null;
  /** "regular" | "recent" | "previous" | "past" | "none" */
  tier: "regular" | "recent" | "previous" | "past" | "none";
  /** "primary" | "frequent" | "occasional" — based on count */
  frequency: "primary" | "frequent" | "occasional";
}

export interface ScoredInterpreter {
  interpreter: WizardInterpreter;
  score: number;
  breakdown: {
    continuityScore: number;
    continuity: ContinuityInfo;
    available: number;
    languageScore: number;
    languageCertified: boolean;
    certificationBonus: number;
    regionFit: number;
    regionApplicable: boolean;
    rejectionPenalty: number;
  };
  conflict: ConflictHit | null;
  previouslyRejected: boolean;
}

interface ScoringInput {
  interpreters: WizardInterpreter[];
  selectedJob: UnassignedAppointment | null;
  schedules: Map<string, InterpreterScheduleEntry[]> | undefined;
  regionsEnabled: boolean;
  agencyTz: string;
  rejectedInterpreterIds: Set<string>;
  /** Prior completed appointments for the selected job's patient. */
  patientHistory?: PatientAppointment[];
}

interface ScoringOutput {
  recommended: ScoredInterpreter[];
  others: ScoredInterpreter[];
  allBusy: boolean;
}

/* -------------------- helpers -------------------- */

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
}

function daysBetween(fromIso: string, toMs: number): number {
  return Math.floor((toMs - new Date(fromIso).getTime()) / (24 * 60 * 60 * 1000));
}

function computeContinuity(
  interpreterId: string,
  patientHistory: PatientAppointment[],
): { score: number; info: ContinuityInfo } {
  const mine = patientHistory.filter((p) => p.interpreter_id === interpreterId && p.scheduled_start);

  if (mine.length === 0) {
    return {
      score: 0,
      info: {
        hasHistory: false,
        appointmentCount: 0,
        lastAppointmentIso: null,
        daysSinceLast: null,
        tier: "none",
        frequency: "occasional",
      },
    };
  }

  // patientHistory is already ordered desc by scheduled_start in the hook,
  // but be defensive and recompute the most recent.
  let latestIso = mine[0].scheduled_start as string;
  for (const m of mine) {
    if (m.scheduled_start && m.scheduled_start > latestIso) latestIso = m.scheduled_start;
  }
  const days = daysBetween(latestIso, Date.now());

  let recencyScore = 10;
  let tier: ContinuityInfo["tier"] = "past";
  if (days <= 30) { recencyScore = 50; tier = "regular"; }
  else if (days <= 90) { recencyScore = 35; tier = "recent"; }
  else if (days <= 365) { recencyScore = 20; tier = "previous"; }

  let frequencyBonus = 0;
  let frequency: ContinuityInfo["frequency"] = "occasional";
  if (mine.length >= 10) { frequencyBonus = 5; frequency = "primary"; }
  else if (mine.length >= 5) { frequencyBonus = 3; frequency = "frequent"; }

  // Cap continuity contribution at 50 so it can never exceed its weight.
  const score = Math.min(50, recencyScore + frequencyBonus);

  return {
    score,
    info: {
      hasHistory: true,
      appointmentCount: mine.length,
      lastAppointmentIso: latestIso,
      daysSinceLast: days,
      tier,
      frequency,
    },
  };
}

/* -------------------- the hook -------------------- */

export function useInterpreterScoring({
  interpreters, selectedJob, schedules, regionsEnabled, agencyTz: _agencyTz,
  rejectedInterpreterIds, patientHistory,
}: ScoringInput): ScoringOutput {
  return useMemo<ScoringOutput>(() => {
    if (!selectedJob || !selectedJob.language_id) {
      return { recommended: [], others: [], allBusy: false };
    }

    const jobLangId = selectedJob.language_id;
    const jobRegionId = selectedJob.locations?.region_id ?? null;
    const history = patientHistory ?? [];

    // Filter to language-compatible interpreters only
    const compatible = interpreters.filter((i) =>
      i.languages.some((l) => l.language_id === jobLangId),
    );

    const scored: ScoredInterpreter[] = compatible.map((interp) => {
      const entries = schedules?.get(interp.id) ?? [];

      // Conflict at the selected job's time window
      let conflict: ConflictHit | null = null;
      if (selectedJob.scheduled_start && selectedJob.scheduled_end) {
        for (const e of entries) {
          if (rangesOverlap(selectedJob.scheduled_start, selectedJob.scheduled_end, e.start, e.end)) {
            conflict = {
              type: e.type,
              conflicting_entity_id: e.appointment_id ?? e.availability_id ?? null,
              start: e.start,
              end: e.end,
            };
            break;
          }
        }
      }

      // Patient continuity (50)
      const { score: continuityScore, info: continuity } = computeContinuity(interp.id, history);

      // Availability (30)
      const available = conflict ? 0 : 30;

      // Language baseline (12) + certification bonus (8)
      const langRow = interp.languages.find((l) => l.language_id === jobLangId);
      const languageCertified = !!langRow?.certified;
      const languageScore = 12;
      const certificationBonus = languageCertified ? 8 : 0;

      // Region (5) — neutral when not applicable
      const regionApplicable = regionsEnabled && !!jobRegionId;
      let regionFit = 5;
      if (regionApplicable && jobRegionId) {
        regionFit = interp.region_ids.includes(jobRegionId) ? 5 : 0;
      }

      // Previously-rejected penalty (-20)
      const previouslyRejected = rejectedInterpreterIds.has(interp.id);
      const rejectionPenalty = previouslyRejected ? -20 : 0;

      const raw =
        continuityScore + available + languageScore + certificationBonus +
        regionFit + rejectionPenalty;
      const score = Math.max(0, Math.min(100, raw));

      return {
        interpreter: interp,
        score,
        breakdown: {
          continuityScore, continuity,
          available,
          languageScore, languageCertified, certificationBonus,
          regionFit, regionApplicable,
          rejectionPenalty,
        },
        conflict,
        previouslyRejected,
      };
    });

    // Sort by score desc, then alphabetical
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const an = `${a.interpreter.first_name ?? ""} ${a.interpreter.last_name ?? ""}`;
      const bn = `${b.interpreter.first_name ?? ""} ${b.interpreter.last_name ?? ""}`;
      return an.localeCompare(bn);
    });

    // Recommended = top 3 OR anyone scoring 85+
    const HIGH_THRESHOLD = 85;
    const recommended: ScoredInterpreter[] = [];
    const others: ScoredInterpreter[] = [];
    scored.forEach((s, idx) => {
      if (idx < 3 || s.score >= HIGH_THRESHOLD) recommended.push(s);
      else others.push(s);
    });

    const allBusy = recommended.length > 0 && recommended.every((s) => s.conflict);

    return { recommended, others, allBusy };
  }, [interpreters, selectedJob, schedules, regionsEnabled, rejectedInterpreterIds, patientHistory]);
}

/* -------------------- tooltip text -------------------- */

function describeContinuity(c: ContinuityInfo): string {
  if (!c.hasHistory) return "○ New to this patient";
  const apptWord = c.appointmentCount === 1 ? "appointment" : "appointments";
  const days = c.daysSinceLast ?? 0;
  const lastPhrase =
    days === 0 ? "today" :
    days === 1 ? "yesterday" :
    days < 30 ? `${days} days ago` :
    days < 60 ? "about a month ago" :
    days < 365 ? `${Math.round(days / 30)} months ago` :
    `${Math.round(days / 365)} year${days >= 730 ? "s" : ""} ago`;

  const label =
    c.tier === "regular" ? (c.frequency === "primary" ? "Primary interpreter" : c.frequency === "frequent" ? "Frequent interpreter" : "Regular interpreter") :
    c.tier === "recent" ? "Recent interpreter" :
    c.tier === "previous" ? "Previous interpreter" :
    "Past interpreter";

  return `✓ ${label} (${c.appointmentCount} ${apptWord}, last ${lastPhrase})`;
}

export function formatScoreBreakdown(
  s: ScoredInterpreter,
  jobLanguageName: string | undefined,
  jobRegionName: string | undefined,
): string[] {
  const lines: string[] = [];

  // 1. Continuity (most important first)
  lines.push(describeContinuity(s.breakdown.continuity));

  // 2. Availability
  lines.push(s.breakdown.available > 0 ? "✓ Available during requested time" : "⚠ Scheduling conflict");

  // 3. Language
  lines.push(`✓ Speaks ${jobLanguageName ?? "this language"}`);

  // 4. Certification
  lines.push(
    s.breakdown.languageCertified
      ? `✓ Certified for ${jobLanguageName ?? "this language"}`
      : "○ Not certified",
  );

  // 5. Region (minimal emphasis)
  if (s.breakdown.regionApplicable) {
    lines.push(
      s.breakdown.regionFit > 0
        ? `✓ Covers ${jobRegionName ?? "this region"}`
        : `○ Outside ${jobRegionName ?? "this region"}`,
    );
  }

  if (s.previouslyRejected) {
    lines.push("⚠ Previously declined this appointment");
  }

  return lines;
}
