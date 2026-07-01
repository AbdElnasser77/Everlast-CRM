import type {
  LoginResponse,
  ConversationListResponse,
  MessagesResponse,
  SendMessageResponse,
  Customer,
  CustomerListResponse,
  CustomerResponse,
  AuditLogResponse,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL;

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
    throw new Error(data?.message ?? `HTTP ${res.status}`);
  }

  return data as T;
}

export function apiLogin(username: string, password: string) {
  return apiFetch<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function apiGetConversations(page = 1, limit = 50, lastSenderType?: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (lastSenderType) params.append("lastSenderType", lastSenderType);
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

export function apiImportCustomers(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<{
    success: boolean;
    data: { total: number; created: number; skipped: number; errors: { row: number; reason: string }[] };
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
}) {
  return apiFetch<CustomerResponse>("/api/customers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function apiUpdateCustomer(
  id: string | number,
  data: Partial<{ name: string; email: string; tags: string[]; notes: string; optedOut: boolean }>
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
  header?: string;
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
    header: string;
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

export function apiSendCampaignNow(id: number) {
  return apiFetch<{ success: boolean }>(`/api/campaigns/${id}/send`, { method: "POST" });
}

export function apiCancelCampaign(id: number) {
  return apiFetch<{ success: boolean }>(`/api/campaigns/${id}/cancel`, { method: "POST" });
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
