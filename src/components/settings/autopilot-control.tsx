"use client";

import { useState, useTransition } from "react";

import { setAutonomyLevelAction, setEmergencyStopAction } from "@/app/(app)/settings/autopilot/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { AUTONOMY_LABELS, AUTONOMY_LEVELS, type AutonomyLevel } from "@/lib/ai/autopilot/autonomy";

/**
 * Owner control for AI autonomy + the emergency stop. Optimistic; the server
 * action (and RLS) enforce owner-only. Emergency stop halts every automated
 * action immediately, independent of the level.
 */
export function AutopilotControl({ level, emergencyStop }: { level: AutonomyLevel; emergencyStop: boolean }) {
  const [pending, startTransition] = useTransition();
  const [lvl, setLvl] = useState<AutonomyLevel>(level);
  const [stopped, setStopped] = useState(emergencyStop);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function changeLevel(next: AutonomyLevel) {
    const prev = lvl;
    setLvl(next);
    startTransition(async () => {
      const r = await setAutonomyLevelAction(next);
      if (r.error) {
        setLvl(prev);
        setNotice({ tone: "error", text: r.error });
      } else {
        setNotice({ tone: "success", text: "Autonomy updated." });
      }
    });
  }

  function toggleStop(next: boolean) {
    setStopped(next);
    startTransition(async () => {
      const r = await setEmergencyStopAction(next);
      if (r.error) {
        setStopped(!next);
        setNotice({ tone: "error", text: r.error });
      } else {
        setNotice({ tone: "success", text: next ? "Emergency stop ON — all automation halted." : "Emergency stop cleared." });
      }
    });
  }

  return (
    <Card>
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">AI autonomy</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            How much the AI may do on its own. Outward emails always require your approval unless you explicitly enable
            sending.
          </p>
          <div className="mt-3 max-w-xl">
            <Select value={lvl} disabled={pending || stopped} onChange={(e) => changeLevel(e.target.value as AutonomyLevel)}>
              {AUTONOMY_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {AUTONOMY_LABELS[l]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
          <div>
            <p className="text-sm font-semibold text-rose-800">Emergency stop</p>
            <p className="text-xs text-rose-700">
              {stopped ? "Active — all automated actions are halted." : "Halt every automated action immediately."}
            </p>
          </div>
          <Button
            type="button"
            variant={stopped ? "secondary" : "danger"}
            disabled={pending}
            onClick={() => toggleStop(!stopped)}
          >
            {stopped ? "Resume automation" : "Stop all automation"}
          </Button>
        </div>

        {notice ? <Alert tone={notice.tone === "success" ? "success" : "error"}>{notice.text}</Alert> : null}
      </div>
    </Card>
  );
}
