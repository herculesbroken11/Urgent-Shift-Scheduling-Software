import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoData } from "@/contexts/DemoDataContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Star, Globe } from "lucide-react";
import { useAdaptedQuery, useAdaptedMutation } from "@/lib/data-adapter";

export default function MyLanguages() {
  const { user, profile } = useAuth();
  const { state, addItem, deleteItem, genId } = useDemoData();
  const [open, setOpen] = useState(false);
  const [langId, setLangId] = useState("");
  const [certified, setCertified] = useState(false);
  const [certDetails, setCertDetails] = useState("");

  const { data: myLangs = [], isLoading } = useAdaptedQuery<any[]>({
    queryKey: ["my-languages", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interpreter_languages")
        .select("*, languages(name, code)")
        .eq("interpreter_id", user!.id);
      if (error) throw error;
      // Note: interpreter_languages doesn't have agency_id column; RLS + interpreter_id filter is sufficient
      return data;
    },
    demoFn: () => {
      return state.interpreterLanguages
        .filter((l: any) => l.interpreter_id === user?.id)
        .map((l: any) => {
          const lang = state.languages.find((lg: any) => lg.id === l.language_id);
          return { ...l, languages: lang ? { name: lang.name, code: lang.code } : null };
        });
    },
    enabled: !!user,
  });

  const { data: allLanguages = [] } = useAdaptedQuery<any[]>({
    queryKey: ["languages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("languages").select("*").order("name");
      if (error) throw error;
      return data;
    },
    demoFn: () => state.languages,
  });

  const addLang = useAdaptedMutation<void>({
    mutationFn: async () => {
      const { error } = await supabase.from("interpreter_languages").insert({
        interpreter_id: user!.id,
        language_id: langId,
        is_certified: certified,
        certification_details: certDetails || null,
      });
      if (error) throw error;
    },
    demoFn: () => {
      addItem("interpreterLanguages", {
        id: genId("demo-il"),
        interpreter_id: user!.id,
        language_id: langId,
        is_certified: certified,
        certification_details: certDetails || null,
      });
    },
    invalidateKeys: [["my-languages"]],
    successMessage: "Language added",
    onSuccess: () => {
      setOpen(false);
      setLangId("");
      setCertified(false);
      setCertDetails("");
    },
  });

  const removeLang = useAdaptedMutation<string>({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("interpreter_languages").delete().eq("id", id);
      if (error) throw error;
    },
    demoFn: (id: string) => { deleteItem("interpreterLanguages", id); },
    invalidateKeys: [["my-languages"]],
    successMessage: "Language removed",
  });

  const existingIds = new Set(myLangs.map((l: any) => l.language_id));
  const available = allLanguages.filter((l: any) => !existingIds.has(l.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Languages</h1>
          <p className="text-muted-foreground">Manage your language qualifications</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add Language</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Language</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label>Language</Label>
                <Select value={langId} onValueChange={setLangId}>
                  <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                  <SelectContent>
                    {available.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={certified} onCheckedChange={setCertified} id="cert" />
                <Label htmlFor="cert">Certified</Label>
              </div>
              {certified && (
                <div className="space-y-1">
                  <Label>Certification details</Label>
                  <Input value={certDetails} onChange={(e) => setCertDetails(e.target.value)} placeholder="e.g. ATA certified" />
                </div>
              )}
              <Button className="w-full" onClick={() => addLang.mutate()} disabled={!langId || addLang.isPending}>
                {addLang.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Languages</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : myLangs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No languages added yet</p>
          ) : (
            <div className="space-y-2">
              {myLangs.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{l.languages?.name}</span>
                    {l.is_certified && (
                      <Badge className="flex items-center gap-1">
                        <Star className="h-3 w-3" />Certified
                      </Badge>
                    )}
                    {l.certification_details && (
                      <span className="text-xs text-muted-foreground">({l.certification_details})</span>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeLang.mutate(l.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
