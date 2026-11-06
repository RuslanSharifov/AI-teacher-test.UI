import { ApiError, request } from "./api.js";
import { createTeacherMessage } from "./teacher.js";

const $ = (id) => document.getElementById(id);
const state = {
  auth: null, registering: false, busy: false,
  activePage: "student-chat", conversationId: null,
  conversations: [], messages: [], materials: [], currentUser: null
};

try {
  const stored = JSON.parse(sessionStorage.getItem("ai-teacher-auth") || "null");
  if (stored?.accessToken && stored?.role && new Date(stored.expiresUtc).getTime() > Date.now()) {
    state.auth = stored;
  }
} catch {
  sessionStorage.removeItem("ai-teacher-auth");
}

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = String(text);
  return item;
}

function showNotice(message, error = false) {
  const notice = $("notice");
  notice.textContent = message;
  notice.className = "notice" + (error ? " notice-error" : "");
  notice.hidden = false;
}
function clearNotice() { $("notice").hidden = true; }

function handleError(error) {
  console.error(error);
  const message = error instanceof ApiError
    ? (error.status ? "HTTP " + error.status + ": " : "") + error.message
    : (error?.message || "Naməlum xəta");
  showNotice(message, true);
  if (error instanceof ApiError && error.status === 401 && state.auth) {
    logout();
    showNotice("Sessiya bitdi. Yenidən giriş et.", true);
  }
}

async function action(callback) {
  clearNotice();
  if (state.busy) return;
  state.busy = true;
  try { await callback(); }
  catch (error) { handleError(error); throw error; }
  finally {
    state.busy = false;
    if (state.auth?.role === "Student" && state.activePage === "student-chat") renderMessages();
  }
}

function api(path, options = {}) {
  return request(path, { ...options, token: state.auth?.accessToken });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("az-AZ");
}

function logout() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  sessionStorage.removeItem("ai-teacher-auth");
  state.auth = null;
  state.currentUser = null;
  state.conversationId = null;
  state.conversations = [];
  state.messages = [];
  $("password").value = "";
  showAuthScreen();
}

function showAuthScreen() {
  $("auth-screen").hidden = false;
  $("workspace").hidden = true;
  $("logout").hidden = true;
  $("current-user").textContent = "";
}

function showWorkspace() {
  $("auth-screen").hidden = true;
  $("workspace").hidden = false;
  $("logout").hidden = false;
  $("current-user").textContent = state.auth?.role === "Admin" ? "Administrator" : "Şagird";
  makeNav();
}

function makeNav() {
  const admin = state.auth.role === "Admin";
  const pages = admin
    ? [["admin-dashboard", "▦", "Statistika"], ["admin-materials", "▤", "Materiallar"], ["admin-students", "♙", "Şagirdlər"]]
    : [["student-chat", "◉", "AI müəllim / Chat"], ["student-materials", "▤", "Materiallar"]];
  $("nav").replaceChildren();
  for (const [id, icon, title] of pages) {
    const button = node("button", "nav-button" + (state.activePage === id ? " active" : ""));
    button.type = "button";
    button.append(node("span", "nav-icon", icon), node("span", "", title));
    button.addEventListener("click", () => navigate(id));
    $("nav").appendChild(button);
  }
}

async function navigate(page) {
  state.activePage = page;
  for (const section of document.querySelectorAll(".page-section")) section.hidden = section.id !== page;
  makeNav();
  if (page === "admin-dashboard") await getStats();
  if (page === "admin-students") await getStudents();
  if (page === "admin-materials") await getAdminMaterials();
  if (page === "student-materials") await getStudentMaterials();
  if (page === "student-chat") await getConversations();
}

async function initializeSession() {
  showWorkspace();
  try {
    if (state.auth.role === "Admin") await navigate("admin-dashboard");
    else {
      state.currentUser = await api("/api/student/me");
      $("current-user").textContent = state.currentUser.name || state.currentUser.email;
      await navigate("student-chat");
    }
  } catch (error) { handleError(error); }
}

$("switch-auth").addEventListener("click", () => {
  state.registering = !state.registering;
  $("auth-title").textContent = state.registering ? "Şagird qeydiyyatı" : "Xoş gəldin";
  $("auth-subtitle").textContent = state.registering ? "Yeni şagird hesabı yarat." : "Admin və ya şagird hesabı ilə daxil ol.";
  $("auth-submit").textContent = state.registering ? "Hesab yarat →" : "Daxil ol →";
  $("switch-auth").textContent = state.registering ? "Artıq hesabım var →" : "Şagird hesabı yarat";
});

