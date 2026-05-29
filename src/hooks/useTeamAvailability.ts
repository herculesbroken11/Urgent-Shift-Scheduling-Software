import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { supabase } from "@/integrations/supabase/client";
import { useAdaptedQuery } from "@/lib/data-adapter";

export interface InterpreterBlock {
  id: string;
  interpreter_id: string;
  first_name: string;
  last_name: string;
  languages: { id: string; name: string }[];
  is_recurring: boolean;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  specific_date: string | null;
  end_date: string | null;
  is_all_day: boolean;
}

export interface InterpreterInfo {
  name: string;
  languages: { id: string; name: string }[];
  blocks: InterpreterBlock[];
}

export function useTeamAvailability() {
  const { user } = useAuth();
  const { state } = useDemoData();
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const { data: myLanguages = [] } = useAdaptedQuery<{ language_id: string; name: string }[]>({
    queryKey: ["my-languages-for-shared", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interpreter_languages")
        .select("language_id, languages(name)")
        .eq("interpreter_id", user!.id);
      if (error) throw error;
      return (data || []).map((d: any) => ({ language_id: d.language_id, name: d.languages?.name || "" }));
    },
    demoFn: () => {
      return state.interpreterLanguages
        .filter((il: any) => il.interpreter_id === user?.id)
        .map((il: any) => {
          const lang = state.languages.find((l: any) => l.id === il.language_id);
          return { language_id: il.language_id, name: lang?.name || "" };
        });
    },
    enabled: !!user,
  });

  if (myLanguages.length > 0 && !initialized) {
    setSelectedLanguages(new Set(myLanguages.map((l) => l.language_id)));
    setInitialized(true);
  }

  const { data: colleagues = [], isLoading } = useAdaptedQuery<InterpreterBlock[]>({
    queryKey: ["shared-availability", user?.id, Array.from(selectedLanguages).sort().join(",")],
    queryFn: async () => {
      if (selectedLanguages.size === 0) return [];
      const { data: sharedInterps, error: interpErr } = await supabase
        .from("interpreter_languages")
        .select("interpreter_id, language_id, languages(name)")
        .in("language_id", Array.from(selectedLanguages))
        .neq("interpreter_id", user!.id);
      if (interpErr) throw interpErr;
      if (!sharedInterps?.length) return [];

      const interpIds = [...new Set(sharedInterps.map((i: any) => i.interpreter_id))];

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", interpIds);
      if (profErr) throw profErr;

      const { data: blocks, error: blockErr } = await supabase
        .from("interpreter_availability")
        .select("id, interpreter_id, is_recurring, day_of_week, start_time, end_time, specific_date, end_date, is_all_day")
        .in("interpreter_id", interpIds);
      if (blockErr) throw blockErr;

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const langMap = new Map<string, { id: string; name: string }[]>();
      (sharedInterps || []).forEach((si: any) => {
        const existing = langMap.get(si.interpreter_id) || [];
        if (!existing.find((l) => l.id === si.language_id)) {
          existing.push({ id: si.language_id, name: si.languages?.name || "" });
        }
        langMap.set(si.interpreter_id, existing);
      });

      return (blocks || []).map((b: any) => {
        const profile = profileMap.get(b.interpreter_id);
        return {
          ...b,
          first_name: profile?.first_name || "Unknown",
          last_name: profile?.last_name || "",
          languages: langMap.get(b.interpreter_id) || [],
        };
      });
    },
    demoFn: () => {
      if (selectedLanguages.size === 0) return [];
      const myId = user?.id;
      const sharedInterpIds = new Set<string>();
      const interpLangMap = new Map<string, { id: string; name: string }[]>();

      state.interpreterLanguages.forEach((il: any) => {
        if (il.interpreter_id !== myId && selectedLanguages.has(il.language_id)) {
          sharedInterpIds.add(il.interpreter_id);
          const existing = interpLangMap.get(il.interpreter_id) || [];
          const lang = state.languages.find((l: any) => l.id === il.language_id);
          if (lang && !existing.find((l) => l.id === il.language_id)) {
            existing.push({ id: il.language_id, name: lang.name });
          }
          interpLangMap.set(il.interpreter_id, existing);
        }
      });

      return state.availability
        .filter((a: any) => sharedInterpIds.has(a.interpreter_id))
        .map((a: any) => {
          const interp = state.interpreters.find((i: any) => i.id === a.interpreter_id);
          return {
            id: a.id,
            interpreter_id: a.interpreter_id,
            first_name: interp?.first_name || "Unknown",
            last_name: interp?.last_name || "",
            languages: interpLangMap.get(a.interpreter_id) || [],
            is_recurring: a.is_recurring,
            day_of_week: a.day_of_week,
            start_time: a.start_time,
            end_time: a.end_time,
            specific_date: a.specific_date,
            end_date: a.end_date,
            is_all_day: a.is_all_day ?? false,
          };
        });
    },
    enabled: !!user && initialized,
  });

  const interpreterMap = useMemo(() => {
    const map = new Map<string, InterpreterInfo>();
    colleagues.forEach((b) => {
      const key = b.interpreter_id;
      if (!map.has(key)) {
        map.set(key, {
          name: `${b.first_name} ${b.last_name.charAt(0)}.`,
          languages: b.languages,
          blocks: [],
        });
      }
      map.get(key)!.blocks.push(b);
    });
    return map;
  }, [colleagues]);

  const toggleLanguage = useCallback((langId: string) => {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(langId)) next.delete(langId);
      else next.add(langId);
      return next;
    });
  }, []);

  return {
    myLanguages,
    selectedLanguages,
    toggleLanguage,
    interpreterMap,
    isLoading,
    initialized,
  };
}
