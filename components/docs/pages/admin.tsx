import { Bot, MoonStar, Smartphone, Users } from "lucide-react";
import { rolesWith, type DocPage } from "../model";
import { Bullets, Callout, Code, DocLink, H, Lead, P, Shot, Steps, Table, Ui, Who } from "../primitives";

const GROUP = "Administration";

const users: DocPage = {
  key: "users",
  label: "Users",
  group: GROUP,
  icon: Users,
  description: "Create accounts, change roles, reset passwords, deactivate",
  keywords: "users team create account role reset password deactivate reactivate delete",
  visible: (ctx) => ctx.can("user:write"),
  body: () => (
    <>
      <Who roles={rolesWith("user:write")} />
      <Lead>Manage the team in <b>Settings → Users</b>.</Lead>
      <Shot name="settings-users" alt="Settings, Users" />
      <H>Adding someone</H>
      <Steps
        items={[
          <>Click <Ui>Create user</Ui>.</>,
          <>Enter a <Ui>Full name</Ui> (optional), a <Ui>Username</Ui> and a <Ui>Password</Ui> of at least 8 characters.</>,
          <>Pick a role: <b>Admin</b>, <b>Marketing</b>, <b>Supervisor</b> or <b>Agent</b>. See <DocLink to="roles">Roles & permissions</DocLink>.</>,
          <>Click create, then share the username and password with them privately.</>,
        ]}
      />
      <H>The ⋮ menu on each user</H>
      <Table
        head={["Action", "Notes"]}
        rows={[
          [<Ui key="e">Edit</Ui>, "Change name or role. You can't change your own role. Moving someone off the inbox (to Marketing) returns their open chats and requests to the queue and signs them out."],
          [<Ui key="r">Reset password</Ui>, "At least 8 characters. Signs them out everywhere."],
          [<Ui key="d">Deactivate…</Ui>, "For someone who left. Signs them out at once and hands over their open chats. Their history stays under their name. Reactivate reverses it."],
          [<Ui key="x">Delete</Ui>, "Only for accounts with no history. If they have chats or replies, delete is refused and you're offered Deactivate instead."],
        ]}
      />
      <P>
        Use the search box and the role pills to find people, and <Ui>Show deactivated</Ui> to include former staff. &ldquo;Pending&rdquo;
        under Last active means they haven&apos;t signed in yet.
      </P>
      <Callout tone="note">You can&apos;t deactivate or delete yourself. Keep at least two admins, so you&apos;re never locked out.</Callout>
    </>
  ),
};

const numbers: DocPage = {
  key: "whatsapp-numbers",
  label: "WhatsApp lines",
  group: GROUP,
  icon: Smartphone,
  description: "Add and manage the clinic's WhatsApp numbers",
  keywords: "whatsapp number line add phone number id waba token default send speed quality",
  visible: (ctx) => ctx.can("number:write"),
  body: () => (
    <>
      <Lead>
        Each WhatsApp number the clinic uses is a <b>line</b>. Manage lines in <b>Settings → WhatsApp numbers</b>. Access tokens never
        go into the database: each line points to a token kept in the server&apos;s environment.
      </Lead>
      <H>Adding a line</H>
      <Steps
        items={[
          <>A developer adds the access token to the server&apos;s environment as <Code>WHATSAPP_TOKEN_&lt;NAME&gt;</Code> (see{" "}
            <DocLink to="deployment">Deployment</DocLink>).</>,
          <>Click <Ui>Add number</Ui>. Enter a <Ui>Name</Ui>, the <Ui>Phone number ID</Ui> and the <Ui>WhatsApp Business Account ID</Ui>{" "}
            (both from Meta&apos;s WhatsApp Manager), pick the <Ui>Access token</Ui>, and set the <Ui>Send speed</Ui> (1–20 messages at
            once; 5 by default).</>,
          <>Click <Ui>Add number</Ui>. The details are checked with Meta (&ldquo;Checking with Meta…&rdquo;) before the line is saved.</>,
          <>In Meta&apos;s app settings, point the webhook at the API (see <DocLink to="integrations">Webhooks</DocLink>) and check the
            account is subscribed.</>,
        ]}
      />
      <H>Editing a line</H>
      <Bullets
        items={[
          <>Change the name, send speed or token. Use <b>Active</b> to switch a line off (it disappears from the inbox and can&apos;t
            send campaigns) and <b>Make default</b> to set the line people see first.</>,
          <>The default line can&apos;t be switched off. Switching off a line with running campaigns needs a second click on{" "}
            <Ui>Turn off and pause</Ui>.</>,
          <><Ui>Check quality now</Ui> asks Meta for every line&apos;s rating, which can pause campaigns if quality dropped.</>,
        ]}
      />
    </>
  ),
};

