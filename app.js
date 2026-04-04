/* =========================
   1) 你只需要改這裡
========================= */
const CONFIG = {
  GOOGLE_CLIENT_ID: "438080457387-bpn3tqlagvkl1ajrkr3ephj2unotcff5.apps.googleusercontent.com",
  SPREADSHEET_ID: "17YnCiTkjuRDi5-QSRttICBrAmkWup9dgPjMpYXE-v-s",
  LEDGER_RANGE: "記帳紀錄!A:G",
  FIELD_RANGE: "欄位表!A:C",
  SHEETS_API_BASE: "https://sheets.googleapis.com/v4/spreadsheets",
  SCOPES: "https://www.googleapis.com/auth/spreadsheets"
};

/* =========================
   2) 狀態
========================= */
const state = {
  accessToken: null,
  tokenClient: null,
  fields: {
    types: [],
    categories: [],
    payments: []
  },
  records: [],
  selectedMonth: getCurrentMonth(),
  charts: {
    incomeExpense: null,
    category: null
  }
};

/* =========================
   3) DOM refs
========================= */
let els = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  bindEvents();
  setDefaultDate();
  setAuthState("尚未登入", "neutral");
  setDetailMeta("尚未載入");
  setAddStatus("待登入", "neutral");
  disableRecordForm(true);

  try {
    await waitForGoogleIdentity();
    initTokenClient();
    setAuthState("可登入", "neutral");
  } catch (err) {
    console.error(err);
    setAuthState("Google 登入模組載入失敗", "danger");
    setAddStatus("無法登入", "danger");
  }
});

/* =========================
   4) 初始化
========================= */
function cacheElements() {
  els = {
    loginBtn: document.getElementById("loginBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    authState: document.getElementById("authState"),
    addStatus: document.getElementById("addStatus"),
    detailMeta: document.getElementById("detailMeta"),

    recordForm: document.getElementById("recordForm"),
    recordDate: document.getElementById("recordDate"),
    recordType: document.getElementById("recordType"),
    recordCategory: document.getElementById("recordCategory"),
    recordPayment: document.getElementById("recordPayment"),
    recordAmount: document.getElementById("recordAmount"),
    recordDescription: document.getElementById("recordDescription"),

    monthFilter: document.getElementById("monthFilter"),
    incomeTotal: document.getElementById("incomeTotal"),
    expenseTotal: document.getElementById("expenseTotal"),
    remainingTotal: document.getElementById("remainingTotal"),
    categoryList: document.getElementById("categoryList"),

    paymentSummaryBody: document.getElementById("paymentSummaryBody"),
    detailBody: document.getElementById("detailBody"),

    incomeExpenseChart: document.getElementById("incomeExpenseChart"),
    categoryChart: document.getElementById("categoryChart")
  };
}

function bindEvents() {
  els.loginBtn.addEventListener("click", handleLogin);
  els.logoutBtn.addEventListener("click", handleLogout);
  els.monthFilter.addEventListener("change", handleMonthChange);
  els.recordForm.addEventListener("submit", handleAddRecord);
}

function setDefaultDate() {
  els.recordDate.value = formatDate(new Date());
}

/* =========================
   5) Google Auth
========================= */
function waitForGoogleIdentity(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    const tick = () => {
      if (window.google && google.accounts && google.accounts.oauth2) {
        resolve();
        return;
      }

      if (Date.now() - started > timeoutMs) {
        reject(new Error("Google Identity Services 載入逾時"));
        return;
      }

      setTimeout(tick, 50);
    };

    tick();
  });
}

function initTokenClient() {
  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: async (response) => {
      if (response.error) {
        console.error("Token error:", response);
        setAuthState("登入失敗", "danger");
        setAddStatus("登入失敗", "danger");
        return;
      }

      state.accessToken = response.access_token;
      setAuthState("已登入 Google", "success");
      setAddStatus("已連線", "success");
      els.loginBtn.disabled = true;
      els.logoutBtn.disabled = false;
      disableRecordForm(false);

      await loadAllData();
    }
  });
}

function handleLogin() {
  if (!state.tokenClient) {
    setAuthState("登入模組未就緒", "danger");
    return;
  }

  state.tokenClient.callback = async (response) => {
    if (response.error) {
      console.error(response);
      setAuthState("登入失敗", "danger");
      setAddStatus("登入失敗", "danger");
      return;
    }

    state.accessToken = response.access_token;
    setAuthState("已登入 Google", "success");
    setAddStatus("已連線", "success");
    els.loginBtn.disabled = true;
    els.logoutBtn.disabled = false;
    disableRecordForm(false);

    await loadAllData();
  };

  const promptMode = state.accessToken ? "" : "consent";
  state.tokenClient.requestAccessToken({ prompt: promptMode });
}