$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  $("auth-submit").disabled = true;
  try {
    await action(async () => {
      const data = await request(state.registering ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: { email: $("email").value.trim(), password: $("password").value }
      });
      if (!data?.accessToken) throw new Error("Backend token qaytarmadı.");
      state.auth = data;
      sessionStorage.setItem("ai-teacher-auth", JSON.stringify(data));
      await initializeSession();
    });
  } catch { /* Error already displayed. */ }
  finally { $("auth-submit").disabled = false; }
});
$("logout").addEventListener("click", logout);

function empty(parent, text) { parent.replaceChildren(node("div", "empty-state", text)); }

async function getStats() {
  try {
    const stats = await api("/api/admin/statistics");
    const entries = [
      ["Şagird sayı", stats.students, "♙"],
      ["Materiallar", stats.materials, "▤"],
      ["Söhbətlər", stats.conversations, "◉"],
      ["Şagird mesajları", stats.studentMessages, "↗"],
      ["Tanışlığı tamamlayan", stats.onboardedStudents, "✓"]
    ];
    const grid = $("statistics");
    grid.replaceChildren();
    for (const [label, value, icon] of entries) {
      const card = node("article", "stat-card");
      card.append(node("span", "stat-icon", icon), node("strong", "stat-value", value), node("span", "stat-label", label));
      grid.appendChild(card);
    }
  } catch (error) { handleError(error); }
}

async function getStudents() {
  try {
    const students = await api("/api/admin/students");
    const table = $("students-body");
    table.replaceChildren();
    for (const student of students) {
      const tr = document.createElement("tr");
      for (const cell of [student.email, student.name, student.age, student.school, student.subject, formatDate(student.createdUtc)]) {
        tr.appendChild(node("td", "", cell ?? "—"));
      }
      table.appendChild(tr);
    }
    if (!students.length) {
      const tr = document.createElement("tr");
      const td = node("td", "empty-table", "Hələ şagird yoxdur.");
      td.colSpan = 6;
      tr.appendChild(td);
      table.appendChild(tr);
    }
  } catch (error) { handleError(error); }
}

async function getAdminMaterials() {
  try {
    const materials = await api("/api/admin/materials");
    const list = $("admin-material-list");
    list.replaceChildren();
    if (!materials.length) return empty(list, "Hələ material yüklənməyib.");
    for (const material of materials) {
      const card = node("div", "material-row");
      const details = node("div", "");
      details.append(node("strong", "", material.title),
        node("span", "muted", material.subject + " · " + material.fileName),
        node("small", "muted", formatDate(material.createdUtc)));
      const remove = node("button", "button button-danger", "Sil");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm('"' + material.title + '" silinsin?')) return;
        try {
          await action(async () => {
            await api("/api/admin/materials/" + material.id, { method: "DELETE" });
            showNotice("Material silindi.");
            await getAdminMaterials();
          });
        } catch {}
      });
      card.append(details, remove);
      list.appendChild(card);
    }
  } catch (error) { handleError(error); }
}

$("upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  const file = $("material-file").files?.[0];
  if (!file) return showNotice("Fayl seçilməyib.", true);
  if (file.size > 8 * 1024 * 1024) return showNotice("8 MB-dan böyük fayl qəbul edilmir.", true);
  $("upload-submit").disabled = true;
  try {
    await action(async () => {
      await api("/api/admin/materials", { method: "POST", body: new FormData($("upload-form")) });
      $("upload-form").reset();
      showNotice("Material uğurla yükləndi.");
      await getAdminMaterials();
    });
  } catch {}
  finally { $("upload-submit").disabled = false; }
});

async function getStudentMaterials() {
  try {
    const materials = await api("/api/student/materials");
    state.materials = materials;
    const list = $("student-material-list");
    list.replaceChildren();
    if (!materials.length) return empty(list, "Hələ material yoxdur. Admin material əlavə etməlidir.");
    for (const material of materials) {
      const button = node("button", "material-row material-button");
      button.type = "button";
      button.append(node("strong", "", material.title), node("span", "muted", material.subject + " · " + material.fileName));
      button.addEventListener("click", async () => {
        try {
          const content = await api("/api/student/materials/" + material.id + "/content");
          const preview = $("student-material-content");
          preview.className = "content-preview";
          preview.replaceChildren(node("span", "section-overline", content.subject), node("h3", "", content.title));
          (content.sections || []).forEach((part, index) => {
            const item = node("details", "material-chunk");
            item.append(node("summary", "", "Bölmə " + (index + 1)), node("p", "chunk-text", part));
            if (index === 0) item.open = true;
            preview.appendChild(item);
          });
        } catch (error) { handleError(error); }
      });
      list.appendChild(button);
    }
  } catch (error) { handleError(error); }
}

async function getConversations() {
  try {
    state.conversations = await api("/api/student/conversations");
    renderConversations();
    if (state.conversationId && state.conversations.some(c => c.id === state.conversationId)) {
      await selectConversation(state.conversationId);
    } else if (state.conversations.length) {
      await selectConversation(state.conversations[0].id);
    } else {
      state.conversationId = null;
      state.messages = [];
      renderMessages();
    }
  } catch (error) { handleError(error); }
}