const workspace: DocPage = {
  key: "workspace-settings",
  label: "Quiet hours & safety",
  group: GROUP,
  icon: MoonStar,
  description: "Quiet hours, frequency cap, quality pause, test numbers",
  keywords: "quiet hours campaign safety frequency cap quality pause test numbers settings",
  visible: (ctx) => ctx.can("settings:write"),
  body: () => (
    <>
      <Lead>These settings apply to every campaign on every line.</Lead>
      <H>Quiet hours</H>
      <Shot name="settings-quiet-hours" alt="Settings, Quiet hours" />
      <Bullets
        items={[
          <><Ui>Quiet hours on</Ui>, with <Ui>Starts</Ui> and <Ui>Ends</Ui> (24-hour HH:MM) and a <Ui>Time zone</Ui>. A window that ends
            before it starts runs overnight. Until you save, the default is 21:00–09:00 Asia/Dubai.</>,
          <>Campaigns pause at the start and resume by themselves at the end. Scheduling inside the window is refused. Replies in the
            inbox are never affected.</>,
        ]}
      />
      <H>Campaign safety</H>
      <Table
        head={["Setting", "What it does", "Default"]}
        rows={[
          ["At most one campaign per patient every N days", "Patients who got any campaign within N days are skipped (0–90; 0 = off)", "0 (off)"],
          ["Pause campaigns when the number's quality drops", "Pauses running campaigns and blocks new ones on that line", "On, at YELLOW"],
          ["Test numbers", "The only phones campaign test-sends can go to (up to 20, with country code)", "None"],
        ]}
      />
      <Callout tone="tip">
        Add every staff member who checks campaigns as a test number before the first campaign. Save the test numbers with their own
        button (<Ui>Save test numbers</Ui>).
      </Callout>
    </>
  ),
};

const ai: DocPage = {
  key: "ai-settings",
  label: "AI settings",
  group: GROUP,
  icon: Bot,
  description: "Switch the assistant on, its messages, model and Cloudflare",
  keywords: "ai settings assistant on lines name messages handover urgent cloudflare token model embedding reindex temperature",
  visible: (ctx) => ctx.can("settings:write"),
  body: () => (
    <>
      <Lead>
        The assistant has two settings pages: <b>Settings → AI assistant</b> (what it does) and <b>Settings → AI model & Cloudflare</b>{" "}
        (the AI provider).
      </Lead>
      <Shot name="settings-ai-assistant" alt="Settings, AI assistant" />
      <H>AI assistant</H>
      <Table
        head={["Setting", "Notes"]}
        rows={[
          ["Assistant on", "Off by default"],
          ["Lines it answers on", "Tick each line"],
          ["Assistant's name", "Up to 60 characters; default “Everlast Assistant”"],
          ["Quiet after a team reply (hours)", "0–168, default 24. 0 means it only stays quiet while the chat is assigned."],
          ["Hand-over message (+ Arabic)", "Sent when it passes the patient to the team. Required."],
          ["Urgent message (+ Arabic)", "Sent on red-flag symptoms. Required; the default mentions calling 999."],
          ["Clinic note", "Optional extra context for the assistant"],
        ]}
      />
      <P>If an Arabic message is left empty, the English one is sent to everyone.</P>
      <H>AI model & Cloudflare</H>
      <Bullets
        items={[
          <><b>Account ID</b> and <b>API token</b> for Cloudflare Workers AI. A token saved here is encrypted, and only its last 4
            characters are shown. Saving one needs <Code>SETTINGS_ENCRYPTION_KEY</Code> on the server. Otherwise put{" "}
            <Code>CLOUDFLARE_AI_TOKEN</Code> in the environment.</>,
          <><b>Chat model</b> (default <Code>@cf/zai-org/glm-4.7-flash</Code>; it must support tools) and <b>Embedding model</b>{" "}
            (default <Code>@cf/baai/bge-m3</Code>; it must produce 1024-dimension vectors).</>,
          <>Changing the embedding model re-indexes the whole knowledge base. Until that finishes, the assistant finds nothing and hands
            every question over.</>,
          <>Behaviour: temperature 0.3, max reply 1,500 characters, wait 4 seconds before replying, 12 history messages, 6 search results
            at similarity 0.45, 45-second timeout. <Ui>Reset to defaults</Ui> restores them.</>,
          <><Ui>Test connection</Ui> tries the unsaved values. <Ui>Re-index knowledge base</Ui> rebuilds the search index.</>,
        ]}
      />
      <P>See <DocLink to="ai-assistant">How the AI assistant works</DocLink> for what these change in practice.</P>
    </>
  ),
};

export const adminPages: DocPage[] = [users, numbers, workspace, ai];
