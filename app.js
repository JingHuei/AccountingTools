
/* =========================
  🔧 設定區
========================= */
const CLIENT_ID = "438080457387-bpn3tqlagvkl1ajrkr3ephj2unotcff5.apps.googleusercontent.com";
const SPREADSHEET_ID = "17YnCiTkjuRDi5-QSRttICBrAmkWup9dgPjMpYXE-v-s;
const DISCOVERY_DOC = "https://sheets.googleapis.com/$discovery/rest?version=v4";
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

/* =========================
  🔐 Google 登入
========================= */
let tokenClient;
let gapiInited = false;

function gapiLoaded(){
  gapi.load('client', initGapiClient);
}

async function initGapiClient(){
  await gapi.client.init({
    discoveryDocs:[DISCOVERY_DOC],
  });
  gapiInited = true;
}

function handleAuth(){
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (resp)=>{
      await loadData();
    }
  });
  tokenClient.requestAccessToken();
}

function handleSignout(){
  google.accounts.oauth2.revoke();
}

/* =========================
  📥 載入資料
========================= */
let records = [];
let fields = [];

async function loadData(){
  // 讀記帳紀錄
  let res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "記帳紀錄!A2:G"
  });

  records = res.result.values || [];

  // 讀欄位表
  let res2 = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "欄位表!A2:C"
  });

  fields = res2.result.values || [];

  initDropdown();
  renderTable();
  renderChart();
  renderCards();
}

/* =========================
  🧩 下拉選單
========================= */
function initDropdown(){
  let typeSet = new Set();
  let categorySet = new Set();
  let paymentSet = new Set();

  fields.forEach(row=>{
    if(row[0]) typeSet.add(row[0]);
    if(row[1]) categorySet.add(row[1]);
    if(row[2]) paymentSet.add(row[2]);
  });

  fillSelect("type",typeSet);
  fillSelect("category",categorySet);
  fillSelect("payment",paymentSet);
}

function fillSelect(id,set){
  let el = document.getElementById(id);
  el.innerHTML = "";
  set.forEach(v=>{
    let opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
}

/* =========================
  ➕ 新增資料
========================= */
async function addRecord(){
  const row = [
    Date.now(),
    document.getElementById("date").value,
    document.getElementById("type").value,
    document.getElementById("payment").value,
    document.getElementById("amount").value,
    document.getElementById("category").value,
    document.getElementById("desc").value
  ];

  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "記帳紀錄!A:G",
    valueInputOption: "USER_ENTERED",
    resource: { values:[row] }
  });

  alert("新增成功！");
  loadData();
}

/* =========================
  📊 圖表
========================= */
function renderChart(){
  let income=0, expense=0;

  records.forEach(r=>{
    if(r[2]=="收入") income+=Number(r[4]);
    else expense+=Number(r[4]);
  });

  new Chart(document.getElementById("chart"),{
    type:"pie",
    data:{
      labels:["收入","支出"],
      datasets:[{
        data:[income,expense]
      }]
    }
  });
}

/* =========================
  💳 信用卡統計
========================= */
function renderCards(){
  let map = {};

  records.forEach(r=>{
    let pay = r[3];
    if(pay.includes("信用卡")){
      map[pay] = (map[pay]||0) + Number(r[4]);
    }
  });

  let ul = document.getElementById("cardList");
  ul.innerHTML="";

  for(let k in map){
    let li = document.createElement("li");
    li.textContent = k + "：" + map[k];
    ul.appendChild(li);
  }
}

/* =========================
  📋 表格
========================= */
function renderTable(){
  let tbody = document.getElementById("tableBody");
  tbody.innerHTML="";

  records.forEach(r=>{
    let tr = document.createElement("tr");
    r.slice(1).forEach(cell=>{
      let td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

gapiLoaded();