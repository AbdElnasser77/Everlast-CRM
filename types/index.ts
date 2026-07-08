export interface User {
  id: string;
  username: string;
  role: string;
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
  assignedAgent: { id: number; username: string } | null;
  status: "OPEN" | "PENDING" | "RESOLVED";
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderType: "CUSTOMER" | "AGENT" | null;
  lastCustomerMessageAt?: string | null;
}

export interface QuotedMessage {
  id: number;
  content: string;
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "TEMPLATE" | "INTERACTIVE" | "STICKER";
  senderType: "CUSTOMER" | "AGENT";
  mediaUrl?: string | null;
  deletedAt?: string | null;
}

export interface Message {
  _id?: string;
  id?: string | number;
  conversationId: string;
  senderType: "CUSTOMER" | "AGENT";
  senderId: string | null;
  content: string;
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "TEMPLATE" | "INTERACTIVE" | "STICKER";
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | null;
  whatsappMessageId?: string | null;
  mediaUrl?: string | null;
  reactions?: Record<string, number> | null;
  quotedMessageId?: number | null;
  quotedMessage?: QuotedMessage | null;
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
  language: string;
  headerType: TemplateHeaderType;
  header: string | null;
  headerMediaUrl: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface AgentUser {
  id: number;
  name: string | null;
  username: string;
  role: "ADMIN" | "AGENT";
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

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type CampaignRecipientStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export interface Campaign {
  id: number;
  name: string;
  templateId: number;
  template?: Pick<Template, "id" | "name" | "category" | "body" | "header" | "footer" | "buttons">;
  status: CampaignStatus;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
  deliveredCount?: number;
  readCount?: number;
  repliedCount?: number;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  recipients?: CampaignRecipient[];
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