function handleLogout() {
  if (!state.accessToken) {
    resetAfterLogout();
    return;
  }

  google.accounts.oauth2.revoke(state.accessToken, () => {
    resetAfterLogout();
  });
}

function resetAfterLogout() {
  state.accessToken = null;
  state.records = [];
  state.fields = { types: [], categories: [], payments: [] };
  state.selectedMonth = getCurrentMonth();

  els.loginBtn.disabled = false;
  els.logoutBtn.disabled = true;
  disableRecordForm(true);

  setAuthState("尚未登入", "neutral");
  setAddStatus("待登入", "neutral");
  setDetailMeta("尚未載入");

  renderSelectOptions();
  renderEmptyViews();
  clearCharts();
}

function disableRecordForm(disabled) {
  [...els.recordForm.querySelectorAll("input, select, textarea, button")].forEach((node) => {
    if (node.id === "recordForm") return;
    if (node.type === "submit") {
      node.disabled = disabled;
      return;
    }
    node.disabled = disabled;
  });
}

function setAuthState(text, tone = "neutral") {
  els.authState.textContent = text;
  els.authState.className = `auth-state ${tone}`;
}

function setAddStatus(text, tone = "neutral") {
  els.addStatus.textContent = text;
  els.addStatus.className = `status-pill ${tone}`;
}

function setDetailMeta(text, tone = "neutral") {
  els.detailMeta.textContent = text;
  els.detailMeta.className = `status-pill ${tone}`;
}

/* =========================
   6) Sheets API
========================= */
async function loadAllData() {
  try {
    setDetailMeta("載入中...", "neutral");

    const [fieldRows, recordRows] = await fetchBatchValues([
      CONFIG.FIELD_RANGE,
      CONFIG.LEDGER_RANGE
    ]);

    state.fields = parseFieldSheet(fieldRows);
    state.records = parseLedgerSheet(recordRows);

    if (!state.selectedMonth || !getAvailableMonths().includes(state.selectedMonth)) {
      state.selectedMonth = getAvailableMonths()[0] || getCurrentMonth();
    }

    renderSelectOptions();
    renderDashboard();

    setDetailMeta(`已載入 ${state.records.length} 筆資料`, "success");
  } catch (err) {
    console.error(err);
    setDetailMeta("載入失敗", "danger");
    setAddStatus("讀取試算表失敗", "danger");
  }
}

async function fetchBatchValues(ranges) {
  ensureSignedIn();

  const params = new URLSearchParams();
  params.set("majorDimension", "ROWS");
  params.set("valueRenderOption", "UNFORMATTED_VALUE");
  params.set("dateTimeRenderOption", "FORMATTED_STRING");
  ranges.forEach((range) => params.append("ranges", range));

  const url = `${CONFIG.SHEETS_API_BASE}/${encodeURIComponent(CONFIG.SPREADSHEET_ID)}/values:batchGet?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${state.accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`讀取試算表失敗：${response.status}`);
  }

  const data = await response.json();
  return (data.valueRanges || []).map((item) => item.values || []);
}

async function appendRecord(row) {
  ensureSignedIn();

  const url =
    `${CONFIG.SHEETS_API_BASE}/${encodeURIComponent(CONFIG.SPREADSHEET_ID)}` +
    `/values/${encodeURIComponent(CONFIG.LEDGER_RANGE)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values: [row]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`寫入失敗：${response.status} ${text}`);
  }
}

function ensureSignedIn() {
  if (!state.accessToken) {
    throw new Error("尚未登入 Google");
  }
}

/* =========================
   7) 解析試算表資料
========================= */
function parseFieldSheet(rows) {
  const types = new Set();
  const categories = new Set();
  const payments = new Set();

  rows.slice(1).forEach((row) => {
    const type = normalizeCell(row[0]);
    const category = normalizeCell(row[1]);
    const payment = normalizeCell(row[2]);

    if (type) types.add(type);
    if (category) categories.add(category);
    if (payment) payments.add(payment);
  });

  return {
    types: Array.from(types),
    categories: Array.from(categories),
    payments: Array.from(payments)
  };
}

