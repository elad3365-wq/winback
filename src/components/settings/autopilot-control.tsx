"use client";

import { useState, useTransition } from "react";

import {
  setAutonomyLevelAction,
  setEmergencyStopAction,
  setSendAuthorizedAction,
} from "@/app/(app)/settings/autopilot/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { AUTONOMY_LABELS, AUTONOMY_LEVELS, type AutonomyLevel } from "@/lib/ai/autopilot/autonomy";

/**
 * Owner control for AI autonomy, the emergency stop, and autonomous-send
 * authorization. Optimistic; the server action (and RLS) enforce owner-only.
 * Emergency stop halts every automated action immediately, independent of level.
 * Autonomous sending additionally requires AUTOPILOT level AND the environment's
 * send gate — this toggle is the owner's explicit consent on top of those.
 */
export function AutopilotControl({
  level,
  emergencyStop,
  sendAuthorized,
  sendingEnvEnabled,
}: {
  level: AutonomyLevel;
  emergencyStop: boolean;
  sendAuthorized: boolean;
  sendingEnvEnabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [lvl, setLvl] = useState<AutonomyLevel>(level);
  const [stopped, setStopped] = useState(emergencyStop);
  const [sendOn, setSendOn] = useState(sendAuthorized);
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

  function toggleSend(next: boolean) {
    setSendOn(next);
    startTransition(async () => {
      const r = await setSendAuthorizedAction(next);
      if (r.error) {
        setSendOn(!next);
        setNotice({ tone: "error", text: r.error });
      } else {
        setNotice({
          tone: "success",
          text: next ? "Autonomous sending authorized." : "Autonomous sending turned off — replies will wait for your approval.",
        });
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

        {/* Autonomous sending — only meaningful at AUTOPILOT, and only actually
            sends when the environment's send gate is on. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <div>
            <p className="text-sm font-semibold text-amber-900">Autonomous sending</p>
            <p className="text-xs text-amber-800">
              {lvl !== "autopilot"
                ? "Set autonomy to Autopilot to allow the AI to send replies on its own."
                : !sendingEnvEnabled
                  ? "Sending is switched off for this environment, so replies will still wait for your approval."
                  : sendOn
                    ? "On — the AI sends safe, confident replies automatically; sensitive ones still come to you."
                    : "Off — the AI drafts replies and waits for your approval."}
            </p>
          </div>
          <Button
            type="button"
            variant={sendOn ? "secondary" : "primary"}
            disabled={pending || lvl !== "autopilot"}
            onClick={() => toggleSend(!sendOn)}
          >
            {sendOn ? "Turn off auto-send" : "Authorize auto-send"}
          </Button>
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
