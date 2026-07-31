import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Camera, MapPin, TrendingUp, Mic, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Site {
  id: string;
  site_name: string;
  image?: string;
}

interface NewActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: Site[];
  activityTypes: string[];
  onSubmit: (data: {
    site_id: string;
    activity_type: string;
    description: string;
    activity_date: string;
    status?: string;
  }) => Promise<void>;
  isLoading?: boolean;
}

const ACTIVITY_TYPE_CHIPS = [
  "Contractor Meeting",
  "Material Inspection",
  "Site Visit/Survey Work",
  "Office Work",
];

// Dummy site images - using unsplash URLs
const SITE_IMAGES: Record<string, string> = {
  "Aashraya": "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=200&h=200&fit=crop",
  "BBW Karkala": "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=200&h=200&fit=crop",
  "Bharath mall": "https://images.unsplash.com/photo-1479666601514-eecc9a9aab44?w=200&h=200&fit=crop",
  "Head office": "https://images.unsplash.com/photo-1497366216548-37526070297c?w=200&h=200&fit=crop",
  "Bharath Be...": "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=200&h=200&fit=crop",
  "Prajwal Arc...": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=200&h=200&fit=crop",
};

export default function NewActivityModal({
  open,
  onOpenChange,
  sites,
  activityTypes,
  onSubmit,
  isLoading = false,
}: NewActivityModalProps) {
  const [form, setForm] = useState({
    site_id: "",
    activity_type: "",
    description: "",
    activity_date: new Date().toISOString().slice(0, 10),
    status: "On Track",
  });
  const [searchQuery, setSearchQuery] = useState("");

  const statusColors: Record<string, { bg: string; border: string; dot: string; text: string }> = {
    "On Track": { bg: "bg-green-50", border: "border-green-300", dot: "bg-green-500", text: "text-green-700" },
    "At Risk": { bg: "bg-amber-50", border: "border-amber-300", dot: "bg-amber-500", text: "text-amber-700" },
    "Delayed": { bg: "bg-red-50", border: "border-red-300", dot: "bg-red-500", text: "text-red-700" },
    "Completed": { bg: "bg-blue-50", border: "border-blue-300", dot: "bg-blue-500", text: "text-blue-700" },
  };

  const currentStatusColor = statusColors[form.status] || statusColors["On Track"];

  useEffect(() => {
    if (!open) {
      setForm({
        site_id: "",
        activity_type: "",
        description: "",
        activity_date: new Date().toISOString().slice(0, 10),
        status: "On Track",
      });
      setSearchQuery("");
    }
  }, [open]);

  const filteredSites = sites.filter((site) =>
    site.site_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!form.site_id || !form.activity_type || !form.description.trim()) {
      return;
    }
    try {
      await onSubmit({
        site_id: form.site_id,
        activity_type: form.activity_type,
        description: form.description,
        activity_date: form.activity_date,
        status: form.status,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting activity:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 border-0">
        {/* Gradient Header */}
        <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-6 text-white rounded-t-lg flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">✨</span> New Activity
            </h2>
            <p className="text-sm text-white/90 mt-1">Share what's happening on the ground</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Project/Site Selection */}
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide text-blue-700 block mb-3">PROJECT</Label>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-full border border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 text-sm"
              />
            </div>
            <div className="flex gap-4 flex-wrap">
              {filteredSites.length > 0 ? (
                filteredSites.slice(0, 4).map((site) => {
                  const imageUrl = SITE_IMAGES[site.site_name] || SITE_IMAGES["Head office"];
                  return (
                    <motion.button
                      key={site.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setForm({ ...form, site_id: site.id })}
                      className={cn(
                        "flex flex-col items-center gap-2 p-0 transition-all",
                        form.site_id === site.id
                          ? "opacity-100"
                          : "opacity-75 hover:opacity-100"
                      )}
                    >
                      <div className={cn(
                        "w-16 h-16 rounded-full overflow-hidden border-2 transition-all flex-shrink-0",
                        form.site_id === site.id
                          ? "border-purple-500 ring-2 ring-purple-300"
                          : "border-gray-200"
                      )}>
                        <img
                          src={imageUrl}
                          alt={site.site_name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-xs font-medium text-center max-w-[70px] truncate text-gray-700">
                        {site.site_name}
                      </span>
                    </motion.button>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500">No projects found</p>
              )}
            </div>
          </div>

          {/* Activity Date */}
          <div className="bg-white rounded-xl p-3 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Activity Date</p>
                <p className="text-sm font-medium text-gray-900 mt-1">{format(new Date(form.activity_date), "MMM dd, yyyy")}</p>
              </div>
              <Input
                type="date"
                value={form.activity_date}
                onChange={(e) => setForm({ ...form, activity_date: e.target.value })}
                className="w-24 rounded-lg border border-gray-200 focus:border-purple-500 focus:ring-0 text-xs"
              />
            </div>
          </div>

          {/* Description with Rich Media */}
          <div>
            <Label className="text-xs font-semibold text-gray-700 mb-2 block">Description</Label>
            <div className="relative">
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What's happening in your project?"
                className="min-h-[100px] rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-0 pr-12 p-4 resize-none text-sm"
              />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-full transition-colors" title="Photo">
                  <Camera className="h-4 w-4" />
                </button>
                <button className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-full transition-colors" title="Location">
                  <MapPin className="h-4 w-4" />
                </button>
                <button className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-full transition-colors" title="Metrics">
                  <TrendingUp className="h-4 w-4" />
                </button>
                <button className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-full transition-colors" title="Voice">
                  <Mic className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Activity Type */}
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide text-amber-700 block mb-3 bg-amber-50 px-3 py-1.5 rounded-lg inline-block">
              ACTIVITY TYPE
            </Label>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPE_CHIPS.map((type) => (
                <motion.button
                  key={type}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setForm({ ...form, activity_type: type })}
                  className={cn(
                    "px-4 py-2 rounded-full border font-medium transition-all text-sm",
                    form.activity_type === type
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300"
                  )}
                >
                  {type}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className={cn("flex items-center justify-between p-3 rounded-xl border transition-all", currentStatusColor.bg, currentStatusColor.border)}>
            <div className="flex items-center gap-2">
              <div className={cn("w-3 h-3 rounded-full", currentStatusColor.dot)} />
              <span className={cn("font-medium text-sm", currentStatusColor.text)}>{form.status}</span>
            </div>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className={cn("w-auto border-0 bg-transparent text-xs", currentStatusColor.text)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="On Track">On Track</SelectItem>
                <SelectItem value="At Risk">At Risk</SelectItem>
                <SelectItem value="Delayed">Delayed</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-gray-200">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              disabled={!form.site_id || !form.activity_type || !form.description.trim() || isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold py-3 rounded-full hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="text-lg">✨</span>
              {isLoading ? "Posting..." : "Post"}
            </motion.button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
