import { describe, expect, it } from "vitest";

import type { Lead } from "@/lib/database.types";
import {
  buildDailySeries,
  dashboardMetrics,
  daysOverdue,
  effectiveFollowUpDate,
  isDueToday,
  isOverdue,
  sortLeads,
  stageForStatus,
  todayIso,
} from "@/lib/leads";

const NOW = new Date("2024-06-15T12:00:00Z"); // today = 2024-06-15

function lead(partial: Partial<Lead>): Lead {
  return {
    id: "id",
    business_id: "b",
    customer_name: "Test",
    phone: "5551234567",
    service: "svc",
    estimate_amount: 0,
    status: "new",
    follow_up_date: null,
    next_follow_up_at: null,
    follow_up_count: 0,
    last_follow_up_at: null,
    autopilot_paused: false,
    unsubscribe_status: "subscribed",
    created_by: null,
    created_at: "2024-06-01T00:00:00Z",
    updated_at: "2024-06-01T00:00:00Z",
    ...partial,
  };
}

describe("date helpers", () => {
  it("todayIso returns the UTC calendar date", () => {
    expect(todayIso(NOW)).toBe("2024-06-15");
  });

  it("isOverdue only for past dates on open leads", () => {
    expect(isOverdue("2024-06-14", "new", NOW)).toBe(true);
    expect(isOverdue("2024-06-15", "new", NOW)).toBe(false);
    expect(isOverdue("2024-06-16", "new", NOW)).toBe(false);
    expect(isOverdue(null, "new", NOW)).toBe(false);
    // closed / paused / unsubscribed never count as overdue
    expect(isOverdue("2024-06-14", "recovered", NOW)).toBe(false);
    expect(isOverdue("2024-06-14", "lost", NOW)).toBe(false);
    expect(isOverdue("2024-06-14", "paused", NOW)).toBe(false);
    expect(isOverdue("2024-06-14", "unsubscribed", NOW)).toBe(false);
  });

  it("isDueToday only for today on open leads", () => {
    expect(isDueToday("2024-06-15", "followup_1", NOW)).toBe(true);
    expect(isDueToday("2024-06-14", "followup_1", NOW)).toBe(false);
  });

  it("daysOverdue counts whole days, 0 when not overdue", () => {
    expect(daysOverdue("2024-06-14", NOW)).toBe(1);
    expect(daysOverdue("2024-06-10", NOW)).toBe(5);
    expect(daysOverdue("2024-06-20", NOW)).toBe(0);
    expect(daysOverdue(null, NOW)).toBe(0);
  });
});

describe("effectiveFollowUpDate", () => {
  it("prefers autopilot's next_follow_up_at, else the manual follow_up_date", () => {
    expect(effectiveFollowUpDate(lead({ next_follow_up_at: "2024-06-20T09:00:00Z", follow_up_date: "2024-06-25" }))).toBe("2024-06-20");
    expect(effectiveFollowUpDate(lead({ next_follow_up_at: null, follow_up_date: "2024-06-25" }))).toBe("2024-06-25");
    expect(effectiveFollowUpDate(lead({}))).toBe(null);
  });
});

describe("stageForStatus", () => {
  it("maps the follow-up progression under the Follow-up column", () => {
    expect(stageForStatus("new")).toBe("new");
    expect(stageForStatus("contacted")).toBe("contacted");
    expect(stageForStatus("followup_1")).toBe("follow_up");
    expect(stageForStatus("followup_3")).toBe("follow_up");
    expect(stageForStatus("cold")).toBe("follow_up");
    expect(stageForStatus("paused")).toBe("follow_up");
    expect(stageForStatus("interested")).toBe("interested");
    expect(stageForStatus("call_requested")).toBe("interested");
    expect(stageForStatus("recovered")).toBe("recovered");
    expect(stageForStatus("lost")).toBe("lost");
    expect(stageForStatus("unsubscribed")).toBe("lost");
  });
});

