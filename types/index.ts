export interface User {
  id: string;
  username: string;
  role: string;
  // Returned by POST /api/auth/login, so the first screen after login can be
  // chosen by what the user may actually do. Gate on this, never on `role`.
  permissions?: import("@/lib/permissions").Permission[];
}

export type Gender = "MALE" | "FEMALE";

export interface Customer {
  _id?: string;
  id?: number;
  chartNumber: string | null;
  name: string | null;
  phone: string;
  email: string | null;
  nationality: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  joinDate: string | null;
  departments: string[]; // ordered by rank: index 0 = top department
  tags: string[];
  notes: string | null;
  optedOut?: boolean;
  createdAt: string;
}

export interface Conversation {
  _id?: string;
  id?: string | number;
  customerId?: string | number;
  customer?: Customer;
  assignedAgentId: number | null;
  assignedAgent: { id: number; name?: string | null; username: string } | null;
  status: "OPEN" | "PENDING" | "RESOLVED";
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderType: "CUSTOMER" | "AGENT" | "BOT" | null;
  lastCustomerMessageAt?: string | null;
}

export interface QuotedMessage {
  id: number;
  content: string;
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "TEMPLATE" | "INTERACTIVE" | "STICKER";
  senderType: "CUSTOMER" | "AGENT" | "BOT";
  mediaUrl?: string | null;
  deletedAt?: string | null;
}

