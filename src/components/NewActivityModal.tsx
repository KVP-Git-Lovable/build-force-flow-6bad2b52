import { useState, useEffect } from "react";
import { motion } from "framer-motion";
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
        <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-6 text-white rounded-t-lg">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <span className="text-3xl">✨</span> New Activity
              </h2>
              <p className="text-sm text-white/90 mt-1">Share what's happening on the ground</p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-white hover:bg-white/20 p-2 rounded-full transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Project/Site Selection */}
          <div>
            <Label className="text-sm font-bold text-gray-700 block mb-3">PROJECT</Label>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-full border-2 border-gray-300 focus:border-purple-500"
              />
            </div>
            <div className="flex gap-3 flex-wrap mb-4">
              {filteredSites.length > 0 ? (
                filteredSites.map((site) => (
                  <motion.button
                    key={site.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setForm({ ...form, site_id: site.id })}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all",
                      form.site_id === site.id
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-2xl overflow-hidden">
                      {site.image ? (
                        <img
                          src={site.image}
                          alt={site.site_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        "🏢"
                      )}
                    </div>
                    <span className="text-xs font-medium text-center max-w-[80px] truncate">
                      {site.site_name}
                    </span>
                  </motion.button>
                ))
              ) : (
                <p className="text-sm text-gray-500">No projects found</p>
              )}
            </div>
          </div>

          {/* Activity Date */}
          <div>
            <Label className="text-sm font-medium text-gray-700">Activity Date</Label>
            <Input
              type="date"
              value={form.activity_date}
              onChange={(e) => setForm({ ...form, activity_date: e.target.value })}
              className="mt-2 rounded-lg border-2 border-gray-300 focus:border-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              {new Date(form.activity_date).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Description with Rich Media */}
          <div>
            <Label className="text-sm font-medium text-gray-700 mb-2 block">Description</Label>
            <div className="relative">
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What's happening in your project?"
                className="min-h-[120px] rounded-lg border-2 border-gray-300 focus:border-purple-500 pr-12 p-4 resize-none"
              />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button className="p-2 text-purple-600 hover:bg-purple-50 rounded-full transition-colors">
                  <Camera className="h-5 w-5" />
                </button>
                <button className="p-2 text-purple-600 hover:bg-purple-50 rounded-full transition-colors">
                  <MapPin className="h-5 w-5" />
                </button>
                <button className="p-2 text-purple-600 hover:bg-purple-50 rounded-full transition-colors">
                  <TrendingUp className="h-5 w-5" />
                </button>
                <button className="p-2 text-purple-600 hover:bg-purple-50 rounded-full transition-colors">
                  <Mic className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Activity Type */}
          <div>
            <Label className="text-sm font-bold text-amber-700 block mb-3 bg-amber-50 p-2 rounded">
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
                    "px-4 py-2 rounded-full border-2 font-medium transition-all text-sm",
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
          <div className="flex items-center justify-between p-3 rounded-lg border-2 border-green-200 bg-green-50">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="font-medium text-green-700 text-sm">{form.status}</span>
            </div>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger className="w-auto border-0 bg-transparent">
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
          <div className="pt-4 border-t-2 border-gray-200">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              disabled={!form.site_id || !form.activity_type || !form.description.trim() || isLoading}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 rounded-full hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
