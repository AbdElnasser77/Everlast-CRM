import { Activity, ClipboardList, Eye, FileBarChart, LayoutDashboard, MonitorPlay } from "lucide-react";
import { rolesWith, type DocPage } from "../model";
import { Bullets, Callout, Code, DocLink, H, Lead, P, Shot, Steps, Table, Ui, Who } from "../primitives";

const GROUP = "Oversight";

const supervision: DocPage = {
  key: "supervision",
  label: "Supervision",
  group: GROUP,
  icon: Eye,
  description: "Who's waiting, what every agent is doing, every chat",
  keywords: "supervision kpi waiting sla response time agent board gone cold dropped halfway hand over",
  visible: (ctx) => ctx.can("team:supervise"),
  body: (ctx) => (
    <>
      <Who roles={rolesWith("team:supervise")} />
      <Lead>
        Supervision shows the whole team at once: who&apos;s waiting, how fast they&apos;re answered, and every chat on <b>every
        line</b>, whichever line the top-bar switcher shows. It updates live.
      </Lead>
      <Shot name={ctx.role === "SUPERVISOR" ? "supervisor-supervision" : "supervision"} alt="The Supervision page" />
      <H>The numbers at the top</H>
      <Table
        head={["Card", "Shows"]}
        rows={[
          ["Waiting for reply", "Patients waiting now, how many over 30 minutes, and the longest wait"],
          ["Dropped halfway", "Flow runs left idle for over an hour without finishing (today)"],
          ["Follow-ups due", "Follow-ups due now or overdue"],
          ["Avg first response", "Today's average first reply, in red when it reaches the target"],
        ]}
      />
      <Callout tone="note" title="The response target">
        The target is <b>30 minutes of working time</b>. Quiet hours (21:00–09:00 by default) don&apos;t count. &ldquo;Gone cold&rdquo;
        means a patient has waited over 24 hours.
      </Callout>
      <H>The team board</H>
      <P>
        One card per agent with presence (Online, On break, Offline), waiting chats and replies, plus <b>Everyone</b> and{" "}
        <b>Unassigned</b>. Click a card to filter the chat list to that person; click again to clear the filter.
      </P>
      <P>
        To move someone&apos;s open chats to a colleague or back to the queue, use <Ui>Hand over …&apos;s chats…</Ui> on their
        card. You can&apos;t hand over your own work this way (use your status menu), and supervisors
        can&apos;t hand over an admin&apos;s.
      </P>
      <H>The chat list and detail</H>
      <Bullets
        items={[
          <>Tabs: <Ui>Waiting</Ui>, <Ui>Gone cold</Ui>, <Ui>Dropped halfway</Ui>, <Ui>Follow up</Ui>, <Ui>All chats</Ui>. One row per patient, with &ldquo;Also on &lt;line&gt;&rdquo; when they wrote to several lines.</>,
          <>Click a row for the detail: latest messages, response timeline, flow progress, notes and history, with{" "}
            <Ui>Open in inbox</Ui> and <Ui>Reply</Ui>.</>,
          <>To reassign a chat or add a note, it must be on your active line. Otherwise the panel offers <Ui>Switch to &lt;line&gt;</Ui>.</>,
          <>Filters, the open chat and the selected agent are kept in the address, so you can bookmark or share a view.</>,
        ]}
      />
    </>
  ),
};

const live: DocPage = {
  key: "live-wall",
  label: "Live wall",
  group: GROUP,
  icon: MonitorPlay,
  description: "A full-screen board for a TV in the office",
  keywords: "live wall tv full screen feed board",
  visible: (ctx) => ctx.can("team:supervise"),
  body: () => (
    <>
      <Lead>
        Click <Ui>Live view</Ui> on Supervision for a full-screen board to leave on a TV. It shows the key numbers, each agent&apos;s
        workload, the chats that need attention now, and a live feed of messages and hand-offs.
      </Lead>
      <Shot name="supervision-live" alt="The live wall" />
      <Bullets
        items={[
          <><Ui>Full screen</Ui> (press Esc to leave it), a line selector, and a sound toggle (off by default) for a soft beep on events.</>,
          <>The numbers refresh every 15 seconds and the feed every 5. While the connection is down it shows <b>Reconnecting…</b>.</>,
          <>The clock shows Dubai time. <Ui>Exit</Ui> goes back to Supervision.</>,
        ]}
      />
    </>
  ),
};

const reports: DocPage = {
  key: "reports",
  label: "Reports",
  group: GROUP,
  icon: FileBarChart,
  description: "Overview, team, chats, campaigns and transcripts",
  keywords: "report pdf csv excel export transcripts team performance period",
  visible: (ctx) => ctx.can("team:supervise"),
  body: () => (
    <>
      <Lead>
        Click <Ui>Report</Ui> on Supervision. Pick a report, a period (up to <b>92 days</b>) and a line. Times are clinic time (Dubai).
      </Lead>
      <Shot name="reports" alt="The reports hub" />
      <Table
        head={["Report", "Download as", "Contains"]}
        rows={[
          ["Overview", "PDF", "Chats, response times, team and campaigns, plus any transcripts you choose"],
          ["Team performance", "PDF, CSV", "Per person: response-time bands, % within target, late replies, follow-ups set and cancelled, daily trend, busiest hours"],
          ["Chats", "PDF, Excel", "One row per chat with a message in the period, with its follow-up if one is set"],
          ["Campaigns", "PDF, CSV", "Campaigns started in the period, with opt-outs up to 7 days after sending"],
          ["Transcripts", "PDF", "Full conversations you tick (up to 100 chats, 300 messages each)"],
        ]}
      />
      <Shot name="report-team" alt="The team performance report" />
      <Steps
        items={[
          <>Choose a period: <Ui>Today</Ui>, <Ui>Yesterday</Ui>, <Ui>This week</Ui> (from Monday), <Ui>Last 7 days</Ui>,{" "}
            <Ui>This month</Ui>, <Ui>Last month</Ui> or <Ui>Custom</Ui>.</>,
          <>For transcripts, use the quick picks (<Ui>Late & unanswered</Ui>, <Ui>None</Ui>, <Ui>All</Ui>) or search and tick chats.</>,
          <><Ui>Download PDF</Ui> opens the print dialog. Choose <b>Save as PDF</b>. Or use <Ui>Download CSV</Ui> / <Ui>Download Excel</Ui>.</>,
        ]}
      />
    </>
  ),
};

