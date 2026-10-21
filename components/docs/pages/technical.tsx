import { Boxes, Database, FlaskConical, Lock, Rocket, Webhook } from "lucide-react";
import type { DocCtx, DocPage } from "../model";
import { Bullets, Callout, Code, DocLink, H, Lead, P, Pre, Steps, Table } from "../primitives";

const GROUP = "Technical";
const admin = (ctx: DocCtx) => ctx.can("settings:write");

function Box({ title, lines, tone = "gray" }: { title: string; lines: string[]; tone?: "gray" | "brand" | "sky" }) {
  const toneCls = { gray: "border-gray-200 bg-white", brand: "border-brand/40 bg-brand-50", sky: "border-sky-200 bg-sky-50" }[tone];
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 ${toneCls}`}>
      <p className="text-[13px] font-bold text-gray-900">{title}</p>
      {lines.map((l) => <p key={l} className="text-[12px] text-gray-500 leading-snug">{l}</p>)}
    </div>
  );
}

const Arrow = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center text-[11px] text-gray-400 py-1 gap-1.5"><span>↓</span>{label}</div>
);

const architecture: DocPage = {
  key: "architecture",
  label: "Architecture",
  group: GROUP,
  icon: Boxes,
  description: "The two apps, how they talk and where data lives",
  keywords: "architecture stack nextjs express prisma postgres socket.io diagram",
  visible: admin,
  body: () => (
    <>
      <Lead>
        Everlast CRM is two apps: a <b>Next.js frontend</b> (this site) and an <b>Express API</b>, with PostgreSQL behind it. Both run
        on Node.js 22.
      </Lead>
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
          <div>
            <Box title="Browser" lines={["Staff use the app"]} />
            <Arrow label="HTTPS + WebSocket" />
            <Box tone="brand" title="Frontend — Everlast-CRM" lines={["Next.js 16 · React 19", "Tailwind 4 · TypeScript"]} />
          </div>
          <div>
            <Box title="Meta WhatsApp Cloud API" lines={["Sends messages", "Webhooks: inbound + statuses"]} />
            <Arrow label="Graph API ↔ webhooks" />
            <Box tone="brand" title="API — everlast-whatsapp-crm-api" lines={["Express 5 · Socket.IO 4", "Prisma 5 · node-cron jobs"]} />
          </div>
          <div>
            <Box tone="sky" title="PostgreSQL (Neon)" lines={["All CRM data"]} />
            <Arrow label="also uses" />
            <Box title="Integrations" lines={["Cloudinary or R2 (media)"]} />
          </div>
        </div>
      </div>
      <H>How the frontend talks to the API</H>
      <Bullets
        items={[
          <>Every request goes to <Code>NEXT_PUBLIC_API_URL</Code> with the session cookie (an httpOnly JWT, valid for 8 hours).</>,
          <>Every request carries <Code>X-Requested-With: XMLHttpRequest</Code> (the CSRF guard) and <Code>X-WhatsApp-Number-Id</Code>{" "}
            (the active line). The server echoes the line back, so a reply that arrives after a switch is dropped.</>,
          <>Switching lines aborts requests in flight and remounts the dashboard, so no data from the previous line can show.</>,
          <>A 401 sends the browser back to <Code>/login?expired=1</Code>.</>,
          <>Live updates come over Socket.IO (<Code>NEXT_PUBLIC_SOCKET_URL</Code>). The handshake re-checks the cookie, and rooms are per
            user and per line.</>,
        ]}
      />
      <H>Permissions</H>
      <P>
        Roles map to permissions in <Code>config/permissions.js</Code> on the API, which is the single source of truth. The server
        returns the user&apos;s permission list on sign-in and from <Code>/api/users/me</Code>. The frontend only uses it to decide
        what to <i>show</i> (<Code>useCurrentUser().can()</Code>); every route enforces it on the server.
      </P>
      <H>Repositories</H>
      <Table
        head={["Repo", "Key folders"]}
        rows={[
          ["Everlast-CRM (frontend)", <><Code key="a">app/(dashboard)/*</Code> pages · <Code key="b">components/</Code> · <Code key="c">lib/api.ts</Code> · <Code key="d">proxy.ts</Code> (route guard)</>],
          ["everlast-whatsapp-crm-api", <><Code key="a">modules/*</Code> (routes + controllers) · <Code key="b">utils/</Code> · <Code key="c">jobs/</Code> · <Code key="d">prisma/</Code> · <Code key="e">tests/</Code></>],
        ]}
      />
    </>
  ),
};

const integrations: DocPage = {
  key: "integrations",
  label: "Webhooks, jobs & integrations",
  group: GROUP,
  icon: Webhook,
  description: "Meta webhooks, background jobs, sockets, media",
  keywords: "webhook meta signature recovery jobs cron scheduler socket events cloudinary r2 cloudflare",
  visible: admin,
  body: () => (
    <>
      <H>Meta webhooks</H>
      <P>Meta sends every inbound message and delivery status to:</P>
      <Pre>{"https://<api-host>/api/webhooks/whatsapp/messages"}</Pre>
      <Steps
        items={[
          <>Verification (GET) succeeds when <Code>hub.verify_token</Code> equals <Code>WHATSAPP_VERIFY_TOKEN</Code>.</>,
          <>Each POST must carry a valid <Code>X-Hub-Signature-256</Code> (HMAC-SHA256 with <Code>WHATSAPP_APP_SECRET</Code>); otherwise 401.</>,
          <>The payload is <b>saved before Meta gets its 200</b>. If saving fails, Meta gets a 500 and sends it again.</>,
          <>Processing: route by phone-number id, skip duplicates, update the contact and opt-outs, credit campaign replies, upload
            media in the background, emit socket events, then run the flow engine.</>,
          <>A recovery job re-runs anything unfinished every minute (up to 5 attempts) and prunes handled events after 7 days.</>,
        ]}
      />
      <H>Background jobs (API, node-cron)</H>
      <Table
        head={["Job", "Runs", "Does"]}
        rows={[
          ["Campaign scheduler", "Every minute", "Starts due scheduled campaigns, resumes automatic pauses, and takes over campaigns whose sender died"],
          ["Template status sync", "Every 5 min", "Backup poll of Meta for submitted templates"],
          ["Webhook recovery", "Every minute (+ 03:17 daily prune)", "Re-handles unfinished webhook deliveries"],
          ["Number quality watch", "Every 30 min + at start", "Reads each line's quality; may pause campaigns and alert admins"],
          ["Follow-up reminders", "Every 5 min", "Sends one reminder per due follow-up"],
        ]}
      />
      <Callout tone="warn" title="Run one API instance">
        Socket rooms, the campaign sender, rate limits and the settings cache live in memory. Keep the API at <b>one replica</b>. On
        shutdown, campaign loops drain for up to 25 seconds and stay RUNNING, so the next process carries on.
      </Callout>
      <H>Other integrations</H>
      <Table
        head={["Service", "Used for", "Configured by"]}
        rows={[
          ["Cloudinary or Cloudflare R2", "Storing media sent and received", <Code key="c">STORAGE_PROVIDER</Code>],
        ]}
      />
      <H>Socket events (server → browser)</H>
      <P>
        <Code>message.*</Code> (created, status_updated, media_ready, reaction, deleted) · <Code>conversation.*</Code> (created, updated,
        assigned, status_changed, outcome, note) · <Code>campaign.*</Code> (submitted, approved, rejected, started, progress, paused,
        completed, cancelled, replied) · <Code>follow_up.due</Code> · <Code>flow.handoff</Code> ·{" "}
        <Code>template.status_changed</Code> · <Code>number.quality_changed</Code> · <Code>settings.changed</Code> · <Code>typing.*</Code>.
      </P>
    </>
  ),
};

const deployment: DocPage = {
  key: "deployment",
  label: "Deployment & environment",
  group: GROUP,
  icon: Rocket,
  description: "Railway, environment variables, first deploy, create-admin",
  keywords: "deploy railway env environment variables config.env database_url jwt create admin migrate node 22",
  visible: admin,
  body: () => (
    <>
      <Lead>
        Both apps deploy on Railway (Nixpacks) and need <b>Node 22.x</b>. On a developer machine, use a version manager such as fnm,
        which reads the <Code>engines</Code> field.
      </Lead>
      <Table
        head={["App", "Build", "Start", "Health check"]}
        rows={[
          ["API", <Code key="b">npx prisma generate</Code>, <><Code key="s">node server.js</Code> (pre-deploy: <Code key="m">npx prisma migrate deploy</Code>)</>, <Code key="h">/health</Code>],
          ["Frontend", <Code key="b">npm run build</Code>, <Code key="s">npm run start</Code>, <Code key="h">/login</Code>],
        ]}
      />
      <H>API environment (config.env locally)</H>
      <Table
        head={["Variable", "Purpose"]}
        rows={[
          [<Code key="v">DATABASE_URL</Code>, "PostgreSQL connection string (required)"],
          [<Code key="v">JWT_SECRET</Code>, "Signs sessions (required). Changing it signs everyone out."],
          [<Code key="v">PORT</Code>, "Set by Railway (required locally, e.g. 8000)"],
          [<Code key="v">WHATSAPP_VERIFY_TOKEN</Code>, "Webhook verification (required)"],
          [<Code key="v">WHATSAPP_APP_SECRET</Code>, "Webhook signature secret (required)"],
          [<Code key="v">NODE_ENV</Code>, "production in production: Secure cookies, no /api-docs or /api/dev"],
          [<Code key="v">FRONTEND_URL</Code>, "The frontend's exact origin, for CORS and sockets"],
          [<Code key="v">COOKIE_SAMESITE</Code>, "lax when app and API share a site; none across sites"],
          [<Code key="v">WHATSAPP_TOKEN_*</Code>, "One access token per line, named by the line's token key"],
          [<Code key="v">WHATSAPP_APP_ID</Code>, "Needed to submit templates with a media header"],
          [<Code key="v">STORAGE_PROVIDER</Code>, "cloudinary (with CLOUDINARY_*) or r2 (with R2_*)"],
          [<Code key="v">SETTINGS_ENCRYPTION_KEY</Code>, "32+ characters; encrypts secrets saved in Settings. Keep it stable."],
          [<Code key="v">QUIET_HOURS_START / END / TZ</Code>, "Default quiet hours until saved in Settings"],
        ]}
      />
      <H>Frontend environment</H>
      <P>
        <Code>NEXT_PUBLIC_API_URL</Code> (the API origin, without <Code>/api</Code>) and <Code>NEXT_PUBLIC_SOCKET_URL</Code>. They&apos;re
        read at <b>build</b> time, so redeploy after changing them.
      </P>
      <H>First deploy</H>
      <Steps
        items={[
          <>Deploy the API. The pre-deploy step applies migrations. Never use <Code>prisma db push</Code>: it would drop the index that
            keeps exactly one default line.</>,
          <>Create the first admin once, from the service shell:
            <Pre>{"ADMIN_USERNAME=… ADMIN_PASSWORD=… npm run create-admin"}</Pre>
            The password needs 12+ characters with a letter and a number. Remove <Code>ADMIN_PASSWORD</Code> afterwards. To reset it
            later, add <Code>-- --reset</Code>.</>,
          <>Deploy the frontend with the two <Code>NEXT_PUBLIC_*</Code> variables.</>,
          <>Sign in, add the WhatsApp lines (<DocLink to="whatsapp-numbers">WhatsApp lines</DocLink>) and staff test numbers.</>,
          <>Point Meta&apos;s webhook at <Code>/api/webhooks/whatsapp/messages</Code> with the same verify token.</>,
        ]}
      />
    </>
  ),
};

const security: DocPage = {
  key: "security",
  label: "Security",
  group: GROUP,
  icon: Lock,
  description: "Sessions, CSRF, rate limits, secrets and logging",
  keywords: "security csrf cookie jwt rate limit helmet token secret encryption audit",
  visible: admin,
  body: () => (
    <>
      <Table
        head={["Area", "How it's protected"]}
        rows={[
          ["Sessions", "httpOnly JWT cookie, 8 hours, Secure in production. Every request re-reads the user, so deactivating, resetting a password or changing a role takes effect at once."],
          ["CSRF", "State-changing API calls need X-Requested-With: XMLHttpRequest, which a cross-site page can't send. CORS allows only FRONTEND_URL."],
          ["Sign-in", "10 failures per 15 minutes per IP + username, and 100 per 15 minutes per IP."],
          ["Permissions", "Every route declares its permission, and the server refuses to start if one is unknown."],
          ["Webhooks", "HMAC signature check (timing-safe); exempt from CSRF; payloads aren't logged."],
          ["WhatsApp tokens", "Only in the environment. A line can only name WHATSAPP_ACCESS_TOKEN or WHATSAPP_TOKEN_* (an allow-list)."],
          ["Secrets in Settings", "Encrypted with AES-256-GCM using SETTINGS_ENCRYPTION_KEY."],
          ["Logs and errors", "Errors are logged without request configs (no tokens). Users see a reference id, never internal details."],
          ["Audit", "Sign-ins, user changes, approvals, opt-out overrides and settings changes are all recorded."],
        ]}
      />
      <Callout tone="danger" title="Before go-live">
        Remove the demo accounts and demo data (<Code>npm run seed:demo -- --remove</Code>; see{" "}
        <DocLink to="testing">Testing & demo data</DocLink>), make sure <Code>NODE_ENV=production</Code>, and use long random values for{" "}
        <Code>JWT_SECRET</Code> and <Code>SETTINGS_ENCRYPTION_KEY</Code>.
      </Callout>
    </>
  ),
};

const dataModel: DocPage = {
  key: "data-model",
  label: "Data model",
  group: GROUP,
  icon: Database,
  description: "The main tables and how they relate",
  keywords: "data model prisma schema tables customer conversation message campaign",
  visible: admin,
  body: () => (
    <>
      <Lead>
        The schema lives in <Code>prisma/schema.prisma</Code> in the API repo. Change it with <Code>npx prisma migrate dev --name …</Code>.
      </Lead>
      <Table
        head={["Model", "Holds"]}
        rows={[
          ["WhatsAppNumber", "A line: Meta ids, label, default flag, quality. The token is referenced by env name only."],
          ["User", "A staff account: role, presence, token version (for sign-out everywhere)."],
          ["Customer", "A patient: phone (unique), demographics, departments, tags."],
          ["CustomerOptOut / OptOutSuppression", "Opt-outs per line, and opt-outs remembered by phone after a contact is deleted."],
          ["Conversation", "One patient on one line: status, owner, unread count, outcome, follow-up, waiting time."],
          ["Message", "One message: type, status, Meta id, campaign link, quoted message."],
          ["ConversationNote", "Staff-only notes on a chat."],
          ["ContactList / ListMember · Segment", "Hand-picked lists; rule-based audiences."],
          ["Template", "A WhatsApp template per business account: category, approval status, buttons, carousel."],
          ["Campaign / CampaignRecipient", "A send with approval, scheduling, lease and pause reason; one row per recipient."],
          ["Flow / FlowRun", "An automation graph; each patient's run through it, with answers."],
          ["BookingRequest / Booking", "Still in the database but unused this phase. Nothing reads or writes them."],
          ["KnowledgeArticle / KnowledgeChunk / AiReply", "Still in the database but unused this phase (the AI assistant comes later)."],
          ["AuditLog · AppSetting · WebhookEvent · MediaAsset", "History, workspace settings, saved Meta deliveries, the media library."],
        ]}
      />
    </>
  ),
};

const testing: DocPage = {
  key: "testing",
  label: "Testing & demo data",
  group: GROUP,
  icon: FlaskConical,
  description: "The check suite, demo data and these screenshots",
  keywords: "tests check scripts seed demo data playwright screenshots",
  visible: admin,
  body: () => (
    <>
      <H>The check suite (API)</H>
      <P>
        Plain Node scripts that drive the real handlers against a database, with Meta faked so nothing is sent. Each creates only its
        own tagged rows and deletes them afterwards. The campaign checks refuse to run while an API is listening on the same database.
      </P>
      <Table
        head={["Script", "Checks"]}
        rows={[
          [<Code key="s">check:roles</Code>, "Every guarded route enforces the right permission"],
          [<Code key="s">check:inbox</Code>, "Campaign-reply credit, reopening chats, replying claims, the 24-hour window"],
          [<Code key="s">check:webhooks</Code>, "Webhook durability and recovery, opt-out words, the error handler"],
          [<Code key="s">check:campaigns</Code>, "Each patient gets a campaign at most once, through crashes, restarts and two instances"],
          [<Code key="s">check:approval-settings</Code>, "Approval, quiet hours, campaign safety, quality holds"],
          [<Code key="s">check:supervision</Code>, "Waiting times, Supervision lists, outcomes, notes, supervisor limits"],
          [<Code key="s">check:segments</Code>, "Segment engine invariants (read-only)"],
          [<Code key="s">check:quiet-hours</Code>, "Quiet-hours maths (no database)"],
          [<><Code key="s">check:scoping</Code>, <Code key="t">check:segments:fixture</Code></>, "Need an empty Customer table (a fresh database)"],
        ]}
      />
      <Pre>{"cd everlast-whatsapp-crm-api\nnpm run check:roles   # …and the others above"}</Pre>
      <H>Demo data</H>
      <P>
        <Code>npm run seed:demo</Code> (API) creates a <b>Demo Clinic (docs)</b> line with made-up Meta ids, so nothing on it can reach a
        real phone. It also creates 16 patients on <Code>+999</Code> numbers, chats in every state, campaigns, lists,
        segments and these staff accounts (password <Code>DocsDemo@1234</Code>): <Code>docs_admin</Code>,{" "}
        <Code>docs_supervisor</Code>, <Code>docs_agent</Code>, <Code>docs_agent2</Code>, <Code>docs_marketing</Code>. Running it again
        replaces the data with a fresh copy. <Code>npm run seed:demo -- --remove</Code> deletes it all. It refuses to run with{" "}
        <Code>NODE_ENV=production</Code>.
      </P>
      <H>Refreshing these screenshots</H>
      <Steps
        items={[
          <>Seed the demo data, then start the API and the frontend.</>,
          <>In the frontend: <Code>npm run docs:screenshots</Code>. Playwright signs in as each demo account, switches to the demo line
            and saves every page to <Code>public/docs/screenshots/</Code>.</>,
          <>Commit the new images. First time on a machine: <Code>npx playwright install chromium</Code>.</>,
        ]}
      />
    </>
  ),
};

export const technicalPages: DocPage[] = [architecture, integrations, deployment, security, dataModel, testing];
