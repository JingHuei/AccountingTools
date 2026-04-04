
// TODO: 填入你的 Google API 金鑰與試算表 ID
const CLIENT_ID = '438080457387-bpn3tqlagvkl1ajrkr3ephj2unotcff5.apps.googleusercontent.com';
const SPREADSHEET_ID = '17YnCiTkjuRDi5-QSRttICBrAmkWup9dgPjMpYXE-v-s';

const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
let tokenClient, gapiInited = false, gisInited = false;

// 載入 gapi.js 時呼叫
function gapiLoaded() {
  gapi.load('client', async () => {
    await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
    gapiInited = true;
    maybeEnableButtons();
  });
}
// 載入 GIS JS 時呼叫
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: ''  // 稍後設定
  });
  gisInited = true;
  maybeEnableButtons();
}
// 當 gapi 和 GIS 都就緒時開啟登入按鈕
function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    document.getElementById('auth-button').style.display = 'inline-block';
    document.getElementById('auth-button').addEventListener('click', handleAuthClick);
    document.getElementById('signout-button').addEventListener('click', handleSignoutClick);
  }
}
// 登入並讀取欄位選項和本月資料
function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error) throw resp;
    document.getElementById('signout-button').style.display = 'inline-block';
    document.getElementById('auth-button').style.display = 'none';
    // 登入後載入下拉選單選項和初始化資料表
    await loadFieldOptions();
    await loadCurrentMonthRecords();
  };
  if (!gapi.client.getToken()) {
    // 若無權杖則請求使用者登入
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    // 若已有權杖，僅續期
    tokenClient.requestAccessToken({ prompt: '' });
  }
}
// 登出：撤銷權杖
function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    document.getElementById('signout-button').style.display = 'none';
    document.getElementById('auth-button').style.display = 'inline-block';
    // 清除顯示內容
    document.getElementById('records-table').getElementsByTagName('tbody')[0].innerHTML = '';
    document.getElementById('credit-list').innerHTML = '';
  }
}
// 載入欄位表選項 (Type/Category/Payment)
async function loadFieldOptions() {
  const range = '欄位表!A2:C';
  const resp = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const values = resp.result.values || [];
  const typeSel = document.getElementById('type');
  const catSel = document.getElementById('category');
  const paySel = document.getElementById('payment');
  // 擷取唯一選項
  const types = new Set(), cats = new Set(), pays = new Set();
  let lastType = '';
  values.forEach(row => {
    if (row[0]) lastType = row[0];
    if (lastType) types.add(lastType);
    if (row[1]) cats.add(row[1]);
    if (row[2]) pays.add(row[2]);
  });
  // 填入下拉選單
  types.forEach(t => typeSel.insertAdjacentHTML('beforeend', `<option>${t}</option>`));
  cats.forEach(c => catSel.insertAdjacentHTML('beforeend', `<option>${c}</option>`));
  pays.forEach(p => paySel.insertAdjacentHTML('beforeend', `<option>${p}</option>`));
}
// 新增記帳資料到試算表
async function addRecord() {
  const date = document.getElementById('date').value;
  const type = document.getElementById('type').value;
  const pay = document.getElementById('payment').value;
  const amt = document.getElementById('amount').value;
  const cat = document.getElementById('category').value;
  const desc = document.getElementById('description').value;
  if (!date || !type || !pay || !amt || !cat) {
    alert('請填寫所有必要欄位');
    return;
  }
  // 使用 timestamp 作為唯一 ID
  const id = Date.now();
  const values = [[id, date, type, pay, amt, cat, desc]];
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: '記帳紀錄!A:G',
      valueInputOption: 'RAW',
      resource: { values }
    });
    alert('記帳已新增！');
    // 新增後重新載入本月明細與統計
    await loadCurrentMonthRecords();
  } catch (err) {
    console.error(err);
    alert('新增失敗：' + err.result.error.message);
  }
}
document.getElementById('add-button').addEventListener('click', addRecord);

// 讀取本月明細並更新表格與信用卡統計
async function loadCurrentMonthRecords() {
  const today = new Date();
  // 預設為當前年月
  const year = today.getFullYear(), month = today.getMonth() + 1;
  // 使用月份篩選：例如 '2026-04'
  const monthStr = document.getElementById('month-select').value;
  let targetYear = year, targetMonth = month;
  if (monthStr) {
    [targetYear, targetMonth] = monthStr.split('-').map(x => parseInt(x));
  }
  // 讀取記帳紀錄 (A:G)
  const resp = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '記帳紀錄!A2:G'
  });
  const rows = resp.result.values || [];
  const tableBody = document.getElementById('records-table').getElementsByTagName('tbody')[0];
  tableBody.innerHTML = '';
  // 累計信用卡支出
  const creditTotals = {};
  let totalIncome = 0, totalExpense = 0;
  rows.forEach(row => {
    const [id, date, type, pay, amt, cat, desc] = row;
    if (!date) return;
    const rowDate = new Date(date);
    if (rowDate.getFullYear() === targetYear && rowDate.getMonth() + 1 === targetMonth) {
      // 加入明細表格
      const tr = tableBody.insertRow();
      tr.insertCell().innerText = date;
      tr.insertCell().innerText = type;
      tr.insertCell().innerText = pay;
      tr.insertCell().innerText = amt;
      tr.insertCell().innerText = cat;
      tr.insertCell().innerText = desc;
      // 計算總收入/支出
      const num = parseFloat(amt) || 0;
      if (type === '收入') totalIncome += num;
      else if (type === '支出') totalExpense += num;
      // 累積信用卡支出（假設付款方式含「信用卡」字樣即歸入）
      if (pay.includes('信用卡')) {
        creditTotals[pay] = (creditTotals[pay] || 0) + (type === '支出' ? num : 0);
      }
    }
  });
  // 更新信用卡列表
  const creditList = document.getElementById('credit-list');
  creditList.innerHTML = '';
  for (const bank in creditTotals) {
    const li = document.createElement('li');
    li.innerText = `${bank}: ${creditTotals[bank]}`;
    creditList.appendChild(li);
  }
  // 更新圖表（簡單示意：支出 vs 收入）
  drawCharts(totalIncome, totalExpense, creditTotals);
}
// 當月份選單變動時重新載入資料
document.getElementById('month-select').addEventListener('change', loadCurrentMonthRecords);

// 繪製圖表：此處用 Chart.js 產生簡單的圓餅圖和長條圖示範
function drawCharts(income, expense, creditData) {
  // 每月收入/支出長條圖
  const ctx1 = document.getElementById('expenseChart').getContext('2d');
  new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: ['收入', '支出'],
      datasets: [{ label: '金額', data: [income, expense], backgroundColor: ['#4caf50', '#f44336'] }]
    }
  });
  // 信用卡支出圓餅圖
  const ctx2 = document.getElementById('incomeChart').getContext('2d');
  const labels = Object.keys(creditData);
  const data = Object.values(creditData);
  new Chart(ctx2, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: ['#03A9F4', '#9C27B0', '#FF9800', '#E91E63', '#8BC34A'] }] }
  });
}