function parseLedgerSheet(rows) {
  return rows.slice(1)
    .map((row) => {
      const padded = [...row];
      while (padded.length < 7) padded.push("");

      return {
        id: normalizeCell(padded[0]),
        date: normalizeCell(padded[1]),
        type: normalizeCell(padded[2]),
        payment: normalizeCell(padded[3]),
        amount: Number(padded[4]) || 0,
        category: normalizeCell(padded[5]),
        description: normalizeCell(padded[6])
      };
    })
    .filter((item) => item.date || item.type || item.amount || item.description)
    .sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return String(b.id).localeCompare(String(a.id));
    });
}

/* =========================
   8) 版面渲染
========================= */
function renderSelectOptions() {
  renderSelect(els.recordType, state.fields.types.length ? state.fields.types : ["支出", "收入"]);
  renderSelect(els.recordCategory, state.fields.categories.length ? state.fields.categories : ["餐飲食品", "居家生活", "交通運輸", "休閒娛樂", "學習成長", "醫療保健", "購物服飾", "其他雜項"]);
  renderSelect(els.recordPayment, state.fields.payments.length ? state.fields.payments : ["現金 (Cash)", "ATM 轉帳", "電子支付 (LINE Pay, Samsung Pay)", "電子票證 (悠遊卡)", "信用卡"]);
  renderMonthFilter();
}

function renderSelect(selectEl, items) {
  const current = selectEl.value;
  selectEl.innerHTML = "";
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    selectEl.appendChild(opt);
  });

  if (items.includes(current)) {
    selectEl.value = current;
  }
}

function renderMonthFilter() {
  const months = getAvailableMonths();
  const current = state.selectedMonth || getCurrentMonth();
  els.monthFilter.innerHTML = "";

  months.forEach((month) => {
    const opt = document.createElement("option");
    opt.value = month;
    opt.textContent = month;
    els.monthFilter.appendChild(opt);
  });

  if (months.includes(current)) {
    els.monthFilter.value = current;
  } else if (months.length) {
    els.monthFilter.value = months[0];
    state.selectedMonth = months[0];
  }
}

function renderDashboard() {
  const monthRecords = getMonthRecords(state.selectedMonth);
  const expenseTotal = sumBy(monthRecords.filter((r) => r.type === "支出"), "amount");
  const incomeTotal = sumBy(monthRecords.filter((r) => r.type === "收入"), "amount");
  const remaining = incomeTotal - expenseTotal;

  els.incomeTotal.textContent = formatMoney(incomeTotal);
  els.expenseTotal.textContent = formatMoney(expenseTotal);
  els.remainingTotal.textContent = formatMoney(remaining);
  els.remainingTotal.style.color = remaining >= 0 ? "#186a4f" : "#a11d4f";

  renderCategoryList(monthRecords);
  renderPaymentSummary(monthRecords);
  renderDetailTable(monthRecords);
  updateCharts(monthRecords, incomeTotal, expenseTotal);
}

function renderCategoryList(monthRecords) {
  const expenseRecords = monthRecords.filter((r) => r.type === "支出");
  const categoryMap = aggregate(expenseRecords, (item) => item.category || "未分類");

  const sorted = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (!sorted.length) {
    els.categoryList.innerHTML = `<div class="empty-row">本月尚無支出資料</div>`;
    return;
  }

  els.categoryList.innerHTML = sorted.map(([name, amount]) => `
    <div class="category-chip">
      ${escapeHtml(name)}
      <small>${formatMoney(amount)}</small>
    </div>
  `).join("");
}

function renderPaymentSummary(monthRecords) {
  const creditRows = monthRecords.filter((r) => r.payment.includes("信用卡"));
  const paymentMap = aggregate(creditRows, (item) => item.payment || "未指定");

  const entries = Object.entries(paymentMap).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    els.paymentSummaryBody.innerHTML = `<tr><td colspan="2" class="empty-row">本月尚無信用卡刷卡紀錄</td></tr>`;
    return;
  }

  els.paymentSummaryBody.innerHTML = entries.map(([payment, amount]) => `
    <tr>
      <td>${escapeHtml(payment)}</td>
      <td class="amount">${formatMoney(amount)}</td>
    </tr>
  `).join("");
}

