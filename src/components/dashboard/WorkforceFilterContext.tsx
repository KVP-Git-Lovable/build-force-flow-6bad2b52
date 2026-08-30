import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { resolveRange, type DatePreset } from "./workforceRange";
import {
  useWorkforceOverview,
  useWorkforceUsers,
  type WorkforceUser,
} from "@/hooks/useWorkforceOverview";

interface WorkforceFilterValue {
  preset: DatePreset;
  setPreset: (p: DatePreset) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  selectedUsers: string[];
  setSelectedUsers: (ids: string[]) => void;
  users: WorkforceUser[];
  start: Date;
  end: Date;
  startStr: string;
  endStr: string;
  rangeLabel: string;
  data: ReturnType<typeof useWorkforceOverview>["data"];
  isLoading: boolean;
}

const Ctx = createContext<WorkforceFilterValue | null>(null);

export function WorkforceFilterProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<DatePreset>("this_week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const { data: users = [] } = useWorkforceUsers();

  const range = useMemo(
    () => resolveRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );
  const startStr = format(range.start, "yyyy-MM-dd");
  const endStr = format(range.end, "yyyy-MM-dd");

  const { data, isLoading } = useWorkforceOverview({
    userIds: selectedUsers,
    start: startStr,
    end: endStr,
  });

  const rangeLabel = `${format(range.start, "MMM d")} – ${format(range.end, "MMM d, yyyy")}`;

  return (
    <Ctx.Provider
      value={{
        preset,
        setPreset,
        customStart,
        setCustomStart,
        customEnd,
        setCustomEnd,
        selectedUsers,
        setSelectedUsers,
        users,
        start: range.start,
        end: range.end,
        startStr,
        endStr,
        rangeLabel,
        data,
        isLoading,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorkforceFilterContext() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useWorkforceFilterContext must be used within WorkforceFilterProvider");
  return ctx;
}