function renderConversations() {
  const list = $("thread-list");
  list.replaceChildren();
  if (!state.conversations.length) return empty(list, "Söhbət yoxdur. Yeni söhbət yarat.");
  state.conversations.forEach((conversation, index) => {
    const button = node("button", "thread-item" + (state.conversationId === conversation.id ? " selected" : ""));
    button.type = "button";
    button.append(node("span", "thread-badge", "◉"),
      node("span", "thread-name", "Söhbət #" + (state.conversations.length - index)),
      node("small", "muted", formatDate(conversation.updatedUtc)));
    button.title = conversation.id;
    button.addEventListener("click", async () => {
      try { await selectConversation(conversation.id); }
      catch (error) { handleError(error); }
    });
    list.appendChild(button);
  });
}

async function selectConversation(id) {
  state.conversationId = id;
  state.messages = await api("/api/student/conversations/" + id + "/messages");
  renderConversations();
  renderMessages();
}

function renderMessages() {
  const list = $("chat-messages");
  list.replaceChildren();
  $("chat-title").textContent = state.conversationId
    ? "Dərs söhbəti · " + state.conversationId.slice(0, 8) : "Söhbət seç";
  const lastTeacherIndex = state.messages.reduce((latest, message, index) =>
    message.role === "teacher" ? index : latest, -1);
  if (!state.conversationId) {
    list.appendChild(node("div", "chat-welcome", "✧ Yeni söhbət yarat. AI müəllim əvvəlcə tanışlıq suallarını göndərəcək."));
  } else if (!state.messages.length) {
    list.appendChild(node("div", "empty-state", "Bu söhbətdə hələ mesaj yoxdur."));
  }
  state.messages.forEach((message, index) => {
    const teacher = message.role === "teacher";
    const row = node("div", "message-row " + (teacher ? "teacher-row" : "student-row"));
    const avatar = node("div", "message-avatar", teacher ? "AI" : "S");
    const bubble = node("div", "message-bubble " + (teacher ? "teacher-bubble" : "student-bubble"));
    if (teacher && message.turn) {
      bubble.appendChild(createTeacherMessage(message.turn, {
        enabled: index === lastTeacherIndex && message.turn.kind === "form" && !state.busy,
        onAnswer: submitForm
      }));
    } else bubble.appendChild(node("p", "speech-text", message.text || ""));
    row.append(avatar, bubble);
    list.appendChild(row);
  });
  const latest = state.messages[lastTeacherIndex]?.turn;
  const hasActiveForm = latest?.kind === "form" && !!latest.form;
  $("message-input").disabled = !state.conversationId || hasActiveForm || state.busy;
  $("message-send").disabled = !state.conversationId || hasActiveForm || state.busy;
  $("composer-hint").textContent = !state.conversationId
    ? "Yeni söhbət yaratmaqla başla."
    : hasActiveForm ? "Əvvəl müəllimin göndərdiyi formanı doldur."
    : "Mesajlar yalnız bu şagirdin öz söhbətində saxlanılır.";
  list.scrollTop = list.scrollHeight;
}

async function submitForm(field, value) {
  if (!state.conversationId || state.busy) throw new Error("Sorğu hazır deyil.");
  await action(async () => {
    await api("/api/student/conversations/" + state.conversationId + "/messages", {
      method: "POST", body: { form: { field, value } }
    });
    await selectConversation(state.conversationId);
  });
}

$("new-chat").addEventListener("click", async () => {
  if (state.busy) return;
  $("new-chat").disabled = true;
  try {
    await action(async () => {
      const result = await api("/api/student/conversations", { method: "POST" });
      if (!result?.conversationId) throw new Error("API conversationId qaytarmadı.");
      state.conversationId = result.conversationId;
      await getConversations();
    });
  } catch {}
  finally { $("new-chat").disabled = false; }
});

$("message-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("message-input").value.trim();
  if (!text || !state.conversationId || state.busy) return;
  $("message-send").disabled = true;
  try {
    await action(async () => {
      await api("/api/student/conversations/" + state.conversationId + "/messages", {
        method: "POST", body: { text }
      });
      $("message-input").value = "";
      await selectConversation(state.conversationId);
    });
  } catch {}
  finally { $("message-send").disabled = false; }
});

$("message-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $("message-form").requestSubmit();
  }
});
$("refresh-stats").addEventListener("click", getStats);
$("refresh-students").addEventListener("click", getStudents);
$("refresh-admin-materials").addEventListener("click", getAdminMaterials);
$("refresh-student-materials").addEventListener("click", getStudentMaterials);

if (state.auth) initializeSession();
else showAuthScreen();
