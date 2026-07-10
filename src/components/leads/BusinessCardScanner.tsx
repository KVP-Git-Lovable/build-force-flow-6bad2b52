import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScanLine, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ScannedCard {
  name?: string; title?: string; company?: string;
  email?: string; phone?: string; website?: string; address?: string;
}

export function BusinessCardScanner({ onScanned }: { onScanned: (data: ScannedCard, uploadedPath: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `leads/cards/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("customer-documents").upload(path, file);
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage.from("customer-documents").createSignedUrl(path, 300);
      if (sErr) throw sErr;

      const { data, error } = await supabase.functions.invoke("scan-business-card", {
        body: { image_url: signed.signedUrl },
      });
      if (error) throw error;
      const parsed = (data as any)?.data ?? {};
      onScanned(parsed as ScannedCard, path);
      toast.success("Card scanned — please review the fields");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to scan card");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanLine className="h-4 w-4 mr-1" />}
        {busy ? "Scanning…" : "Scan Business Card"}
      </Button>
    </>
  );
}