const dashboard: DocPage = {
  key: "dashboard",
  label: "Dashboard",
  group: GROUP,
  icon: LayoutDashboard,
  description: "Activity at a glance",
  keywords: "dashboard stats messages agents performance",
  visible: (ctx) => ctx.can("stats:read"),
  body: (ctx) => (
    <>
      <Who roles={rolesWith("stats:read")} />
      <Lead>The Dashboard sums up the current line: open and pending chats, messages today and this week, and new contacts.</Lead>
      <Shot name="dashboard" alt="The Dashboard" />
      <Bullets
        items={[
          <>A <b>Messages</b> chart for the last 7 days, incoming and outgoing.</>,
          <><b>Agent Performance</b>: each agent&apos;s status, assigned chats, messages (7 days) and average reply time.</>,
          <><b>Recent activity</b>: the latest entries from the audit log{ctx.can("audit:read") ? "." : ". It needs the audit permission, so for your role it stays empty."}</>,
        ]}
      />
    </>
  ),
};

const health: DocPage = {
  key: "number-health",
  label: "Number Health",
  group: GROUP,
  icon: Activity,
  description: "Quality rating, status and messaging limit from Meta",
  keywords: "number health quality rating green yellow red tier messaging limit flagged restricted banned",
  visible: (ctx) => ctx.can("stats:read"),
  body: () => (
    <>
      <Lead>Number Health shows what Meta thinks of the current line. Check it before a big campaign.</Lead>
      <Table
        head={["Status", "Meaning"]}
        rows={[
          ["Connected", "Sending normally"],
          ["Flagged", "Quality dropped; the line is heading for a lower messaging limit"],
          ["Restricted", "New outgoing conversations are blocked for 24 hours. Replies to patients who wrote in still work."],
          ["Banned", "The line can't send. An appeal through Meta is needed."],
        ]}
      />
      <Bullets
        items={[
          <><b>Quality rating</b>: High (green), Medium (yellow), Low (red). It&apos;s driven by blocks and reports from patients.</>,
          <><b>Messaging limit</b>: how many different people the line can start conversations with in any 24 hours (250 → 1,000 →
            2,000 → 10,000 → 100,000 → Unlimited). The current tier is marked <b>Current</b>.</>,
          <>The table at the bottom lists every number on the WhatsApp account. <Ui>Refresh</Ui> reloads from Meta.</>,
        ]}
      />
      <Callout tone="warn">
        Quality is also checked every 30 minutes. A drop can pause campaigns automatically. See{" "}
        <DocLink to="campaign-rules">Sending rules</DocLink>.
      </Callout>
    </>
  ),
};

const audit: DocPage = {
  key: "audit",
  label: "Audit log",
  group: GROUP,
  icon: ClipboardList,
  description: "Who did what, and when",
  keywords: "audit log history actions security who changed",
  visible: (ctx) => ctx.can("audit:read"),
  body: () => (
    <>
      <Who roles={rolesWith("audit:read")} />
      <Lead>
        The audit log records sign-ins, changes to users, chats, contacts, campaigns, templates, settings and more: who did it, to
        what, and when.
      </Lead>
      <Bullets
        items={[
          <>20 rows at a time; <Ui>Load more</Ui> for older ones. Hover <b>Details</b> to see everything recorded.</>,
          <>Type in <Ui>Filter by action...</Ui> to narrow it: for example <Code>auth.login</Code>, <Code>CAMPAIGN_APPROVED</Code>,{" "}
            <Code>user.</Code>, <Code>TEMPLATE_SENT_TO_OPTED_OUT</Code>.</>,
          <>Phone numbers are masked to their last 4 digits.</>,
        ]}
      />
      <Table
        head={["Area", "Actions (examples)"]}
        rows={[
          ["Sign-in", "auth.login · auth.login_failed · auth.logout"],
          ["Users", "user.created · user.updated · user.password_reset · user.handed_over"],
          ["Chats", "conversation.assigned · conversation.outcome_set · message.deleted"],
          ["Contacts", "customer.created · customer.imported · CUSTOMER_OPTED_OUT"],
          ["Campaigns", "CAMPAIGN_SUBMITTED · CAMPAIGN_APPROVED · CAMPAIGN_REJECTED · CAMPAIGN_PAUSED"],
          ["Settings and lines", "SETTINGS_UPDATED · NUMBER_CREATED · NUMBER_QUALITY_DROPPED"],
        ]}
      />
    </>
  ),
};

export const oversightPages: DocPage[] = [supervision, live, reports, dashboard, health, audit];
