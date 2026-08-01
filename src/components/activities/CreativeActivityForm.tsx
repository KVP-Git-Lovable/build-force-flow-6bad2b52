import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Camera,
  MapPin,
  Users,
  Check,
  X,
  Sparkles,
  Loader2,
  Mic,
  Square,
  AudioLines,
  TrendingUp,
  Clock,
  Calendar,
  Trash2,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadActivityPhoto, resolveActivityPhotoUrl } from "@/utils/activityPhotos";
import type { Activity as ActivityType, ActivityPhotoEntry, ActivityStatusEntry } from "@/hooks/useActivities";
import { format, parseISO } from "date-fns";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { supabase } from "@/integrations/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import CameraCapture from "@/components/CameraCapture";
import { isNative, takeNativePhoto } from "@/utils/nativePermissions";
import OpenGRNPicker from "@/components/procurement/OpenGRNPicker";
import { receiptDrivenStatus } from "@/lib/procurement";

interface GrnLineItem {
  id: string;
  product_id: string | null;
  product_name: string;
  ordered: number;
  prevReceived: number;
  uom: string | null;
}

type ProjectOpt = {
  id: string;
  name: string;
  image_url?: string | null;
  base_lat?: number | null;
  base_lng?: number | null;
  base_address?: string | null;
  geofence_radius_m?: number | null;
};
type UserOpt = { id: string; full_name: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projects: ProjectOpt[];
  users: UserOpt[];
  activityTypes: string[];
  currentUserId: string;
  canAssign?: boolean;
  cfgCheckIn?: boolean;
  cfgTakePhoto?: boolean;
  createActivity: (activity: any, targetUserId?: string, silent?: boolean) => Promise<any>;
  updateActivity?: (id: string, updates: any) => Promise<any>;
  checkInActivity?: (activityId: string, site?: { base_lat: number | null; base_lng: number | null; geofence_radius_m: number } | null) => Promise<any>;
  checkOutActivity?: (activityId: string) => Promise<any>;
  onCreated?: () => void;
  editActivity?: ActivityType | null;
  onDelete?: (id: string) => void | Promise<void>;
  attendance?: { check_in_time: string | null; check_out_time: string | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};
const STATUS_DOT: Record<string, string> = {
  planned: "bg-muted-foreground",
  in_progress: "bg-blue-500",
  completed: "bg-emerald-500",
};

const RISK_OPTIONS = [
  { key: "green", label: "On Track", solid: "bg-emerald-500", dot: "bg-emerald-500", iconColor: "text-emerald-500" },
  { key: "orange", label: "Attention", solid: "bg-amber-500", dot: "bg-amber-500", iconColor: "text-amber-500" },
  { key: "red", label: "Critical", solid: "bg-red-500", dot: "bg-red-500", iconColor: "text-red-500" },
] as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function gradientFor(seed: string) {
  const palettes = [
    "from-fuchsia-500 via-pink-500 to-orange-400",
    "from-indigo-500 via-purple-500 to-pink-500",
    "from-emerald-400 via-teal-500 to-cyan-500",
    "from-amber-400 via-orange-500 to-rose-500",
    "from-sky-400 via-blue-500 to-indigo-500",
    "from-violet-500 via-fuchsia-500 to-rose-500",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palettes[hash % palettes.length];
}

export default function CreativeActivityForm({
  open,
  onOpenChange,
  projects,
  users,
  activityTypes,
  currentUserId,
  canAssign = false,
  cfgCheckIn = true,
  cfgTakePhoto = true,
  createActivity,
  updateActivity,
  checkInActivity,
  checkOutActivity,
  onCreated,
  editActivity,
  onDelete,
  attendance,
}: Props) {
  const isEdit = !!editActivity;
  const { profile: currentProfile, initials: currentInitials } = useUserProfile();
  const [projectId, setProjectId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadOptions, setLeadOptions] = useState<{ id: string; name: string; company: string | null }[]>([]);
  const [outcome, setOutcome] = useState("");
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState("");
  const [activityDate, setActivityDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [risk, setRisk] = useState<string>("green");
  const [photos, setPhotos] = useState<ActivityPhotoEntry[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("planned");
  const [changingStatus, setChangingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  const [checkingIn, setCheckingIn] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceToTextMode, setVoiceToTextMode] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const {
    isRecording,
    isFinalizing,
    recording,
    elapsed,
    startRecording,
    stopRecording,
    clearRecording,
    formatDuration,
  } = useAudioRecorder();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  // ---- GRN inline state ----
  const isGrnType = activityType.trim().toLowerCase().includes("grn");
  const [grnPoId, setGrnPoId] = useState("");
  const [grnPoNumber, setGrnPoNumber] = useState("");
  const [grnItems, setGrnItems] = useState<GrnLineItem[]>([]);
  const [grnRecv, setGrnRecv] = useState<Record<string, string>>({});
  const [grnItemRemarks, setGrnItemRemarks] = useState<Record<string, string>>({});
  const [grnRemarks, setGrnRemarks] = useState("");
  const [grnLoadingPo, setGrnLoadingPo] = useState(false);

  useEffect(() => {
    if (!open) {
      setProjectId("");
      setLeadId("");
      setLeadSearch("");
      setOutcome("");
      setDescription("");
      setActivityType("");
      setActivityDate(format(new Date(), "yyyy-MM-dd"));
      setAssignedIds([]);
      setRisk("green");
      setPhotos([]);
      setPhotoPreviews({});
      setAssignOpen(false);
      setAssignSearch("");
      clearRecording();
      setVoiceToTextMode(false);
      setGrnPoId("");
      setGrnPoNumber("");
      setGrnItems([]);
      setGrnRecv({});
      setGrnItemRemarks({});
      setGrnRemarks("");
      return;
    }
    // Prefill on edit
    if (editActivity) {
      setProjectId(editActivity.site_id || "");
      setLeadId((editActivity as any).lead_id || "");
      setOutcome((editActivity as any).outcome || "");
      setDescription(editActivity.description || "");
      setActivityType(editActivity.activity_type || "");
      setActivityDate(editActivity.activity_date || format(new Date(), "yyyy-MM-dd"));
      setAssignedIds(Array.isArray((editActivity as any).assigned_user_ids) ? (editActivity as any).assigned_user_ids : []);
      setPhotos(editActivity.photo_urls || []);
      setStatus(editActivity.status || "planned");
      setCheckedIn(!!(editActivity as any).check_in_at);
      setGrnPoId((editActivity as any).grn_po_id || "");

      // resolve photo previews
      (editActivity.photo_urls || []).forEach(async (ph) => {
        try {
          const url = await resolveActivityPhotoUrl(ph.url);
          setPhotoPreviews((prev) => ({ ...prev, [ph.url]: url }));
        } catch {
          /* ignore */
        }
      });
    } else {
      setCheckedIn(false);
    }
  }, [open, editActivity, clearRecording]);

  // Load PO items + already-received qty whenever a PO is selected for GRN
  useEffect(() => {
    if (!isGrnType || !grnPoId) {
      setGrnItems([]);
      setGrnPoNumber("");
      return;
    }
    let cancelled = false;
    (async () => {
      setGrnLoadingPo(true);
      try {
        const { data: po } = await supabase
          .from("procurement_orders")
          .select("po_number, procurement_items(id, product_id, qty, uom)")
          .eq("id", grnPoId)
          .single();
        if (cancelled) return;
        const raw = ((po as any)?.procurement_items || []) as any[];
        const productIds = [...new Set(raw.map((r) => r.product_id).filter(Boolean))];
        const pmap: Record<string, string> = {};
        if (productIds.length) {
          const { data: prods } = await supabase.from("master_products").select("id, name").in("id", productIds);
          (prods || []).forEach((p: any) => { pmap[p.id] = p.name; });
        }
        // already received per procurement_item_id
        const { data: grns } = await supabase
          .from("procurement_grns")
          .select("procurement_grn_items(procurement_item_id, received_qty)")
          .eq("po_id", grnPoId);
        const rmap: Record<string, number> = {};
        ((grns || []) as any[]).forEach((g) => {
          (g.procurement_grn_items || []).forEach((gi: any) => {
            if (gi.procurement_item_id) rmap[gi.procurement_item_id] = (rmap[gi.procurement_item_id] || 0) + Number(gi.received_qty || 0);
          });
        });
        if (cancelled) return;
        setGrnPoNumber((po as any)?.po_number || "");
        setGrnItems(raw.map((r) => ({
          id: r.id,
          product_id: r.product_id,
          product_name: r.product_id ? (pmap[r.product_id] || "Product") : "Item",
          ordered: Number(r.qty || 0),
          prevReceived: Number(rmap[r.id] || 0),
          uom: r.uom,
        })));
        setGrnRecv({});
        setGrnItemRemarks({});
      } finally {
        if (!cancelled) setGrnLoadingPo(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isGrnType, grnPoId]);

  // Reset GRN selection when activity type flips away from GRN
  useEffect(() => {
    if (!isGrnType) {
      setGrnPoId("");
      setGrnItems([]);
      setGrnRecv({});
      setGrnItemRemarks({});
      setGrnRemarks("");
    }
  }, [isGrnType]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leadOptions;
    return leadOptions.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.company || "").toLowerCase().includes(q)
    );
  }, [leadOptions, leadSearch]);

  const selectedLead = leadOptions.find((l) => l.id === leadId);

  const filteredUsers = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return q ? users.filter((u) => u.full_name.toLowerCase().includes(q)) : users;
  }, [users, assignSearch]);

  const uploadPhotoBlob = useCallback(async (blob: Blob) => {
    setUploadingPhoto(true);
    try {
      const entry = await uploadActivityPhoto(blob);
      setPhotos((p) => [...p, entry]);
      const url = await resolveActivityPhotoUrl(entry.url);
      setPhotoPreviews((prev) => ({ ...prev, [entry.url]: url }));
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  }, []);

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadPhotoBlob(file);
  };

  const handleOpenCamera = useCallback(async () => {
    // Native (Capacitor): use device camera plugin directly
    if (isNative()) {
      const blob = await takeNativePhoto();
      if (blob) {
        await uploadPhotoBlob(blob);
        return;
      }
    }
    // Web: prefer getUserMedia webcam via CameraCapture modal
    const hasMedia = typeof navigator !== "undefined"
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === "function";
    if (hasMedia) {
      setShowCamera(true);
      return;
    }
    // Fallback: file picker
    fileInputRef.current?.click();
  }, [uploadPhotoBlob]);

  const selectedProject = projects.find((p) => p.id === projectId);

  const handleActivityCheckIn = async () => {
    if (!isEdit || !editActivity || !checkInActivity) {
      toast.error("Save the post first to check in for this activity");
      return;
    }
    setCheckingIn(true);
    try {
      const site = selectedProject
        ? {
            base_lat: selectedProject.base_lat ?? null,
            base_lng: selectedProject.base_lng ?? null,
            geofence_radius_m: selectedProject.geofence_radius_m ?? 100,
          }
        : null;
      const res = await checkInActivity(editActivity.id, site);
      setCheckedIn(true);
      if (res?.within_site === true) toast.success(`Checked in · Within site (${res.distance_m}m)`);
      else if (res?.within_site === false) toast.warning(`Checked in · Outside site (${res.distance_m}m)`);
      else toast.success("Checked in");
      onCreated?.();
    } catch (err: any) {
      toast.error(err.message || "Check-in failed");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleActivityCheckOut = async () => {
    if (!isEdit || !editActivity || !checkOutActivity) return;
    setCheckingIn(true);
    try {
      await checkOutActivity(editActivity.id);
      toast.success("Checked out");
      onCreated?.();
    } catch (err: any) {
      toast.error(err.message || "Check-out failed");
    } finally {
      setCheckingIn(false);
    }
  };

  // Voice transcription
  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      const extension = audioBlob.type.includes("mp4") || audioBlob.type.includes("aac")
        ? "m4a"
        : audioBlob.type.includes("ogg")
          ? "ogg"
          : "webm";
      formData.append("audio", audioBlob, `recording.${extension}`);
      formData.append("lang", "en");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to use voice-to-text");
        return;
      }
      const response = await supabase.functions.invoke("transcribe-audio", { body: formData });
      if (response.error) throw response.error;
      const transcript = response.data?.transcript?.trim();
      if (transcript) {
        setDescription((prev) => (prev ? prev + " " + transcript : transcript));
        toast.success("Voice transcribed");
      } else {
        toast.error("Could not understand the audio.");
      }
    } catch (err: any) {
      toast.error("Transcription failed: " + (err.message || "Unknown error"));
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  // Auto-transcribe when voice-to-text finishes
  useEffect(() => {
    if (voiceToTextMode && recording && !isRecording && !isTranscribing) {
      transcribeAudio(recording.blob);
      clearRecording();
      setVoiceToTextMode(false);
    }
  }, [voiceToTextMode, recording, isRecording, isTranscribing, transcribeAudio, clearRecording]);

  const handleMicOptionClick = useCallback(async (mode: "text" | "audio") => {
    if (isTranscribing || isStartingRecording || isFinalizing) return;
    if (isRecording) {
      setMicMenuOpen(false);
      await stopRecording();
      return;
    }
    clearRecording();
    setVoiceToTextMode(mode === "text");
    setIsStartingRecording(true);
    try {
      await startRecording();
      setMicMenuOpen(false);
    } catch (err: any) {
      setVoiceToTextMode(false);
      toast.error(err.message || "Could not start recording");
    } finally {
      setIsStartingRecording(false);
    }
  }, [clearRecording, isFinalizing, isRecording, isStartingRecording, isTranscribing, startRecording, stopRecording]);

  const canPost = !!description.trim() || !!activityType || !!projectId;

  const handlePost = async () => {
    if (!canPost) {
      toast.error("Add a project, type, or description to post");
      return;
    }
    if (isEdit && !editActivity) return;

    // GRN validation — only enforced for GRN activity type on new posts
    let grnRowsToInsert: { it: GrnLineItem; received: number; remarks: string }[] = [];
    if (isGrnType && !isEdit) {
      if (!grnPoId) {
        toast.error("Select a Purchase Order to receive against");
        return;
      }
      grnRowsToInsert = grnItems
        .map((it) => ({
          it,
          received: parseFloat(grnRecv[it.id]) || 0,
          remarks: (grnItemRemarks[it.id] || "").trim(),
        }))
        .filter((r) => r.received > 0);
      if (grnRowsToInsert.length === 0) {
        toast.error("Enter received quantity for at least one item");
        return;
      }
      for (const r of grnRowsToInsert) {
        const pending = Math.max(0, r.it.ordered - r.it.prevReceived);
        if (r.received > pending + 1e-9) {
          toast.error(`Received qty for ${r.it.product_name} exceeds pending (${pending})`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      // Upload voice recording (audio mode) as attachment
      let audioUrl: string | null = null;
      if (recording && !voiceToTextMode) {
        const { data: { user } } = await supabase.auth.getUser();
        const extension = recording.fileExtension || (recording.mimeType.includes("mp4") ? "m4a" : recording.mimeType.includes("ogg") ? "ogg" : "webm");
        if (!user?.id) {
          toast.error("Please sign in to add audio");
          return;
        }
        const fileName = `${user.id}/${Date.now()}.${extension}`;
        const { error: uploadErr } = await supabase.storage
          .from("activity-audio")
          .upload(fileName, recording.blob, { contentType: recording.mimeType || "audio/webm" });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("activity-audio").getPublicUrl(fileName);
          audioUrl = urlData.publicUrl;
        }
      }
      const attachmentUrls: string[] = [];
      if (audioUrl) attachmentUrls.push(audioUrl);

      const payload: any = {
        activity_name: activityType || "Activity Update",
        activity_type: activityType || "General Activity",
        activity_date: activityDate,
        description: description || null,
        site_id: projectId || null,
        photo_urls: photos,
        grn_po_id: isGrnType ? (grnPoId || null) : null,
        ...(canAssign ? { assigned_user_ids: assignedIds } : {}),
        ...(attachmentUrls.length > 0 ? { attachment_urls: attachmentUrls } : {}),
      };

      if (isEdit && updateActivity) {
        await updateActivity(editActivity!.id, payload);
        toast.success("Post updated");
      } else {
        payload.status = "planned";
        payload.status_history = [{ status: "planned", at: new Date().toISOString() } as ActivityStatusEntry];
        await createActivity(payload, undefined, true);

        // Create the GRN record + items + advance PO status
        if (isGrnType && grnPoId && grnRowsToInsert.length > 0) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            const priorReceived = grnItems.reduce((s, it) => s + it.prevReceived, 0);
            const ordered = grnItems.reduce((s, it) => s + it.ordered, 0);
            const thisReceipt = grnRowsToInsert.reduce((s, r) => s + r.received, 0);
            const cumulative = priorReceived + thisReceipt;
            const grnStatus = cumulative >= ordered && ordered > 0 ? "Fully Received" : "Partially Received";

            const { data: grn, error: grnErr } = await supabase
              .from("procurement_grns")
              .insert({
                po_id: grnPoId,
                receipt_date: activityDate,
                received_by: currentProfile?.full_name || null,
                remarks: grnRemarks.trim() || null,
                status: grnStatus,
                created_by: user?.id || null,
              })
              .select("id")
              .single();
            if (grnErr) throw grnErr;

            const itemRows = grnRowsToInsert.map((r) => ({
              grn_id: grn.id,
              procurement_item_id: r.it.id,
              product_id: r.it.product_id,
              ordered_qty: r.it.ordered,
              received_qty: r.received,
            }));
            const { error: ie } = await supabase.from("procurement_grn_items").insert(itemRows);
            if (ie) throw ie;

            const next = receiptDrivenStatus(ordered, cumulative, "");
            if (next) {
              await supabase.from("procurement_orders").update({ status: next }).eq("id", grnPoId);
            }
            toast.success("Goods Receipt recorded");
          } catch (grnErr: any) {
            toast.error("Post saved, but GRN failed: " + (grnErr.message || "unknown error"));
          }
        } else {
          toast.success("Posted to your activity feed");
        }
      }
      onCreated?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to post");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!isEdit || !editActivity || !updateActivity || newStatus === status) return;
    setChangingStatus(true);
    try {
      const now = new Date().toISOString();
      const history = [
        ...(editActivity.status_history || []),
        { status: newStatus, at: now } as ActivityStatusEntry,
      ];
      const updates: any = { status: newStatus, status_history: history };
      if (newStatus === "in_progress" && !editActivity.start_time) updates.start_time = now;
      if (newStatus === "completed") updates.end_time = now;
      await updateActivity(editActivity.id, updates);
      setStatus(newStatus);
      toast.success(`Marked as ${STATUS_LABELS[newStatus] || newStatus}`);
      onCreated?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setChangingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !editActivity || !onDelete) return;
    if (!confirm("Delete this post?")) return;
    setDeleting(true);
    try {
      await onDelete(editActivity.id);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const currentRisk = RISK_OPTIONS.find((r) => r.key === risk)!;

  const micBusy = isStartingRecording || isTranscribing || isFinalizing;
  const showCheckIn = cfgCheckIn && !!checkInActivity;

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="p-0 gap-0 w-[calc(100vw-1rem)] sm:w-[min(640px,calc(100vw-2rem))] max-w-none max-h-[92vh] overflow-hidden rounded-2xl border-0 shadow-2xl">
          <div className="flex min-w-0 max-w-full flex-col max-h-[92vh] overflow-hidden">
            {/* Header */}
            <div className="relative px-4 sm:px-5 py-4 pr-12 bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white flex items-center justify-between min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-9 w-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold leading-tight truncate">{isEdit ? "Edit Post" : "New Post"}</h2>
                  <p className="text-[11px] text-white/80 truncate">Share what's happening on the ground</p>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto overflow-x-hidden flex-1 bg-muted/40 p-3 sm:p-4 space-y-3 min-w-0 max-w-full">
              {/* Details panel — visible in edit/view */}
              {isEdit && editActivity && (
                <div className="rounded-2xl bg-card border border-border px-3 sm:px-4 py-3 shadow-sm space-y-3 overflow-hidden min-w-0 max-w-full">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {editActivity.activity_code && (
                        <Badge variant="secondary" className="font-mono text-[10px] shrink-0">{editActivity.activity_code}</Badge>
                      )}
                      <span className="text-sm font-semibold min-w-0 break-words [overflow-wrap:anywhere]">{editActivity.activity_name}</span>
                    </div>
                    <div className={cn("inline-flex items-center gap-1.5 px-2 h-6 rounded-full text-[10px] font-semibold uppercase tracking-wider border shrink-0 whitespace-nowrap self-start max-w-full",
                      status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900" :
                      status === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900" :
                      "bg-muted text-muted-foreground border-border")}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
                      {STATUS_LABELS[status] || status}
                    </div>
                  </div>
                  {editActivity.user_full_name && (
                    <p className="text-[11px] text-muted-foreground break-words [overflow-wrap:anywhere]">By {editActivity.user_full_name}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] min-w-0">
                    {editActivity.activity_date && (
                      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0"><Calendar className="h-3 w-3 shrink-0" /><span className="min-w-0 break-words">{format(parseISO(editActivity.activity_date), "MMM d, yyyy")}</span></div>
                    )}
                    {editActivity.total_hours ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0"><Clock className="h-3 w-3 shrink-0" /><span className="min-w-0 break-words">{editActivity.total_hours}h</span></div>
                    ) : null}
                    {editActivity.start_time && (
                      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0"><Clock className="h-3 w-3 shrink-0" /><span className="min-w-0 break-words">Start {format(parseISO(editActivity.start_time), "h:mm a")}</span></div>
                    )}
                    {editActivity.end_time && (
                      <div className="flex items-center gap-1.5 text-muted-foreground min-w-0"><Clock className="h-3 w-3 shrink-0" /><span className="min-w-0 break-words">End {format(parseISO(editActivity.end_time), "h:mm a")}</span></div>
                    )}
                  </div>
                  {editActivity.location_address && (
                    <p className="text-[11px] flex items-start gap-1.5 text-muted-foreground min-w-0"><MapPin className="h-3 w-3 mt-0.5 shrink-0" /><span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">{editActivity.location_address}</span></p>
                  )}
                  {editActivity.milestone_name && (
                    <div className="text-[11px] text-muted-foreground break-words [overflow-wrap:anywhere]"><span className="font-medium text-foreground">Milestone:</span> {editActivity.milestone_name}</div>
                  )}
                  {attendance && (attendance.check_in_time || attendance.check_out_time) && (
                    <div className="text-[11px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/60 min-w-0">
                      {attendance.check_in_time && <p>Check-in: {format(parseISO(attendance.check_in_time), "MMM d, h:mm a")}</p>}
                      {attendance.check_out_time && <p>Check-out: {format(parseISO(attendance.check_out_time), "MMM d, h:mm a")}</p>}
                    </div>
                  )}
                  {/* Status change chips */}
                  {updateActivity && (
                    <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                      {["planned", "in_progress", "completed"].map((s) => (
                        <button
                          key={s}
                          disabled={changingStatus || s === status}
                          onClick={() => handleStatusChange(s)}
                          className={cn(
                            "px-2.5 h-7 rounded-full text-[11px] border transition",
                            s === status
                              ? "bg-primary text-primary-foreground border-primary cursor-default"
                              : "bg-background hover:bg-muted border-border"
                          )}
                        >
                          {STATUS_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Timeline */}
                  {(editActivity.status_history || []).length > 0 && (
                    <div className="pt-2 border-t border-border/60 min-w-0 max-w-full overflow-hidden">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Timeline</p>
                      <div className="space-y-2 min-w-0">
                        {[...editActivity.status_history]
                          .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                          .map((h, i) => (
                            <div key={i} className="grid grid-cols-[0.375rem_minmax(0,1fr)] items-start gap-2 text-[11px] min-w-0 max-w-full">
                              <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full", STATUS_DOT[h.status] || "bg-muted-foreground")} />
                              <div className="min-w-0 max-w-full">
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                                  <span className="font-medium break-words [overflow-wrap:anywhere]">{STATUS_LABELS[h.status] || h.status}</span>
                                  <span className="text-muted-foreground break-words">· {format(parseISO(h.at), "MMM d, h:mm a")}</span>
                                </div>
                                {h.address && <p className="text-muted-foreground break-words [overflow-wrap:anywhere]">{h.address}</p>}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  {/* Attachments */}
                  {editActivity.attachment_urls && editActivity.attachment_urls.length > 0 && (
                    <div className="pt-2 border-t border-border/60 min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Attachments</p>
                      <div className="space-y-1">
                        {editActivity.attachment_urls.map((u, i) => (
                          <a key={i} href={u} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1.5 min-w-0">
                            <Paperclip className="h-3 w-3 shrink-0" /> <span className="min-w-0 truncate">Attachment {i + 1}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Lead picker */}
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-fuchsia-50 dark:from-indigo-950/30 dark:to-fuchsia-950/30 border border-indigo-100 dark:border-indigo-900/50 px-3 sm:px-4 pt-4 pb-3 shadow-sm min-w-0 max-w-full overflow-hidden">
                <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Lead</p>
                  {selectedLead && (
                    <button
                      className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => setLeadId("")}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search leads..."
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    className="pl-9 h-9 rounded-full bg-background/80 border-0"
                  />
                </div>
                <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1 scrollbar-none max-w-full">
                  {filteredLeads.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4">No leads found</p>
                  )}
                  {filteredLeads.map((p) => {
                    const active = p.id === leadId;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setLeadId(active ? "" : p.id)}
                        className="shrink-0 flex flex-col items-center gap-1.5 w-16 focus:outline-none group"
                      >
                        <div
                          className={cn(
                            "relative h-16 w-16 rounded-full p-[2.5px] transition-all",
                            active
                              ? "bg-gradient-to-tr from-yellow-400 via-pink-500 to-fuchsia-600 scale-105"
                              : "bg-gradient-to-tr from-muted to-muted group-hover:from-pink-300 group-hover:to-fuchsia-400"
                          )}
                        >
                          <div
                            className={cn(
                              "h-full w-full rounded-full overflow-hidden flex items-center justify-center text-white font-semibold text-sm border-2 border-background bg-gradient-to-br",
                              gradientFor(p.id)
                            )}
                          >
                            {initials(p.name)}
                          </div>
                          {active && (
                            <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <p
                          className={cn(
                            "text-[10px] w-full text-center truncate leading-tight",
                            active ? "font-semibold text-foreground" : "text-muted-foreground"
                          )}
                          title={p.company ? `${p.name} · ${p.company}` : p.name}
                        >
                          {p.name}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>


              {/* Activity date */}
              <div className="rounded-2xl bg-card border border-border px-3 sm:px-4 py-2.5 shadow-sm flex items-center gap-2 min-w-0">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <label className="text-xs font-semibold text-muted-foreground shrink-0">Activity Date</label>
                <input
                  type="date"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")}
                  className="flex-1 min-w-0 bg-transparent text-sm outline-none text-right"
                />
              </div>

              {/* Activity check-in status banner */}
              {isEdit && editActivity && ((editActivity as any).check_in_at || (editActivity as any).check_in_within_site != null) && (
                <div className={cn(
                  "rounded-2xl border px-3 sm:px-4 py-2.5 shadow-sm text-xs min-w-0",
                  (editActivity as any).check_in_within_site === true
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-200"
                    : (editActivity as any).check_in_within_site === false
                    ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200"
                    : "bg-muted/40 border-border text-foreground",
                )}>
                  <div className="flex items-center gap-1.5 font-semibold">
                    <MapPin className="h-3.5 w-3.5" />
                    {(editActivity as any).check_in_within_site === true && "Within Site"}
                    {(editActivity as any).check_in_within_site === false && "Outside Site"}
                    {(editActivity as any).check_in_within_site == null && "Checked In"}
                    {(editActivity as any).check_in_distance_m != null && (
                      <span className="font-normal text-muted-foreground">· {(editActivity as any).check_in_distance_m}m from site</span>
                    )}
                  </div>
                  {(editActivity as any).check_in_at && (
                    <div className="text-[11px] mt-0.5 opacity-80">
                      In: {format(parseISO((editActivity as any).check_in_at), "MMM d, h:mm a")}
                      {(editActivity as any).check_out_at && ` · Out: ${format(parseISO((editActivity as any).check_out_at), "h:mm a")}`}
                    </div>
                  )}
                  {(editActivity as any).check_in_address && (
                    <div className="text-[11px] mt-0.5 opacity-80 break-words">{(editActivity as any).check_in_address}</div>
                  )}
                </div>
              )}

              {/* Description with inline icon rail */}
              <div className="rounded-2xl bg-card border border-border px-3 sm:px-4 py-3 shadow-sm min-w-0 max-w-full overflow-hidden">
                <div className="flex items-start gap-3 min-w-0">
                  {currentProfile?.profile_picture_url ? (
                    <img
                      src={currentProfile.profile_picture_url}
                      alt={currentProfile.full_name || currentProfile.username || "Me"}
                      className="h-10 w-10 rounded-full object-cover shrink-0 border border-border"
                    />
                  ) : (
                    <div
                      className={cn(
                        "h-10 w-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-semibold shrink-0",
                        gradientFor(currentUserId || "me")
                      )}
                    >
                      {currentInitials && currentInitials !== "??" ? currentInitials : initials(currentProfile?.full_name || currentProfile?.username || "Me")}
                    </div>
                  )}
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      selectedProject
                        ? `What's happening at ${selectedProject.name}?`
                        : "What's happening in your project?"
                    }
                    rows={3}
                    className="min-w-0 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 shadow-none px-0 text-[15px] placeholder:text-muted-foreground/70 break-words [overflow-wrap:anywhere]"
                  />
                </div>

                {/* Icon action rail — under description */}
                <div className="mt-2 pt-2 border-t border-border/60 flex flex-wrap items-center gap-1 min-w-0 max-w-full">
                  {/* Photo */}
                  {cfgTakePhoto && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoPick}
                        className="hidden"
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleOpenCamera}
                            disabled={uploadingPhoto}
                            className="h-9 w-9 rounded-full flex items-center justify-center text-fuchsia-600 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-950/30 disabled:opacity-60 transition"
                            aria-label="Add photo"
                          >
                            {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Add photo{photos.length > 0 ? ` (${photos.length})` : ""}</TooltipContent>
                      </Tooltip>
                    </>
                  )}

                  {/* Activity Check in / Check out */}
                  {showCheckIn && (
                    <>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleActivityCheckIn}
                            disabled={checkedIn || checkingIn || !isEdit}
                            className={cn(
                              "h-9 w-9 rounded-full flex items-center justify-center transition",
                              checkedIn
                                ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
                                : "text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30",
                              (checkingIn || !isEdit) && "opacity-60",
                            )}
                            aria-label="Activity check in"
                          >
                            {checkingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {!isEdit ? "Save post first to check in" : checkedIn ? "Checked in for this activity" : "Check in at site"}
                        </TooltipContent>
                      </Tooltip>
                      {isEdit && checkedIn && !(editActivity as any)?.check_out_at && checkOutActivity && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={handleActivityCheckOut}
                              disabled={checkingIn}
                              className="h-9 w-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                              aria-label="Activity check out"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Check out</TooltipContent>
                        </Tooltip>
                      )}
                    </>
                  )}

                  {/* Risk indicator (opens menu) */}
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              "h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted transition",
                              currentRisk.iconColor
                            )}
                            aria-label="Risk status"
                          >
                            <TrendingUp className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Risk: {currentRisk.label}</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="start">
                      {RISK_OPTIONS.map((r) => (
                        <DropdownMenuItem key={r.key} onClick={() => setRisk(r.key)} className="gap-2">
                          <span className={cn("h-2.5 w-2.5 rounded-full", r.dot)} />
                          {r.label}
                          {r.key === risk && <Check className="h-3.5 w-3.5 ml-auto" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Voice mic dropdown */}
                  <DropdownMenu open={micMenuOpen} onOpenChange={setMicMenuOpen}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={micBusy}
                            className={cn(
                              "h-9 w-9 rounded-full flex items-center justify-center transition",
                              isRecording
                                ? "text-red-600 bg-red-50 dark:bg-red-950/30 animate-pulse"
                                : "text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30",
                              micBusy && "opacity-60"
                            )}
                            onClick={(e) => {
                              if (isRecording) {
                                e.preventDefault();
                                stopRecording();
                              }
                            }}
                            aria-label="Voice"
                          >
                            {isTranscribing || isFinalizing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isRecording ? (
                              <Square className="h-4 w-4" />
                            ) : (
                              <Mic className="h-4 w-4" />
                            )}
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isRecording ? "Stop recording" : "Voice-to-text or record audio"}
                      </TooltipContent>
                    </Tooltip>
                    {!isRecording && (
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => handleMicOptionClick("text")} className="gap-2">
                          <Mic className="h-3.5 w-3.5" /> Voice to text
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMicOptionClick("audio")} className="gap-2">
                          <AudioLines className="h-3.5 w-3.5" /> Record audio
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    )}
                  </DropdownMenu>

                  {isRecording && (
                    <span className="text-[11px] text-red-600 font-medium ml-1 min-w-0 break-words">
                      {voiceToTextMode ? "Listening" : "Recording"} · {formatDuration(elapsed)}
                    </span>
                  )}
                </div>

                {/* Photos preview */}
                {photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 min-w-0">
                    {photos.map((ph) => (
                      <div
                        key={ph.url}
                        className="relative aspect-square rounded-xl overflow-hidden bg-muted group"
                      >
                        {photoPreviews[ph.url] ? (
                          <img
                            src={photoPreviews[ph.url]}
                            alt="upload"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        <button
                          onClick={() => setPhotos((p) => p.filter((x) => x.url !== ph.url))}
                          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {recording && !voiceToTextMode && !isRecording && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-xs min-w-0">
                    <AudioLines className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                    <span className="flex-1 min-w-0 truncate">Audio note · {formatDuration(recording.duration)}</span>
                    <button
                      onClick={() => clearRecording()}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove audio"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Activity type chips */}
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-100 dark:border-amber-900/50 px-3 sm:px-4 py-3 shadow-sm min-w-0 max-w-full overflow-hidden">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-2">
                  Activity Type
                </p>
                <div className="flex flex-wrap gap-2 min-w-0">
                  {activityTypes.length === 0 && (
                    <p className="text-xs text-muted-foreground">No activity types configured</p>
                  )}
                  {activityTypes.map((t) => {
                    const active = t === activityType;
                    return (
                      <button
                        key={t}
                        onClick={() => setActivityType(active ? "" : t)}
                        className={cn(
                          "max-w-full px-3.5 min-h-8 h-auto py-1.5 rounded-full text-xs font-medium border transition-all whitespace-normal break-words [overflow-wrap:anywhere]",
                          active
                            ? "bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white border-transparent shadow-md"
                            : "bg-white dark:bg-background border-amber-200 dark:border-amber-900/60 text-foreground hover:border-fuchsia-400 hover:text-fuchsia-600"
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* GRN — Goods Receipt (only when Activity Type contains "GRN") */}
              {isGrnType && (
                <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-950/30 dark:to-cyan-950/30 border border-sky-100 dark:border-sky-900/50 px-3 sm:px-4 py-3 shadow-sm min-w-0 max-w-full overflow-hidden space-y-3">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Goods Receipt (GRN)</p>
                    {grnPoNumber && (
                      <Badge variant="outline" className="text-[10px]">{grnPoNumber}</Badge>
                    )}
                  </div>

                  {!projectId ? (
                    <p className="text-xs text-muted-foreground">Select a Project/Site above to see open Purchase Orders.</p>
                  ) : (
                    <OpenGRNPicker siteId={projectId} value={grnPoId} onChange={setGrnPoId} />
                  )}

                  {grnPoId && (
                    grnLoadingPo ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading PO items…
                      </div>
                    ) : grnItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No line items on this PO.</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="rounded-xl border border-border bg-background/70 overflow-hidden">
                          <div className="hidden sm:grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50">
                            <div>Item</div>
                            <div className="text-right">Ordered</div>
                            <div className="text-right">Prev. Recd</div>
                            <div className="text-right">Pending</div>
                            <div className="text-right">Receive Now</div>
                          </div>
                          <div className="divide-y divide-border">
                            {grnItems.map((it) => {
                              const pending = Math.max(0, it.ordered - it.prevReceived);
                              const recvVal = grnRecv[it.id] || "";
                              const recvNum = parseFloat(recvVal) || 0;
                              const over = recvNum > pending;
                              const done = pending <= 0;
                              return (
                                <div
                                  key={it.id}
                                  className="grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] gap-2 px-3 py-2 items-center text-xs min-w-0"
                                >
                                  <div className="col-span-2 sm:col-span-1 min-w-0">
                                    <div className="font-medium break-words [overflow-wrap:anywhere]">{it.product_name}</div>
                                    {it.uom && <div className="text-[10px] text-muted-foreground">UOM: {it.uom}</div>}
                                  </div>
                                  <div className="text-right sm:text-right">
                                    <div className="sm:hidden text-[10px] text-muted-foreground">Ordered</div>
                                    {it.ordered}
                                  </div>
                                  <div className="text-right">
                                    <div className="sm:hidden text-[10px] text-muted-foreground">Prev</div>
                                    {it.prevReceived}
                                  </div>
                                  <div className={cn("text-right font-medium", done ? "text-emerald-600" : "text-foreground")}>
                                    <div className="sm:hidden text-[10px] text-muted-foreground">Pending</div>
                                    {pending}
                                  </div>
                                  <div>
                                    <div className="sm:hidden text-[10px] text-muted-foreground">Receive</div>
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      min={0}
                                      max={pending}
                                      step="any"
                                      disabled={done}
                                      value={recvVal}
                                      onChange={(e) => setGrnRecv((s) => ({ ...s, [it.id]: e.target.value }))}
                                      className={cn("h-8 text-right text-xs", over && "border-destructive focus-visible:ring-destructive")}
                                      placeholder={done ? "Received" : "0"}
                                    />
                                    {over && (
                                      <div className="text-[10px] text-destructive mt-0.5">Exceeds pending</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <Textarea
                          value={grnRemarks}
                          onChange={(e) => setGrnRemarks(e.target.value)}
                          placeholder="GRN remarks (optional)"
                          rows={2}
                          className="text-sm bg-background/70"
                        />
                        {isEdit && (
                          <p className="text-[11px] text-muted-foreground">
                            This activity is linked to {grnPoNumber || "the selected PO"}. To record another receipt, create a new GRN activity.
                          </p>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Assign */}
              {canAssign && (
                <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-100 dark:border-emerald-900/50 px-3 sm:px-4 py-3 shadow-sm min-w-0 max-w-full overflow-hidden">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Assign
                  </p>
                  <button
                    onClick={() => setAssignOpen((v) => !v)}
                    className="w-full min-h-11 rounded-xl border border-border bg-background/60 hover:bg-background flex items-center gap-2 px-3 py-2 text-sm transition min-w-0"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    {assignedIds.length === 0 ? (
                      <span className="text-muted-foreground min-w-0 truncate">Add people</span>
                    ) : (
                      <div className="flex -space-x-2 min-w-0">
                        {assignedIds.slice(0, 4).map((id) => {
                          const u = users.find((x) => x.id === id);
                          return (
                            <div
                              key={id}
                              className={cn(
                                "h-6 w-6 rounded-full bg-gradient-to-br border-2 border-background text-white text-[10px] flex items-center justify-center font-semibold",
                                gradientFor(id)
                              )}
                              title={u?.full_name}
                            >
                              {initials(u?.full_name || "?")}
                            </div>
                          );
                        })}
                        {assignedIds.length > 4 && (
                          <div className="h-6 w-6 rounded-full bg-muted border-2 border-background text-[10px] flex items-center justify-center font-semibold">
                            +{assignedIds.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </button>

                  {assignOpen && (
                    <div className="mt-2 rounded-xl border border-border bg-background/70 p-3 space-y-2 min-w-0 max-w-full overflow-hidden">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={assignSearch}
                          onChange={(e) => setAssignSearch(e.target.value)}
                          placeholder="Search people..."
                          className="pl-9 h-9 bg-background rounded-full border-0"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {filteredUsers.map((u) => {
                          const active = assignedIds.includes(u.id);
                          return (
                            <button
                              key={u.id}
                              onClick={() =>
                                setAssignedIds((cur) =>
                                  active ? cur.filter((x) => x !== u.id) : [...cur, u.id]
                                )
                              }
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm min-w-0",
                                active ? "bg-primary/10" : "hover:bg-background"
                              )}
                            >
                              <div
                                className={cn(
                                  "h-7 w-7 rounded-full bg-gradient-to-br text-white text-[10px] flex items-center justify-center font-semibold shrink-0",
                                  gradientFor(u.id)
                                )}
                              >
                                {initials(u.full_name)}
                              </div>
                              <span className="flex-1 text-left truncate">{u.full_name}</span>
                              {active && <Check className="h-4 w-4 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-3 sm:px-4 py-3 border-t border-border/60 bg-background flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0 max-w-full overflow-hidden safe-bottom">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap min-w-0 max-w-full">
                {selectedProject && (
                  <Badge variant="secondary" className="rounded-full text-[10px] px-2 py-0 max-w-full min-w-0">
                    <span className="min-w-0 truncate">{selectedProject.name}</span>
                  </Badge>
                )}
                {activityType && (
                  <Badge className="rounded-full text-[10px] px-2 py-0 bg-fuchsia-600 hover:bg-fuchsia-600 max-w-full min-w-0">
                    <span className="min-w-0 truncate">{activityType}</span>
                  </Badge>
                )}
                <Badge variant="outline" className="rounded-full text-[10px] px-2 py-0 gap-1 shrink-0">
                  <span className={cn("h-2 w-2 rounded-full", currentRisk.dot)} />
                  {currentRisk.label}
                </Badge>
              </div>
              <div className="flex items-center justify-end gap-2 shrink-0 w-full sm:w-auto">
                {isEdit && onDelete && (
                  <Button
                    onClick={handleDelete}
                    disabled={deleting}
                    variant="ghost"
                    size="icon"
                    className="rounded-full h-10 w-10 text-destructive hover:bg-destructive/10"
                    aria-label="Delete"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                )}
                <Button
                  onClick={handlePost}
                  disabled={!canPost || saving}
                  className="rounded-full h-10 px-5 bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white hover:brightness-110 shadow-md min-w-0"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                  {isEdit ? "Save" : "Post"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <CameraCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={(blob) => { void uploadPhotoBlob(blob); }}
        title="Take Photo"
      />
    </TooltipProvider>
  );
}
