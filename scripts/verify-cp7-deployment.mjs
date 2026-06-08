/**
 * Read-only CP7 deployment verification (no sensitive row data).
 * Usage: node scripts/verify-cp7-deployment.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "https://jznpmbkmipajyhlivtgy.supabase.co";
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6bnBtYmttaXBhanlobGl2dGd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDkwNjQsImV4cCI6MjA4NzUyNTA2NH0.ya0tn-XriSiWDiol5a51Dvg1BK5DWyZiOdHqa5VqKGs";

const sb = createClient(url, key);

function classifyRpcError(fn, error) {
  if (!error) return { fn, status: "ok" };
  const msg = error.message || "";
  if (error.code === "PGRST202") return { fn, status: "missing", code: error.code };
  if (error.code === "PGRST203") return { fn, status: "ambiguous_overload", code: error.code };
  if (msg.includes("Not authenticated") || msg.includes("Not authorized")) {
    return { fn, status: "present_auth_gated", code: error.code, hint: msg.split("\n")[0] };
  }
  return { fn, status: "present_other_error", code: error.code, hint: msg.split("\n")[0] };
}

async function main() {
  const results = [];

  results.push(
    classifyRpcError(
      "assign_interpreter_with_conflict_check",
      (
        await sb.rpc("assign_interpreter_with_conflict_check", {
          _appointment_id: "00000000-0000-0000-0000-000000000001",
          _interpreter_id: "00000000-0000-0000-0000-000000000002",
          _mode: "offer",
        })
      ).error,
    ),
  );

  results.push(
    classifyRpcError(
      "check_interpreter_schedule_conflicts",
      (
        await sb.rpc("check_interpreter_schedule_conflicts", {
          _interpreter_id: "00000000-0000-0000-0000-000000000002",
          _scheduled_start: "2026-06-10T10:00:00Z",
          _scheduled_end: "2026-06-10T11:00:00Z",
        })
      ).error,
    ),
  );

  results.push(
    classifyRpcError(
      "check_interpreter_schedule_conflicts_batch",
      (
        await sb.rpc("check_interpreter_schedule_conflicts_batch", {
          _interpreter_id: "00000000-0000-0000-0000-000000000002",
          _occurrences: [{ start: "2026-06-10T10:00:00Z", end: "2026-06-10T11:00:00Z" }],
        })
      ).error,
    ),
  );

  results.push(
    classifyRpcError(
      "search_appointments",
      (
        await sb.rpc("search_appointments", {
          _page: 0,
          _page_size: 1,
          _statuses: ["requested"],
        })
      ).error,
    ),
  );

  results.push(
    classifyRpcError(
      "get_dashboard_counts",
      (
        await sb.rpc("get_dashboard_counts", {
          _agency_id: "00000000-0000-0000-0000-000000000001",
          _statuses: ["requested"],
        })
      ).error,
    ),
  );

  const { count, error: countErr } = await sb
    .from("appointments")
    .select("id", { count: "exact", head: true });

  console.log(JSON.stringify({ rpc: results, appointments_anon_count: count, count_error: countErr?.code }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
