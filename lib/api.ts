import type {
  LoginResponse,
  ConversationListResponse,
  MessagesResponse,
  SendMessageResponse,
  Customer,
  CustomerListResponse,
  CustomerResponse,
  AuditLogResponse,
  Gender,
  ContactListListResponse,
  ContactListResponse,
  ContactListDetailResponse,
} from "@/types";

// Optional patient/demographic fields shared by create & update.
type CustomerPatientFields = {
  chartNumber?: string | null;
  nationality?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  joinDate?: string | null;
  departments?: string[];
};

const BASE = process.env.NEXT_PUBLIC_API_URL;

// Carries the HTTP status alongside the message so callers can distinguish
// "forbidden" (403) from "upstream service failed" (502) from any other
// error, instead of only having a message string to guess from.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: "include" });

  if (res.status === 401 && !path.startsWith("/api/auth/")) {
    localStorage.removeItem("user");
    document.cookie = "logged_in=; path=/; max-age=0";
    await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  const data = await res.json();

  if (!res.ok || !data.success) {
    throw new ApiError(data?.message ?? `HTTP ${res.status}`, res.status);
  }

  return data as T;
}

export function apiLogin(username: string, password: string) {
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function apiGetConversations(page = 1, limit = 50, lastSenderType?: string, search?: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (lastSenderType) params.append("lastSenderType", lastSenderType);
  if (search) params.append("search", search);
  return apiFetch<ConversationListResponse>(`/api/conversations?${params}`);
}

export function apiGetMessages(conversationId: string, page = 1, limit = 200) {
  return apiFetch<MessagesResponse>(
    `/api/conversations/${conversationId}/messages?page=${page}&limit=${limit}`
  );
}

export function apiMarkRead(conversationId: string) {
  return apiFetch<{ success: boolean }>(
    `/api/conversations/${conversationId}/read`,
    { method: "POST" }
  );
}

export function apiDeleteMessage(messageId: string | number) {
  return apiFetch<{ success: boolean }>(`/api/messages/${messageId}`, { method: "DELETE" });
}

export function apiGetCustomer(id: string) {
  return apiFetch<{ success: boolean; data: Customer }>(`/api/customers/${id}`);
}

export function apiSendMessage(
  conversationId: string,
  content: string,
  mediaUrl?: string,
  messageType: import("@/types").Message["messageType"] = "TEXT",
  quotedMessageId?: number | null,
) {
  return apiFetch<SendMessageResponse>("/api/messages/send", {
    method: "POST",
    body: JSON.stringify({
      conversationId: Number(conversationId),
      content,
      messageType,
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(quotedMessageId ? { quotedMessageId } : {}),
    }),
  });
}

export function apiUploadMedia(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<{
    success: boolean;
    url: string;
    publicId: string;
    messageType: import("@/types").Message["messageType"];
    format: string;
    bytes: number;
  }>("/api/media/upload", { method: "POST", body: form });
}

// Media Library
export function apiGetMediaLibrary(type?: import("@/types").MediaAssetType) {
  return apiFetch<import("@/types").MediaAssetListResponse>(
    `/api/media-library${type ? `?type=${type}` : ""}`
  );
}

export function apiUploadToMediaLibrary(file: File, name?: string) {
  const form = new FormData();
  form.append("file", file);
  if (name) form.append("name", name);
  return apiFetch<import("@/types").MediaAssetResponse>("/api/media-library", { method: "POST", body: form });
}

export function apiUpdateMediaAsset(id: number, data: { filename: string }) {
  return apiFetch<import("@/types").MediaAssetResponse>(`/api/media-library/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function apiDeleteMediaAsset(id: number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/media-library/${id}`, { method: "DELETE" });
}

export function apiAssignConversation(conversationId: string, agentId: number | null) {
  return apiFetch<{ success: boolean }>(
    `/api/conversations/${conversationId}/assign`,
    {
      method: "PUT",
      body: JSON.stringify({ agentId }),
    }
  );
}

export function apiChangeConversationStatus(
  conversationId: string,
  status: "OPEN" | "PENDING" | "RESOLVED"
) {
  return apiFetch<{ success: boolean }>(
    `/api/conversations/${conversationId}/status`,
    {
      method: "PUT",
      body: JSON.stringify({ status }),
    }
  );
}

export function apiDeleteCustomer(id: string | number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/customers/${id}`, { method: "DELETE" });
}

export function apiBulkDeleteCustomers(ids: number[]) {
  return apiFetch<{ success: boolean; message: string; data: { deleted: number } }>(
    "/api/customers/bulk-delete",
    { method: "POST", body: JSON.stringify({ ids }) }
  );
}

type ImportIssue = { row: number; phone?: string; reason: string };

export function apiValidateImport(file: File, dateFormat = "auto", defaultCountry = "") {
  const form = new FormData();
  form.append("file", file);
  form.append("dateFormat", dateFormat);
  form.append("defaultCountry", defaultCountry);
  return apiFetch<{
    success: boolean;
    data: { total: number; valid: number; duplicates: ImportIssue[]; invalid: ImportIssue[] };
  }>("/api/customers/import/validate", { method: "POST", body: form });
}

export function apiImportCustomers(file: File, dateFormat = "auto", defaultCountry = "") {
  const form = new FormData();
  form.append("file", file);
  form.append("dateFormat", dateFormat);
  form.append("defaultCountry", defaultCountry);
  return apiFetch<{
    success: boolean;
    data: {
      total: number;
      created: number;
      skipped: number;
      duplicates?: ImportIssue[];
      errors: ImportIssue[];
    };
  }>("/api/customers/import", { method: "POST", body: form });
}

export function apiGetCustomers(page = 1, limit = 20, search = "") {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (search) {
    params.append("search", search);
  }
  return apiFetch<CustomerListResponse>(`/api/customers?${params.toString()}`);
}

export function apiCreateCustomer(data: {
  phone: string;
  name?: string;
  email?: string;
  tags?: string[];
  notes?: string;
} & CustomerPatientFields) {
  return apiFetch<CustomerResponse>("/api/customers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function apiUpdateCustomer(
  id: string | number,
  data: Partial<{ name: string; email: string; tags: string[]; notes: string; optedOut: boolean } & CustomerPatientFields>
) {
  return apiFetch<CustomerResponse>(`/api/customers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function apiSearchMessages(
  q: string,
  conversationId?: string,
  page = 1,
  limit = 20
) {
  const params = new URLSearchParams({
    q,
    page: String(page),
    limit: String(limit),
  });
  if (conversationId) {
    params.append("conversationId", conversationId);
  }
  return apiFetch<MessagesResponse>(`/api/messages/search?${params.toString()}`);
}

export function apiGetAuditLog(
  page = 1,
  limit = 20,
  action?: string,
  actorId?: number
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (action) {
    params.append("action", action);
  }
  if (actorId !== undefined) {
    params.append("actorId", String(actorId));
  }
  return apiFetch<AuditLogResponse>(`/api/audit?${params.toString()}`);
}

// User management (admin)
export function apiGetUsers(params?: { page?: number; limit?: number; search?: string; role?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  if (params?.role) q.set("role", params.role);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return apiFetch<import("@/types").UserListResponse>(`/api/users${qs ? "?" + qs : ""}`);
}

export function apiGetMe() {
  return apiFetch<import("@/types").UserResponse>("/api/users/me");
}

export function apiGetUser(id: number | string) {
  return apiFetch<import("@/types").UserResponse>(`/api/users/${id}`);
}

export function apiCreateUser(data: { name?: string; username: string; password: string; role?: "ADMIN" | "AGENT" }) {
  return apiFetch<import("@/types").UserResponse>("/api/users", { method: "POST", body: JSON.stringify(data) });
}

export function apiUpdateUser(id: number | string, data: Partial<{ name: string | null; username: string; role: "ADMIN" | "AGENT"; status: import("@/types").UserStatus }>) {
  return apiFetch<import("@/types").UserResponse>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function apiDeleteUser(id: number | string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/users/${id}`, { method: "DELETE" });
}

export function apiResetUserPassword(id: number | string, password: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/users/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) });
}

export function apiUpdateMyStatus(status: import("@/types").UserStatus) {
  return apiFetch<import("@/types").UserResponse>("/api/users/me/status", { method: "PUT", body: JSON.stringify({ status }) });
}

export function apiLogout() {
  return apiFetch<{ success: boolean }>("/api/auth/logout", { method: "POST" });
}

export function apiGetStatsOverview() {
  return apiFetch<import("@/types").StatsOverviewResponse>("/api/stats/overview");
}

export function apiGetStatsMessages(days = 7) {
  return apiFetch<import("@/types").StatsMessagesResponse>(`/api/stats/messages?days=${days}`);
}

export function apiGetStatsAgents() {
  return apiFetch<import("@/types").StatsAgentsResponse>("/api/stats/agents");
}

export function apiGetStatsConversations() {
  return apiFetch<{ success: boolean; data: unknown }>("/api/stats/conversations");
}

export function apiGetStatsCustomers() {
  return apiFetch<{ success: boolean; data: unknown }>("/api/stats/customers");
}

// Templates
export function apiGetTemplates(params?: { category?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return apiFetch<import("@/types").TemplateListResponse>(`/api/templates${qs ? "?" + qs : ""}`);
}

export function apiCreateTemplate(data: {
  name: string;
  category: import("@/types").TemplateCategory;
  language?: string;
  headerType?: import("@/types").TemplateHeaderType;
  header?: string;
  headerMediaUrl?: string;
  body: string;
  footer?: string;
  buttons?: import("@/types").TemplateButton[];
}) {
  return apiFetch<import("@/types").TemplateResponse>("/api/templates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function apiUpdateTemplate(
  id: number,
  data: Partial<{
    name: string;
    category: import("@/types").TemplateCategory;
    language: string;
    headerType: import("@/types").TemplateHeaderType;
    header: string;
    headerMediaUrl: string;
    body: string;
    footer: string;
    buttons: import("@/types").TemplateButton[];
  }>
) {
  return apiFetch<import("@/types").TemplateResponse>(`/api/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function apiDeleteTemplate(id: number) {
  return apiFetch<{ success: boolean }>(`/api/templates/${id}`, { method: "DELETE" });
}

export function apiSubmitTemplate(id: number) {
  return apiFetch<import("@/types").TemplateResponse>(`/api/templates/${id}/submit`, {
    method: "POST",
  });
}

export function apiSyncTemplates() {
  return apiFetch<{ success: boolean; updated: number; approved: number; rejected: number }>(
    "/api/templates/sync",
    { method: "POST" }
  );
}

// Campaigns
export function apiGetCampaigns() {
  return apiFetch<import("@/types").CampaignListResponse>("/api/campaigns");
}

export function apiGetCampaign(id: number) {
  return apiFetch<import("@/types").CampaignResponse>(`/api/campaigns/${id}`);
}

export interface ActiveCampaignProgress {
  id: number;
  status: "RUNNING" | "PAUSED";
  sentCount: number;
  failedCount: number;
  totalRecipients: number;
}

export function apiGetActiveCampaignProgress() {
  return apiFetch<{ success: boolean; data: ActiveCampaignProgress[] }>("/api/campaigns/active-progress");
}

export function apiCreateCampaign(data: {
  name: string;
  templateId: number;
  recipientIds: number[];
  scheduledAt?: string;
}) {
  return apiFetch<import("@/types").CampaignResponse>("/api/campaigns", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function apiUpdateCampaign(
  id: number,
  data: Partial<{ name: string; templateId: number; recipientIds: number[]; scheduledAt: string | null }>
) {
  return apiFetch<import("@/types").CampaignResponse>(`/api/campaigns/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function apiDeleteCampaign(id: number) {
  return apiFetch<{ success: boolean }>(`/api/campaigns/${id}`, { method: "DELETE" });
}

export function apiBulkDeleteCampaigns(ids: number[]) {
  return apiFetch<{ success: boolean; deletedCount: number; skippedCount: number; message: string }>(
    "/api/campaigns/bulk-delete",
    { method: "POST", body: JSON.stringify({ ids }) }
  );
}

export function apiSendCampaignNow(id: number) {
  return apiFetch<{ success: boolean }>(`/api/campaigns/${id}/send`, { method: "POST" });
}

export function apiCancelCampaign(id: number) {
  return apiFetch<{ success: boolean }>(`/api/campaigns/${id}/cancel`, { method: "POST" });
}

export function apiPauseCampaign(id: number) {
  return apiFetch<{ success: boolean }>(`/api/campaigns/${id}/pause`, { method: "POST" });
}

export function apiResumeCampaign(id: number) {
  return apiFetch<{ success: boolean }>(`/api/campaigns/${id}/resume`, { method: "POST" });
}

// WhatsApp number health
export function apiGetWhatsAppStatus() {
  return apiFetch<import("@/types").WhatsAppPhoneStatusResponse>("/api/whatsapp/status");
}

export function apiGetWhatsAppNumbers() {
  return apiFetch<import("@/types").WhatsAppNumbersListResponse>("/api/whatsapp/numbers");
}

export function apiCreateConversation(customerId: number) {
  return apiFetch<{ success: boolean; data: import("@/types").Conversation; created: boolean }>(
    "/api/conversations",
    { method: "POST", body: JSON.stringify({ customerId }) }
  );
}

export function apiSendTemplate(conversationId: string, templateId: number) {
  return apiFetch<{ success: boolean; data: import("@/types").Message }>(
    `/api/templates/conversations/${conversationId}/send-template`,
    { method: "POST", body: JSON.stringify({ templateId }) }
  );
}

// Lists
export function apiGetLists() {
  return apiFetch<ContactListListResponse>("/api/lists");
}

export function apiCreateList(data: { name: string; description?: string }) {
  return apiFetch<ContactListResponse>("/api/lists", { method: "POST", body: JSON.stringify(data) });
}

export function apiGetList(id: string | number, page = 1, limit = 30, search = "") {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.append("search", search);
  return apiFetch<ContactListDetailResponse>(`/api/lists/${id}?${params.toString()}`);
}

export function apiUpdateList(id: string | number, data: Partial<{ name: string; description: string }>) {
  return apiFetch<ContactListResponse>(`/api/lists/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function apiDeleteList(id: string | number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/lists/${id}`, { method: "DELETE" });
}

export function apiAddListMembers(id: string | number, customerIds: number[]) {
  return apiFetch<{ success: boolean; message: string; data: { added: number; alreadyInList: number } }>(
    `/api/lists/${id}/members`,
    { method: "POST", body: JSON.stringify({ customerIds }) }
  );
}

export function apiRemoveListMember(id: string | number, customerId: number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/lists/${id}/members/${customerId}`, { method: "DELETE" });
}

export function apiGetListMemberIds(id: string | number) {
  return apiFetch<{ success: boolean; data: { listId: number; name: string; customerIds: number[] } }>(
    `/api/lists/${id}/members/ids`
  );
}

export function apiValidateListImport(id: string | number, file: File, dateFormat = "auto", defaultCountry = "") {
  const form = new FormData();
  form.append("file", file);
  form.append("dateFormat", dateFormat);
  form.append("defaultCountry", defaultCountry);
  return apiFetch<{
    success: boolean;
    data: { total: number; valid: number; duplicates: ImportIssue[]; invalid: ImportIssue[] };
  }>(`/api/lists/${id}/import/validate`, { method: "POST", body: form });
}

export function apiImportListMembers(id: string | number, file: File, dateFormat = "auto", defaultCountry = "") {
  const form = new FormData();
  form.append("file", file);
  form.append("dateFormat", dateFormat);
  form.append("defaultCountry", defaultCountry);
  return apiFetch<{
    success: boolean;
    data: {
      total: number;
      created: number;
      matchedExisting: number;
      linked: number;
      alreadyInList: number;
      duplicatesInFile: number;
      errors: ImportIssue[];
    };
  }>(`/api/lists/${id}/import`, { method: "POST", body: form });
}