describe("dashboardMetrics", () => {
  it("returns all zeros for no leads (zero-data state)", () => {
    const m = dashboardMetrics([], NOW);
    expect(m.total).toBe(0);
    expect(m.needsFollowUp).toBe(0);
    expect(m.dueToday).toBe(0);
    expect(m.overdue).toBe(0);
    expect(m.createdThisWeek).toBe(0);
    expect(m.byStatus.new).toBe(0);
  });

  it("counts by status, follow-up state (effective date), and recency", () => {
    const leads = [
      lead({ status: "new", created_at: "2024-06-15T09:00:00Z" }), // this week
      lead({ status: "followup_1", created_at: "2024-06-10T09:00:00Z", next_follow_up_at: "2024-06-14T09:00:00Z" }), // overdue (autopilot), this week
      lead({ status: "follow_up_needed", created_at: "2024-06-01T09:00:00Z", follow_up_date: "2024-06-15" }), // due today
      lead({ status: "interested", created_at: "2024-05-01T09:00:00Z", follow_up_date: "2024-06-20" }), // upcoming
      lead({ status: "recovered", created_at: "2024-06-14T09:00:00Z", follow_up_date: "2024-06-01" }), // closed → not overdue, this week
      lead({ status: "lost", created_at: "2024-01-01T09:00:00Z" }),
    ];
    const m = dashboardMetrics(leads, NOW);

    expect(m.total).toBe(6);
    expect(m.byStatus.new).toBe(1);
    expect(m.byStatus.followup_1).toBe(1);
    expect(m.byStatus.recovered).toBe(1);
    expect(m.overdue).toBe(1); // followup_1 only (recovered is closed)
    expect(m.dueToday).toBe(1); // follow_up_needed
    expect(m.needsFollowUp).toBe(2); // overdue + due today
    expect(m.createdThisWeek).toBe(3); // 06-15, 06-10, 06-14
  });
});

describe("buildDailySeries", () => {
  it("produces one bucket per day, oldest first, ignoring out-of-range", () => {
    const series = buildDailySeries(
      ["2024-06-15T01:00:00Z", "2024-06-15T22:00:00Z", "2024-06-14T05:00:00Z", "2024-01-01T00:00:00Z"],
      7,
      NOW,
    );
    expect(series).toHaveLength(7);
    expect(series[0].date).toBe("2024-06-09");
    expect(series[6].date).toBe("2024-06-15");
    expect(series[6].count).toBe(2);
    expect(series[5].count).toBe(1);
    expect(series.reduce((s, p) => s + p.count, 0)).toBe(3);
  });
});

describe("sortLeads", () => {
  const a = lead({ id: "a", created_at: "2024-06-01T00:00:00Z", follow_up_date: "2024-06-20", last_follow_up_at: "2024-06-10T00:00:00Z" });
  const b = lead({ id: "b", created_at: "2024-06-10T00:00:00Z", next_follow_up_at: "2024-06-12T00:00:00Z", last_follow_up_at: null });
  const c = lead({ id: "c", created_at: "2024-06-05T00:00:00Z", last_follow_up_at: "2024-06-14T00:00:00Z" });

  it("newest first", () => {
    expect(sortLeads([a, b, c], "newest").map((l) => l.id)).toEqual(["b", "c", "a"]);
  });
  it("oldest first", () => {
    expect(sortLeads([a, b, c], "oldest").map((l) => l.id)).toEqual(["a", "c", "b"]);
  });
  it("next follow-up: soonest effective date first, nulls last", () => {
    expect(sortLeads([a, b, c], "follow_up").map((l) => l.id)).toEqual(["b", "a", "c"]);
  });
  it("recently contacted: most recent last_follow_up_at first, nulls last", () => {
    expect(sortLeads([a, b, c], "recent_contact").map((l) => l.id)).toEqual(["c", "a", "b"]);
  });
});