function renderDetailTable(monthRecords) {
  if (!monthRecords.length) {
    els.detailBody.innerHTML = `<tr><td colspan="6" class="empty-row">這個月份沒有任何記錄</td></tr>`;
    return;
  }

  els.detailBody.innerHTML = monthRecords.map((row) => `
    <tr>
      <td data-label="日期">${escapeHtml(row.date)}</td>
      <td data-label="類型">${escapeHtml(row.type)}</td>
      <td data-label="付款方式">${escapeHtml(row.payment)}</td>
      <td data-label="金額" class="amount">${formatMoney(row.amount)}</td>
      <td data-label="分類">${escapeHtml(row.category)}</td>
      <td data-label="說明">${escapeHtml(row.description)}</td>
    </tr>
  `).join("");
}

function renderEmptyViews() {
  els.paymentSummaryBody.innerHTML = `<tr><td colspan="2" class="empty-row">登入後自動載入</td></tr>`;
  els.detailBody.innerHTML = `<tr><td colspan="6" class="empty-row">登入後可查看本月明細</td></tr>`;
  els.categoryList.innerHTML = `<div class="empty-row">登入後可查看分類統計</div>`;
  els.incomeTotal.textContent = "0";
  els.expenseTotal.textContent = "0";
  els.remainingTotal.textContent = "0";
}

function clearCharts() {
  if (state.charts.incomeExpense) {
    state.charts.incomeExpense.destroy();
    state.charts.incomeExpense = null;
  }
  if (state.charts.category) {
    state.charts.category.destroy();
    state.charts.category = null;
  }
}

function updateCharts(monthRecords, incomeTotal, expenseTotal) {
  const expenseRecords = monthRecords.filter((r) => r.type === "支出");
  const categoryMap = aggregate(expenseRecords, (item) => item.category || "未分類");

  const categoryEntries = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const categoryLabels = categoryEntries.map(([name]) => name);
  const categoryValues = categoryEntries.map(([, amount]) => amount);

  clearCharts();

  state.charts.incomeExpense = new Chart(els.incomeExpenseChart, {
    type: "bar",
    data: {
      labels: ["收入", "支出"],
      datasets: [{
        label: "金額",
        data: [incomeTotal, expenseTotal],
        borderWidth: 0,
        borderRadius: 16
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "rgba(120, 96, 140, 0.12)" },
          ticks: {
            callback: (value) => formatMoney(value)
          }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });

  state.charts.category = new Chart(els.categoryChart, {
    type: "doughnut",
    data: {
      labels: categoryLabels.length ? categoryLabels : ["無資料"],
      datasets: [{
        data: categoryValues.length ? categoryValues : [1],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

/* =========================
   9) 表單事件
========================= */
async function handleAddRecord(event) {
  event.preventDefault();

  if (!state.accessToken) {
    setAddStatus("請先登入 Google", "warning");
    return;
  }

  const date = els.recordDate.value.trim();
  const type = els.recordType.value.trim();
  const category = els.recordCategory.value.trim();
  const payment = els.recordPayment.value.trim();
  const amount = Number(els.recordAmount.value);
  const description = els.recordDescription.value.trim();

  if (!date || !type || !category || !payment || !Number.isFinite(amount) || amount <= 0) {
    setAddStatus("請完整填寫資料", "warning");
    return;
  }

  const row = [
    String(Date.now()),
    date,
    type,
    payment,
    amount,
    category,
    description
  ];

  try {
    setAddStatus("寫入中...", "neutral");
    await appendRecord(row);
    setAddStatus("新增成功", "success");

    els.recordAmount.value = "";
    els.recordDescription.value = "";
    els.recordDescription.focus();

    await loadAllData();
  } catch (err) {
    console.error(err);
    setAddStatus("新增失敗", "danger");
  }
}

function handleMonthChange() {
  state.selectedMonth = els.monthFilter.value;
  renderDashboard();
}

/* =========================
   10) 工具函式
========================= */
function getMonthRecords(month) {
  return state.records.filter((r) => {
    if (!r.date || r.date.length < 7) return false;
    return r.date.slice(0, 7) === month;
  });
}

function getAvailableMonths() {
  const months = new Set(state.records
    .map((r) => (r.date && r.date.length >= 7 ? r.date.slice(0, 7) : null))
    .filter(Boolean));

  months.add(getCurrentMonth());

  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

function getCurrentMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMoney(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("zh-TW").format(n);
}

function sumBy(list, key) {
  return list.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
}

function aggregate(list, keyFn) {
  return list.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + (Number(item.amount) || 0);
    return acc;
  }, {});
}

function normalizeCell(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}