export interface Message {
  _id?: string;
  id?: string | number;
  conversationId: string;
  senderType: "CUSTOMER" | "AGENT" | "BOT";
  senderId: string | null;
  content: string;
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "TEMPLATE" | "INTERACTIVE" | "STICKER";
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | null;
  whatsappMessageId?: string | null;
  mediaUrl?: string | null;
  reactions?: Record<string, number> | null;
  quotedMessageId?: number | null;
  quotedMessage?: QuotedMessage | null;
  /** Set on an inbound message that answers a campaign — drives the "Reply to" tag. */
  campaignRecipientId?: number | null;
  campaignRecipient?: { campaign: { id: number; name: string } } | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AuditLog {
  id: number;
  action: string;
  actorId: number | null;
  actorUsername: string | null;
  targetType: string;
  targetId: number;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface LoginResponse {
  success: boolean;
  user: User;
}

export interface ConversationListResponse {
  success: boolean;
  data: Conversation[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface MessagesResponse {
  success: boolean;
  data: Message[];
}

export interface SendMessageResponse {
  success: boolean;
  data: {
    _id?: string;
    id: number;
    senderType: string;
    content: string;
    status: "SENT" | "FAILED";
    whatsappMessageId: string;
  };
}

export interface CustomerListResponse {
  success: boolean;
  data: Customer[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CustomerResponse {
  success: boolean;
  data: Customer;
}

export interface ContactList {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactListListResponse {
  success: boolean;
  data: ContactList[];
}

export interface ContactListResponse {
  success: boolean;
  data: ContactList;
}

export interface ContactListDetailResponse {
  success: boolean;
  data: ContactList & { members: (Customer & { addedAt: string })[] };
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AuditLogResponse {
  success: boolean;
  data: AuditLog[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export type UserStatus = "ONLINE" | "OFFLINE" | "ON_BREAK";

export interface StatsOverview {
  messages: { today: number; last7Days: number };
  conversations: { open: number; pending: number; resolved: number; unassigned: number; total: number };
  customers: { total: number; newLast7Days: number };
  agents: { online: number; onBreak: number; offline: number };
  unreadMessages: number;
  // Conversations with at least one unread message (the Inbox badge).
  unreadConversations: number;
}

export interface MessageChartDay {
  date: string;
  incoming: number;
  outgoing: number;
}

export interface AgentStat {
  id: string;
  name: string | null;
  username: string;
  status: string;
  lastActiveAt: string | null;
  assignedConversations: number;
  openConversations: number;
  messagesSentLast7Days: number;
  avgResponseTimeMinutes: number | null;
}

export interface StatsOverviewResponse {
  success: boolean;
  data: StatsOverview;
}

export interface StatsMessagesResponse {
  success: boolean;
  data: {
    chart: MessageChartDay[];
    typeBreakdown: Record<string, number>;
    statusBreakdown: Record<string, number>;
    peakHour: number | null;
  };
}

export interface StatsAgentsResponse {
  success: boolean;
  data: {
    agents: AgentStat[];
    statusSummary: { ONLINE: number; ON_BREAK: number; OFFLINE: number };
  };
}

export type TemplateStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type TemplateCategory = "GENERAL" | "RE_ENGAGEMENT" | "CAMPAIGN";
export type TemplateHeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type TemplateButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export interface TemplateButton {
  id: string;
  type: TemplateButtonType;
  title: string;
  url?: string;
  phoneNumber?: string;
}

export interface Template {
  id: number;
  name: string;
  metaTemplateName: string | null;
  metaTemplateId: string | null;
  category: TemplateCategory;
  approvalStatus: TemplateStatus;
  rejectionReason: string | null;
  // When Meta last approved/rejected it (null until it decides).
  statusChangedAt?: string | null;
  language: string;
  headerType: TemplateHeaderType;
  header: string | null;
  headerMediaUrl: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[] | null;
  // Present = a carousel template (2–10 cards); header/footer/buttons unused.
  cards?: TemplateCard[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateCardButton {
  id: string; // positional: b0, b1
  type: "QUICK_REPLY" | "URL";
  title: string;
  url?: string;
}

export interface TemplateCard {
  mediaType: "IMAGE" | "VIDEO";
  mediaUrl: string;
  body: string;
  buttons: TemplateCardButton[];
}

export interface TemplateListResponse {
  success: boolean;
  data: Template[];
}

export interface TemplateResponse {
  success: boolean;
  data: Template;
}

export type MediaAssetType = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";

export interface MediaAsset {
  id: number;
  url: string;
  publicId: string;
  mediaType: MediaAssetType;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  filename: string | null;
  createdAt: string;
  usageCount: number;
}

export interface MediaAssetListResponse {
  success: boolean;
  data: MediaAsset[];
}

export interface MediaAssetResponse {
  success: boolean;
  data: MediaAsset;
}

export type UserRole = "ADMIN" | "MARKETING" | "AGENT" | "SUPERVISOR";

export interface AgentUser {
  id: number;
  name: string | null;
  username: string;
  role: UserRole;
  /**
   * Capabilities this user holds, served by GET /api/users/me straight from the
   * server's permission map. Gate UI on this rather than on `role` — the role
   * list grows, and a check against one name silently excludes the others.
   * Optional because list endpoints return other users without it; only /me
   * carries it.
   */
  permissions?: import("@/lib/permissions").Permission[];
  status: UserStatus;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number; assignedConversations: number };
}

export interface UserListResponse {
  success: boolean;
  data: AgentUser[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface UserResponse {
  success: boolean;
  data: AgentUser;
}

export type CampaignStatus = "DRAFT" | "PENDING_APPROVAL" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type CampaignCategory = "PROMOTION" | "SEASONAL" | "EVENT" | "AWARENESS" | "FOLLOW_UP" | "ANNOUNCEMENT" | "OTHER";
export type CampaignPauseReason =
  | "MANUAL"
  | "QUIET_HOURS"
  | "NUMBER_INACTIVE"
  | "SEND_ERROR"
  // Meta's throughput limit / no answer from Meta: resumed automatically at resumeAt.
  | "RATE_LIMIT"
  | "CONNECTION"
  // Template deleted, or paused/disabled by Meta. Needs a person.
  | "TEMPLATE_UNAVAILABLE"
  // The number's Meta quality rating dropped (Settings → Campaign safety).
  | "QUALITY";
export type CampaignRecipientStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "SKIPPED";

export interface Campaign {
  id: number;
  name: string;
  templateId: number;
  template?: Pick<Template, "id" | "name" | "category" | "body" | "header" | "footer" | "buttons">;
  category: CampaignCategory;
  status: CampaignStatus;
  pauseReason?: CampaignPauseReason | null;
  // Why it paused, e.g. Meta's error for SEND_ERROR.
  pauseDetail?: string | null;
  // When an automatic pause (RATE_LIMIT / CONNECTION) resumes by itself.
  resumeAt?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  sentCount: number;
  failedCount: number;
  // Opted out, or over the per-patient campaign limit, when their turn came.
  skippedCount?: number;
  totalRecipients: number;
  deliveredCount?: number;
  readCount?: number;
  repliedCount?: number;
  // Appointments booked from this campaign's booking requests.
  bookedCount?: number;
  bookingRequestsCount?: number;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  // Approval trail: marketing submits, an admin approves (sends / schedules)
  // or rejects with a reason (back to DRAFT, reason kept until resubmitted).
  submittedById?: number | null;
  submittedBy?: { id: number; name: string | null; username: string } | null;
  submittedAt?: string | null;
  reviewedById?: number | null;
  reviewedBy?: { id: number; name: string | null; username: string } | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  recipients?: CampaignRecipient[];
  // The automation answering this campaign's template buttons.
  flowId?: number | null;
  flow?: { id: number; name: string; isActive: boolean } | null;
}

export interface CampaignRecipient {
  id: number;
  campaignId: number;
  customerId: number;
  customer?: Pick<Customer, "id" | "name" | "phone" | "tags">;
  status: CampaignRecipientStatus;
  messageId?: number | null;
  error?: string | null;
  sentAt?: string | null;
}

export interface CampaignListResponse {
  success: boolean;
  data: Campaign[];
}

export interface CampaignResponse {
  success: boolean;
  data: Campaign;
}

export type WhatsAppQualityRating = "GREEN" | "YELLOW" | "RED" | "NA" | "UNKNOWN";
export type WhatsAppPhoneNumberStatus = "CONNECTED" | "FLAGGED" | "RESTRICTED" | "BANNED" | "UNKNOWN" | string;

export interface WhatsAppPhoneStatus {
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  qualityRating: WhatsAppQualityRating;
  status: WhatsAppPhoneNumberStatus;
  nameStatus: string | null;
  codeVerificationStatus: string | null;
  throughputLevel: string | null;
  messagingLimitTier: string | null;
  fetchedAt: string;
}

export interface WhatsAppPhoneStatusResponse {
  success: boolean;
  data: WhatsAppPhoneStatus;
}

export interface WhatsAppPhoneNumberSummary {
  id: string;
  verifiedName: string | null;
  displayPhoneNumber: string | null;
  qualityRating: WhatsAppQualityRating;
  status: WhatsAppPhoneNumberStatus;
  nameStatus: string | null;
  codeVerificationStatus: string | null;
  throughputLevel: string | null;
  isPrimary: boolean;
}

export interface WhatsAppNumbersListResponse {
  success: boolean;
  data: WhatsAppPhoneNumberSummary[];
  fetchedAt: string;
}

// ── Segments ────────────────────────────────────────────────────────────────
// A saved audience RULE. Unlike a ContactList — whose membership is frozen the
// moment it is built — a segment is re-evaluated every time it is used, so it
// always describes who qualifies *now*.
//
// The rule grammar is owned by the server (utils/segmentFilter.js) and served
// by GET /api/segments/fields, so the builder never hardcodes it.

export type SegmentMatch = "ALL" | "ANY";

export type SegmentField =
  | "name" | "phone" | "email" | "chartNumber"
  | "nationality" | "gender" | "department" | "tag"
  | "joinDate" | "createdAt" | "age" | "birthdayMonth"
  | "optedOut" | "hasConversation" | "lastInboundAt" | "lastCampaignAt" | "list";

export type SegmentOp =
  | "eq" | "in" | "not_in" | "contains" | "starts_with" | "exists"
  | "has_any" | "has_all" | "has_none" | "is_empty"
  | "before" | "after" | "between"
  | "gte" | "lte"
  | "in_last_days" | "older_than_days" | "never";

export type SegmentRuleValue = string | number | boolean | (string | number)[];

export interface SegmentRule {
  field: SegmentField;
  op: SegmentOp;
  value: SegmentRuleValue;
}

export interface SegmentDefinition {
  match: SegmentMatch;
  rules: SegmentRule[];
}

export interface Segment {
  id: number;
  name: string;
  description: string | null;
  definition: SegmentDefinition;
  excludeOptedOut: boolean;
  createdById: number | null;
  createdBy?: { id: number; name: string | null; username: string } | null;
  createdAt: string;
  updatedAt: string;
  /** Live count, recomputed per request — null when the rule no longer compiles. */
  reachable?: number | null;
  matched?: number;
  suppressed?: number;
  sample?: SegmentSampleContact[];
  campaignCount?: number;
  error?: string | null;
}

/** The trimmed contact shape a preview returns — enough to eyeball, not a full record. */
export interface SegmentSampleContact {
  id: number;
  name: string | null;
  phone: string;
  gender: Gender | null;
  nationality: string | null;
  departments: string[];
  tags: string[];
  joinDate: string | null;
  optedOut: boolean;
}

export interface SegmentPreview {
  /** Contacts matching the rules alone. */
  matched: number;
  /** Contacts actually messageable — matched minus opt-outs. */
  reachable: number;
  suppressed: number;
  excludeOptedOut: boolean;
  sample: SegmentSampleContact[];
  ruleCount: number;
}

/** Field catalogue from the server, so operator menus stay in sync with the compiler. */
export interface SegmentFieldSpec {
  field: SegmentField;
  label: string;
  ops: SegmentOp[];
}

/** Real distinct values behind the free-text columns, so users pick instead of typing. */
export interface SegmentOptions {
  departments: string[];
  tags: string[];
  nationalities: string[];
  lists: { id: number; name: string; memberCount: number }[];
}

export interface SegmentListResponse {
  success: boolean;
  data: Segment[];
}
export interface SegmentResponse {
  success: boolean;
  data: Segment;
}
export interface SegmentPreviewResponse {
  success: boolean;
  data: SegmentPreview;
}
export interface SegmentFieldsResponse {
  success: boolean;
  data: SegmentFieldSpec[];
}
export interface SegmentOptionsResponse {
  success: boolean;
  data: SegmentOptions;
}
export interface SegmentMemberIdsResponse {
  success: boolean;
  data: { id: number; name: string; customerIds: number[]; count: number };
}
export interface CustomerIdsResponse {
  success: boolean;
  data: { customerIds: number[]; count: number };
}

// A WhatsApp number as this app has it configured, from /api/whatsapp/my-numbers.
// Distinct from WhatsAppPhoneNumberSummary, which is what Meta reports live:
// `id` here is this app's internal row id (what X-WhatsApp-Number-Id carries),
// NOT Meta's phone_number_id. Conflating the two is a nasty class of bug.
export interface ConfiguredWhatsAppNumber {
  id: number;
  label: string;
  phoneNumberId: string;
  wabaId: string;
  // The WhatsApp account's name as it appears in WhatsApp Manager, fetched from
  // Meta. Null when Meta couldn't be reached — fall back to a label built from
  // wabaId rather than rendering nothing.
  accountName: string | null;
  displayPhoneNumber: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface ConfiguredNumbersResponse {
  success: boolean;
  data: ConfiguredWhatsAppNumber[];
  activeNumberId: number | null;
}

// ── Inbox workflow ────────────────────────────────────────────────────────────

/** The inbox's server-side work queues. See getAllConversations on the API. */
export type ConversationView = "all" | "mine" | "unassigned" | "campaign_replies";

export interface ConversationCounts {
  mine: number;
  unassigned: number;
  campaign_replies: number;
}

/** Someone a conversation can be given to: active, and a role that can reply. */
export interface AssignableUser {
  id: number;
  name: string | null;
  username: string;
  status: "ONLINE" | "OFFLINE" | "ON_BREAK";
}

/** One row of a campaign's Replies worklist. */
export interface CampaignReply {
  recipientId: number;
  repliedAt: string;
  customer: { id: number; name: string | null; phone: string };
  reply: { id: number; content: string; messageType: string; createdAt: string } | null;
  conversation: {
    id: number;
    status: "OPEN" | "PENDING" | "RESOLVED";
    assignedAgent: { id: number; name: string | null; username: string } | null;
  } | null;
  /** The patient spoke last and the chat isn't resolved. */
  needsResponse: boolean;
}

// ─── Flows (campaign automations) ────────────────────────────────────────────
// Mirrors everlast-nodejs-crm-api/utils/flowGraph.js, which validates on save.

export type FlowNodeType = "trigger" | "message" | "list" | "carousel" | "cards" | "question" | "tag" | "assign" | "end";
export type FlowMediaType = "NONE" | "IMAGE" | "VIDEO" | "DOCUMENT";
export type FlowInputType = "text" | "number" | "email" | "phone" | "date";

export interface FlowOption { id: string; title: string; description?: string }

/** A card in a Cards step (or a carousel template snapshot, which has only label + buttons). */
export interface FlowCard {
  id?: string;
  label?: string;
  mediaType?: "IMAGE" | "VIDEO";
  mediaUrl?: string;
  body?: string;
  buttons: { id: string; title: string; type?: "QUICK_REPLY" | "URL"; url?: string }[];
}

export interface FlowNodeData {
  // trigger: the template its buttons were copied from
  templateId?: number | null;
  // trigger / message
  buttons?: FlowOption[];
  // message
  mediaType?: FlowMediaType;
  mediaUrl?: string;
  // message / list / question / assign / end
  text?: string;
  footer?: string;
  // list
  header?: string;
  buttonLabel?: string;
  rows?: FlowOption[];
  // question / message with buttons / list: the field the answer is saved in
  variable?: string;
  inputType?: FlowInputType;
  errorText?: string;
  // carousel: snapshot of the template's cards (label + quick replies).
  // cards: the product cards themselves (id, media, text, buttons).
  cards?: FlowCard[];
  // tag
  tag?: string;
  // assign
  agentId?: number | null;
  [key: string]: unknown;
}

export interface FlowNode { id: string; type: FlowNodeType; position: { x: number; y: number }; data: FlowNodeData }
export interface FlowEdge { id: string; source: string; sourceHandle: string; target: string }
export interface FlowGraph { nodes: FlowNode[]; edges: FlowEdge[] }

export type FlowRunStatus = "ACTIVE" | "COMPLETED" | "HANDED_OFF" | "STOPPED" | "EXPIRED" | "FAILED";
export type FlowRunStats = { total: number } & Partial<Record<FlowRunStatus, number>>;

export interface FlowSummary {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: number; name: string | null; username: string };
  campaignCount: number;
  runs: FlowRunStats;
}

export interface Flow extends Omit<FlowSummary, "campaignCount"> {
  graph: FlowGraph;
  variables: string[];
  campaigns?: { id: number; name: string; status: CampaignStatus }[];
}

export interface FlowRun {
  id: number;
  flowId: number;
  conversationId: number;
  status: FlowRunStatus;
  currentNodeId: string | null;
  data: {
    answers?: Record<string, string>;
    path?: { node: string; choice?: string; answer?: string; tag?: string; handedOffTo?: string; at: string }[];
  };
  lastError: string | null;
  startedAt: string;
  completedAt: string | null;
  customer: { id: number; name: string | null; phone: string };
  campaign: { id: number; name: string } | null;
}

export interface FlowValidationError { nodeId?: string; message: string }

// ─── Contact panel (GET /api/conversations/:id/profile) ──────────────────────
export interface ConversationProfile {
  customer: Customer & { id: number };
  conversation: {
    id: number;
    status: string;
    createdAt: string;
    lastCustomerMessageAt: string | null;
    assignedAgent: { id: number; name: string | null; username: string } | null;
    messageCount: number;
  };
  optOut: { optedOutAt: string; source: string } | null;
  responses: {
    id: number;
    flow: { id: number; name: string };
    status: FlowRunStatus;
    startedAt: string;
    completedAt: string | null;
    answers: Record<string, string>;
  }[];
  media: { id: number; messageType: "IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO"; mediaUrl: string | null; content: string; senderType: string; createdAt: string }[];
  mediaCounts: Partial<Record<"IMAGE" | "VIDEO" | "DOCUMENT" | "AUDIO", number>>;
  links: { messageId: number; url: string; senderType: string; createdAt: string }[];
  campaigns: { id: number; name: string; sentAt: string | null; repliedAt: string | null }[];
}

// ── Campaign approval ─────────────────────────────────────────────────────

export interface PendingApproval {
  id: number;
  name: string;
  whatsappNumberId: number;
  whatsappNumber: { label: string };
  totalRecipients: number;
  scheduledAt: string | null;
  submittedAt: string | null;
  submittedBy: { id: number; name: string | null; username: string } | null;
  template: { id: number; name: string };
}

// Meta's daily limit on different people a number may message (the
// OVER_MESSAGING_LIMIT error's `details` has this shape too).
export interface CampaignCapacity {
  tier: string | null;
  limit: number | null;
  unlimited: boolean;
  usedLast24h: number;
  needed: number;
  remaining: number | null;
  overLimit: boolean;
}

// ── Settings (admin) ──────────────────────────────────────────────────────

export interface QuietHoursSetting {
  enabled: boolean;
  start: string; // "21:00"
  end: string; // "09:00"
  timezone: string; // "Asia/Dubai"
  // "server" until an admin saves it in Settings.
  source?: "settings" | "server";
}

export interface CampaignSafetySetting {
  // 0 = off. Otherwise one campaign per patient per number every N days.
  frequencyCapDays: number;
  // Pause campaigns and hold new ones when the number's quality drops.
  qualityAutoPause: boolean;
  qualityPauseAt: "YELLOW" | "RED";
}

export interface WorkspaceSettings {
  quietHours: QuietHoursSetting;
  campaignSafety: CampaignSafetySetting;
}

export interface AdminWhatsAppNumber {
  id: number;
  label: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string | null;
  tokenEnvKey: string;
  hasToken: boolean;
  isActive: boolean;
  isDefault: boolean;
  sendConcurrency: number;
  qualityRating: string | null;
  metaStatus: string | null;
  qualityCheckedAt: string | null;
  createdAt: string;
  activeCampaigns?: number;
}

// ── Chat outcomes, bookings, notes ────────────────────────────────────────

export type ConversationOutcome = "BOOKED" | "NOT_INTERESTED" | "FOLLOW_UP" | "NO_ANSWER";

export interface PersonRef {
  id: number;
  name: string | null;
  username: string;
}

export interface Booking {
  id: number;
  conversationId: number;
  customerId: number;
  whatsappNumberId: number;
  appointmentAt: string;
  service: string | null;
  doctor?: string | null;
  // The appointment's reference in Dok32, if the agent noted it.
  dok32Ref?: string | null;
  note: string | null;
  // The booking request it came from, and the campaign it's credited to
  // (proven or agent-confirmed only).
  requestId?: number | null;
  campaignId?: number | null;
  leadSource?: LeadSource | null;
  status: "BOOKED" | "CANCELLED";
  cancelledAt: string | null;
  createdAt: string;
  createdBy?: PersonRef | null;
}

// ── Booking requests ──────────────────────────────────────────────────────

export type BookingRequestStatus = "NEW" | "IN_PROGRESS" | "BOOKED" | "NOT_BOOKED";

// Where a patient came from. CAMPAIGN needs a campaign; OTHER needs a note.
export type LeadSource = "CAMPAIGN" | "INSTAGRAM" | "GOOGLE" | "REFERRAL" | "WALK_IN" | "RETURNING" | "OTHER";
// AUTOMATIC = proven (came through the campaign's flow / replied to its
// message); SUGGESTED = a campaign reached them lately, no proof — the agent
// must confirm; CONFIRMED = an agent chose it. null = nothing known.
export type LeadSourceStatus = "AUTOMATIC" | "SUGGESTED" | "CONFIRMED";

// What "where did this patient come from" sends.
export interface LeadSourceInput {
  leadSource: LeadSource;
  campaignId?: number;
  note?: string;
}

export interface BookingSourceOptions {
  leadSources: { value: LeadSource; label: string }[];
  // This line's campaigns from the last 90 days.
  campaigns: { id: number; name: string; startedAt: string | null }[];
}
export type NotBookedReason = "NO_ANSWER" | "NOT_INTERESTED" | "PRICE" | "CALL_BACK_LATER" | "BOOKED_ELSEWHERE" | "OTHER";

// One appointment as the agent enters it when booking (service, date, time
// required; the rest optional).
export interface AppointmentInput {
  service: string;
  appointmentAt: string; // ISO
  doctor?: string;
  dok32Ref?: string;
  note?: string;
}

// "This patient wants to book" — from the booking flow (FLOW) or an agent (AGENT).
export interface BookingRequest {
  id: number;
  conversationId: number;
  customerId: number;
  whatsappNumberId: number;
  source: "FLOW" | "AGENT";
  // Credited campaign (proven or confirmed) — what campaign results count.
  campaignId: number | null;
  campaign?: { id: number; name: string } | null;
  // A campaign that reached them lately, with no proof (needs confirming).
  suggestedCampaignId?: number | null;
  suggestedCampaign?: { id: number; name: string } | null;
  leadSource?: LeadSource | null;
  sourceStatus?: LeadSourceStatus | null;
  sourceNote?: string | null;
  sourceConfirmedAt?: string | null;
  flowRunId: number | null;
  // What the patient asked for, as collected: { service, preferred_date, contact_number, … }.
  requested: Record<string, unknown>;
  note: string | null;
  status: BookingRequestStatus;
  claimedById: number | null;
  claimedBy?: PersonRef | null;
  claimedAt: string | null;
  handledById: number | null;
  handledBy?: PersonRef | null;
  handledAt: string | null;
  notBookedReason: NotBookedReason | null;
  notBookedNote: string | null;
  createdAt: string;
  updatedAt: string;
  bookings: Booking[];
  customer?: { id: number; name: string | null; phone: string };
  conversation?: {
    id: number;
    status: "OPEN" | "PENDING" | "RESOLVED";
    lastMessage: string | null;
    lastMessageAt: string | null;
    lastSenderType: "CUSTOMER" | "AGENT" | "BOT" | null;
    awaitingReplySince: string | null;
    assignedAgent: PersonRef | null;
  };
  // Working minutes it has been open (null once closed).
  openMinutes?: number | null;
}

export interface BookingRequestCounts {
  new: number;
  inProgress: number;
  open: number;
  mine: number;
  bookedToday: number;
}

export interface ConversationNote {
  id: number;
  conversationId: number;
  body: string;
  createdAt: string;
  author: PersonRef | null;
}

// What PUT /conversations/:id/outcome returns.
export interface ConversationOutcomeState {
  id: number;
  outcome: ConversationOutcome | null;
  outcomeAt: string | null;
  outcomeBy: PersonRef | null;
  followUpAt: string | null;
  bookings: Booking[];
}

// ── Supervision ───────────────────────────────────────────────────────────

export interface SupervisionAgent {
  id: number;
  name: string | null;
  username: string;
  role: UserRole;
  status: "ONLINE" | "OFFLINE" | "ON_BREAK";
  lastActiveAt: string | null;
  openChats: number;
  waiting: number;
  waitingOverSla: number;
  repliesToday: number;
  // Their latest reply today (null if none yet).
  lastReplyAt: string | null;
  avgResponseMinutes: number | null;
  bookedToday: number;
}

export interface SupervisionOverview {
  slaMinutes: number;
  generatedAt: string;
  kpis: {
    waiting: number;
    waitingOverSla: number;
    unassignedWaiting: number;
    // Patients waiting more than a day (the "Gone cold" tab).
    goneCold: number;
    longestWaitMinutes: number;
    bookedToday: number;
    bookingRequestsOpen: number;
    bookingRequestsNew: number;
    bookingRequestsOverSla: number;
    droppedHalfwayToday: number;
    flowsStartedToday: number;
    followUpsDue: number;
    avgFirstResponseMinutes: number | null;
    unansweredToday: number;
  };
  agents: SupervisionAgent[];
}

// Flow progress for a chat. STALLED = still "active" but idle over an hour.
export interface SupervisionFlowState {
  id: number;
  flowName: string | null;
  status: "ACTIVE" | "COMPLETED" | "HANDED_OFF" | "STOPPED" | "EXPIRED" | "FAILED" | "STALLED";
  droppedHalfway: boolean;
  bookingRequested: boolean;
  answers: Record<string, unknown>;
  startedAt: string;
  updatedAt: string;
}

// waiting = started waiting in the last 24h; cold = waiting longer than that.
export type SupervisionFilter = "waiting" | "cold" | "booking" | "halfway" | "follow_up" | "booked" | "all";

// The same patient's chat on another line (the list shows one row per patient).
export interface SupervisionOtherChat {
  id: number;
  whatsappNumber: { id: number; label: string };
  status?: "OPEN" | "PENDING" | "RESOLVED";
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderType: "CUSTOMER" | "AGENT" | "BOT" | null;
  waitingMinutes: number | null;
  overSla: boolean;
  outcome: ConversationOutcome | null;
  assignedAgent: PersonRef | null;
}

export interface SupervisionConversation {
  id: number;
  customer: { id: number; name: string | null; phone: string };
  whatsappNumber: { id: number; label: string };
  assignedAgent: PersonRef | null;
  status: "OPEN" | "PENDING" | "RESOLVED";
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderType: "CUSTOMER" | "AGENT" | "BOT" | null;
  lastAgentReplyAt: string | null;
  awaitingReplySince: string | null;
  // Working minutes (outside quiet hours) the patient has been waiting.
  waitingMinutes: number | null;
  overSla: boolean;
  outcome: ConversationOutcome | null;
  outcomeAt: string | null;
  outcomeBy: PersonRef | null;
  followUpAt: string | null;
  followUpOverdue: boolean;
  flow: SupervisionFlowState | null;
  latestBooking: Booking | null;
  // The chat's open booking request, if any.
  openRequest: BookingRequest | null;
  noteCount: number;
  // This patient's other chats that match the same tab (other lines).
  otherChats: SupervisionOtherChat[];
}

export interface SupervisionTimeline {
  id: number;
  customer: { id: number; name: string | null; phone: string; tags: string[]; optedOut: boolean };
  whatsappNumber: { id: number; label: string };
  whatsappNumberId: number;
  assignedAgent: PersonRef | null;
  status: "OPEN" | "PENDING" | "RESOLVED";
  outcome: ConversationOutcome | null;
  outcomeAt: string | null;
  outcomeBy: PersonRef | null;
  followUpAt: string | null;
  awaitingReplySince: string | null;
  lastAgentReplyAt: string | null;
  waitingMinutes: number | null;
  overSla: boolean;
  slaMinutes: number;
  bookings: Booking[];
  bookingRequests: BookingRequest[];
  notes: ConversationNote[];
  flowRuns: SupervisionFlowState[];
  messages: {
    id: number;
    senderType: "CUSTOMER" | "AGENT" | "BOT";
    content: string;
    messageType: string;
    mediaUrl: string | null;
    status: string | null;
    createdAt: string;
    sender: PersonRef | null;
  }[];
  // This patient's chats on other lines.
  otherChats: SupervisionOtherChat[];
  // Each time the patient waited, and how long the reply took (working minutes).
  waits: { askedAt: string; repliedAt: string | null; repliedBy: string | null; minutes: number; stillWaiting: boolean }[];
  // Assignment / status / outcome changes, newest first.
  history: { action: string; actorUsername: string | null; details: Record<string, unknown> | null; createdAt: string }[];
}

// One line of the live dashboard feed. type is "patient_message",
// "agent_message", or an event: conversation.assigned / claimed /
// status_changed / outcome_set / booking_cancelled, flow.handed_off,
// booking_request.created / booked / not_booked. details is the event's data
// (e.g. { agentUsername, previousAgentUsername }, { outcome }, { status }).
export interface SupervisionActivity {
  id: string;
  type: string;
  at: string;
  actor: PersonRef | null;
  conversationId: number;
  customer: { id: number; name: string | null; phone: string };
  line: { id: number; label: string };
  text: string | null;
  details: Record<string, unknown> | null;
}

// ── Supervisor report (PDF) ───────────────────────────────────────────────

export interface SupervisionReport {
  period: { from: string; to: string; fromDay: string; toDay: string; timezone: string };
  line: { id: number; label: string | null } | null;
  generatedAt: string;
  slaMinutes: number;
  summary: {
    chats: number;
    patientsWrote: number;
    patientMessages: number;
    staffReplies: number;
    firstResponses: number;
    avgFirstResponseMinutes: number | null;
    withinSlaPercent: number | null;
    lateResponses: number;
    unanswered: number;
    bookingRequests: number;
    bookingRequestsBySource: Partial<Record<"FLOW" | "AGENT", number>>;
    requestsBooked: number;
    requestsNotBooked: number;
    requestsStillOpen: number;
    notBookedReasons: Partial<Record<NotBookedReason, number>>;
    appointmentsBooked: number;
    appointmentsCancelled: number;
    // Booked appointments by where the patient came from (UNKNOWN = not set).
    bookingsByLeadSource: Record<string, number>;
    // Outcome changes made in the period: BOOKED / NOT_INTERESTED / FOLLOW_UP / NO_ANSWER / CLEARED.
    outcomes: Record<string, number>;
  };
  agents: {
    id: number;
    name: string | null;
    username: string;
    role: UserRole;
    isActive: boolean;
    chats: number;
    replies: number;
    firstResponses: number;
    avgResponseMinutes: number | null;
    lateResponses: number;
    appointmentsBooked: number;
    requestsBooked: number;
    requestsNotBooked: number;
    outcomesSet: number;
  }[];
  bookings: {
    id: number;
    customer: { id: number; name: string | null; phone: string };
    service: string | null;
    appointmentAt: string;
    doctor: string | null;
    dok32Ref: string | null;
    note: string | null;
    status: "BOOKED" | "CANCELLED";
    bookedBy: PersonRef | null;
    bookedAt: string;
    campaign: string | null;
    leadSource: LeadSource | null;
    conversationId: number;
  }[];
  campaigns: {
    id: number;
    name: string;
    line: string | null;
    status: CampaignStatus;
    startedAt: string | null;
    recipients: number;
    sent: number;
    failed: number;
    replied: number;
    bookingRequests: number;
    booked: number;
  }[];
  // Every chat with a message in the period.
  chats: {
    id: number;
    customer: { id: number; name: string | null; phone: string };
    line: string | null;
    assignedAgent: PersonRef | null;
    status: "OPEN" | "PENDING" | "RESOLVED";
    outcome: ConversationOutcome | null;
    request: { status: BookingRequestStatus; notBookedReason: NotBookedReason | null } | null;
    messages: number;
    patientMessages: number;
    avgResponseMinutes: number | null;
    lateResponses: number;
    unanswered: boolean;
    lastMessageAt: string | null;
  }[];
  chatsTruncated: boolean;
}

export interface ReportTranscript {
  id: number;
  customer: { name: string | null; phone: string };
  line: string | null;
  assignedAgent: PersonRef | null;
  truncated: boolean;
  messages: { id: number; from: "patient" | "agent" | "bot" | "campaign"; sender: string | null; text: string; at: string }[];
}

// ── Detailed supervisor reports (/api/supervision/reports/*) ──────────────
// All take from/to (YYYY-MM-DD, clinic time zone, both days included, max 92
// days) and an optional numberId. People are plain display names here.

export interface DetailedReportMeta {
  period: { from: string; to: string; fromDay: string; toDay: string; timezone: string };
  numberId: number | null;
  generatedAt: string;
  slaMinutes: number;
}

/** Response-time bands, in working minutes. */
export type ResponseBandKey = "under5" | "5to15" | "15to30" | "30to60" | "over60";
export type ResponseBands = Record<ResponseBandKey, number>;

export interface BookingsReportAppointment {
  id: number;
  service: string | null;
  appointmentAt: string;
  doctor: string | null;
  dok32Ref: string | null;
  note: string | null;
  status: "BOOKED" | "CANCELLED";
  bookedBy: string | null;
  bookedAt: string;
}

export interface BookingsReportRequest {
  id: number;
  conversationId: number | null;
  createdAt: string;
  customer: { id: number; name: string | null; phone: string };
  line: string | null;
  openedVia: "FLOW" | "AGENT";
  /** The raw answers collected: { service, preferred_date, … }. */
  requested: Record<string, unknown> | null;
  note: string | null;
  leadSource: string | null;
  /** AUTOMATIC | SUGGESTED | CONFIRMED | null. */
  sourceStatus: string | null;
  campaign: string | null;
  suggestedCampaign: string | null;
  status: BookingRequestStatus;
  claimedBy: string | null;
  claimedAt: string | null;
  handledBy: string | null;
  handledAt: string | null;
  minutesToPickUp: number | null;
  minutesToClose: number | null;
  notBookedReason: string | null;
  notBookedNote: string | null;
  appointmentsBooked: number;
  appointmentsCancelled: number;
  appointments: BookingsReportAppointment[];
}

export interface BookingsReport extends DetailedReportMeta {
  summary: {
    requests: number;
    byStatus: Partial<Record<BookingRequestStatus, number>>;
    byOpenedVia: Partial<Record<"FLOW" | "AGENT", number>>;
    /** Lead source keys plus SUGGESTED (a guess, not confirmed) and UNKNOWN. */
    byLeadSource: Record<string, number>;
    notBookedReasons: Record<string, number>;
    appointmentsBooked: number;
    appointmentsCancelled: number;
    patientsBooked: number;
    /** Booked ÷ closed (booked + couldn't book), in %. */
    bookingRate: number | null;
    avgMinutesToPickUp: number | null;
    avgMinutesToClose: number | null;
  };
  /** By the person who closed the request. */
  byAgent: { agent: string; booked: number; notBooked: number; appointments: number; avgMinutesToClose: number | null }[];
  requests: BookingsReportRequest[];
}

export interface TeamReportAgent {
  id: number;
  name: string | null;
  username: string;
  role: UserRole;
  isActive: boolean;
  activeDays: number;
  chatsHandled: number;
  replies: number;
  firstResponses: number;
  avgResponseMinutes: number | null;
  medianResponseMinutes: number | null;
  p90ResponseMinutes: number | null;
  withinSlaPercent: number | null;
  lateResponses: number;
  responseBands: ResponseBands;
  /** Outcomes set: BOOKED / NOT_INTERESTED / FOLLOW_UP / NO_ANSWER / CLEARED. */
  outcomes: Record<string, number>;
  notesWritten: number;
  requestsTaken: number;
  requestsBooked: number;
  requestsNotBooked: number;
  appointmentsBooked: number;
  patientsBooked: number;
  openChatsNow: number;
}

export interface TeamReport extends DetailedReportMeta {
  team: {
    chats: number;
    patientMessages: number;
    staffReplies: number;
    firstResponses: number;
    avgResponseMinutes: number | null;
    medianResponseMinutes: number | null;
    p90ResponseMinutes: number | null;
    withinSlaPercent: number | null;
    lateResponses: number;
    unanswered: number;
    responseBands: ResponseBands;
    appointmentsBooked: number;
  };
  agents: TeamReportAgent[];
  daily: {
    day: string;
    patientMessages: number;
    chats: number;
    staffReplies: number;
    avgFirstResponseMinutes: number | null;
    lateResponses: number;
    unanswered: number;
    appointmentsBooked: number;
  }[];
  /** 24 entries, clinic time. */
  hourly: { hour: number; patientMessages: number; staffReplies: number }[];
}

export interface CampaignsReportCampaign {
  id: number;
  name: string;
  line: string | null;
  template: string | null;
  category: string | null;
  status: CampaignStatus;
  createdBy: string | null;
  approvedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
  delivered: number;
  read: number;
  replied: number;
  bookingRequests: number;
  /** Requests where this campaign is only a suggestion (not confirmed). */
  suggestedRequests: number;
  requestsBooked: number;
  requestsNotBooked: number;
  requestsOpen: number;
  notBookedReasons: Record<string, number>;
  patientsBooked: number;
  appointmentsBooked: number;
  /** Booked appointments by service ("—" = not recorded). */
  services: Record<string, number>;
  optOuts: number;
  /** Percentages of sent (bookedOfReplied: of replied), one decimal; null when the base is 0. */
  rates: {
    delivered: number | null;
    read: number | null;
    replied: number | null;
    booked: number | null;
    bookedOfReplied: number | null;
    optOut: number | null;
  };
}

export interface CampaignsReport extends DetailedReportMeta {
  totals: {
    campaigns: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    bookingRequests: number;
    patientsBooked: number;
    appointmentsBooked: number;
    optOuts: number;
  } | null;
  campaigns: CampaignsReportCampaign[];
}

export interface ChatsReportChat {
  id: number;
  patient: string | null;
  phone: string;
  tags: string[];
  optedOut: boolean;
  line: string | null;
  assignedTo: string | null;
  repliedBy: string[];
  status: "OPEN" | "PENDING" | "RESOLVED";
  outcome: ConversationOutcome | null;
  outcomeBy: string | null;
  followUpAt: string | null;
  firstMessageAt: string;
  lastMessageAt: string;
  patientMessages: number;
  staffMessages: number;
  botMessages: number;
  campaignMessages: number;
  firstResponses: number;
  avgResponseMinutes: number | null;
  longestWaitMinutes: number;
  lateResponses: number;
  unanswered: boolean;
  /** Status of the chat's latest booking request. */
  bookingRequest: BookingRequestStatus | null;
  notBookedReason: string | null;
  leadSource: string | null;
  campaign: string | null;
  appointments: number;
  notes: number;
}

export interface ChatsReport extends DetailedReportMeta {
  summary: {
    chats: number;
    unanswered: number;
    withLateResponses: number;
    /** Outcome keys plus NONE. */
    byOutcome: Record<string, number>;
    byStatus: Record<string, number>;
    byLine: Record<string, number>;
  };
  chats: ChatsReportChat[];
  /** More than 5000 chats in the period — only the first are listed. */
  truncated: boolean;
}
