import { BookOpen, Sparkles } from "lucide-react";
import { rolesWith, type DocPage } from "../model";
import { Bullets, Callout, DocLink, H, Lead, P, Shot, Steps, Table, Ui, Who } from "../primitives";

const GROUP = "AI assistant";

const assistant: DocPage = {
  key: "ai-assistant",
  label: "How the AI assistant works",
  group: GROUP,
  icon: Sparkles,
  description: "When it answers, what it may say and when it hands over",
  keywords: "ai assistant bot auto reply handoff urgent medical symptoms arabic cloudflare",
  visible: (ctx) => ctx.can("knowledge:read"),
  body: (ctx) => (
    <>
      <Lead>
        When an admin switches it on for a line, the AI assistant answers simple questions from patients using only the{" "}
        <b>approved</b> articles in the <DocLink to="knowledge">knowledge base</DocLink>. Anything else goes to the team.
      </Lead>
      <H>When it answers</H>
      <P>All of these must be true:</P>
      <Bullets
        items={[
          <>It&apos;s switched on, and the line is ticked in its settings.</>,
          <>The patient sent plain text, and was the last to write.</>,
          <>The chat is <b>not assigned</b>, no flow is handling it, and the patient hasn&apos;t opted out.</>,
          <>No one on the team replied recently (24 hours by default), and the assistant hasn&apos;t already handed this chat over.</>,
        ]}
      />
      <Callout tone="tip">
        Once it hands a chat over, it stays silent until the chat is marked <b>Resolved</b>. Assigning the chat to yourself also keeps it
        quiet.
      </Callout>
      <H>What happens on each message</H>
      <Steps
        items={[
          <>It waits a few seconds (4 by default), so several quick messages get one answer. The patient sees &ldquo;typing…&rdquo;.</>,
          <><b>Symptom check</b>, before anything else. Urgent red flags (severe pain, heavy bleeding, fever, breathing trouble, an
            allergic reaction…) send the <b>urgent message</b> to the patient and a red alert to the team. Medical words (swelling,
            rash, bruising…) hand the chat over normally. Arabic is covered too.</>,
          <>It drafts a short answer (about 600 characters) in the patient&apos;s language, from approved sources only. It never
            diagnoses, prescribes or promises results, and quotes prices or doses only when an article states them.</>,
          <><b>Safety check</b>: if the draft is empty, too long, or mentions a price or dose that isn&apos;t in the sources, it&apos;s
            held back and the chat is handed over instead.</>,
        ]}
      />
      <H>Hand-overs</H>
      <P>
        On a hand-over, the patient gets the <b>hand-over message</b> and the team gets an alert with the reason and a one-line
        summary. The reasons are listed in <DocLink to="alerts">Hand-off alerts</DocLink>.
      </P>
      <P>
        The assistant&apos;s messages carry a violet <b>AI</b> label in the chat. If the AI service fails, nothing is sent and the
        message simply waits in the inbox.
      </P>
      {ctx.can("knowledge:write") && (
        <>
          <H>Testing it</H>
          <Shot name="assistant-tester" alt="The assistant tester" />
          <P>
            On the Knowledge base page, <Ui>Test the assistant</Ui> lets you ask what a patient might ask, in English or Arabic. Nothing
            is sent to anyone. It shows the outcome (Answered, Would hand over, Urgent), the reply the patient would get, a note for the
            team, anything the safety check held back, and the sources used. Limit: 15 questions a minute.
          </P>
        </>
      )}
      {ctx.can("settings:write") && (
        <P>To switch it on, choose its lines and edit its messages, see <DocLink to="ai-settings">AI settings</DocLink>.</P>
      )}
    </>
  ),
};

const knowledge: DocPage = {
  key: "knowledge",
  label: "Knowledge base",
  group: GROUP,
  icon: BookOpen,
  description: "The articles the AI assistant may answer from",
  keywords: "knowledge base article treatment approve draft archive aftercare faq searchable index",
  visible: (ctx) => ctx.can("knowledge:read"),
  body: (ctx) => (
    <>
      <Who roles={rolesWith("knowledge:read")} />
      <Lead>
        The knowledge base holds one article per treatment or topic. The AI assistant only uses <b>approved</b> articles. Everyone can
        read them, so it&apos;s also a quick reference for the team.
      </Lead>
      <Shot name="knowledge" alt="The knowledge base with an article open" />
      <H>An article&apos;s sections</H>
      <Table
        head={["Section", "Write"]}
        rows={[
          ["Overview", "What the treatment is and who it's for"],
          ["Before the treatment", "How to prepare"],
          ["After the treatment (aftercare)", "What to do and avoid afterwards"],
          ["Downtime / recovery", "How long until back to normal"],
          ["Not suitable for", "Who shouldn't have it. The assistant hands these patients to the team."],
          ["FAQ", "Common questions. Include prices only if the clinic wants them quoted."],
          ["Other information", "Anything else"],
        ]}
      />
      {ctx.can("knowledge:write") ? (
        <>
          <H>Writing and approving</H>
          <Steps
            items={[
              <>Click <Ui>New article</Ui>. Enter the <Ui>Treatment or topic</Ui> (required) and a category, and fill in at least one
                section.</>,
              <><Ui>Save draft</Ui>. Drafts are never used by the assistant.</>,
              <><Ui>Approve</Ui>: the assistant can use it straight away. After that, <Ui>Save changes</Ui> updates what patients are
                told immediately.</>,
              <>To withdraw it: <Ui>Move to draft</Ui>, <Ui>Archive</Ui> or <Ui>Delete</Ui>.</>,
            ]}
          />
          <P>
            Each article shows whether it&apos;s <b>Searchable</b>. &ldquo;Not searchable yet — indexing failed&rdquo; means saving
            again will retry. &ldquo;AI not configured&rdquo; means the Cloudflare settings are missing.
          </P>
        </>
      ) : (
        <Callout tone="note">An admin writes and approves articles. If something patients ask about is missing or wrong, tell an admin.</Callout>
      )}
    </>
  ),
};

export const aiPages: DocPage[] = [assistant, knowledge];
