/* public/app.js — minimal SPA */
const $ = (sel) => document.querySelector(sel);
const app = $("#app");
const API = {
  base: "",
  token: localStorage.getItem("token") || ""
};
function authHeaders() {
  return API.token ? { "Authorization": "Bearer " + API.token, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
async function GET(p) { const r = await fetch(API.base + p, { headers: authHeaders() }); return r.json(); }
async function POST(p, b) { const r = await fetch(API.base + p, { method: "POST", headers: authHeaders(), body: JSON.stringify(b) }); return r.json(); }
async function PUT(p, b) { const r = await fetch(API.base + p, { method: "PUT", headers: authHeaders(), body: JSON.stringify(b) }); return r.json(); }

function viewLogin() {
  app.innerHTML = `
  <div class="min-h-screen grid place-items-center">
    <div class="bg-white border rounded-2xl p-6 shadow-sm w-full max-w-sm">
      <h1 class="text-xl font-semibold mb-4">เข้าสู่ระบบ</h1>
      <label class="block mb-2">
        <span class="text-xs text-slate-500">Email</span>
        <input id="email" class="w-full border rounded-xl px-3 py-2" value="admin@example.com">
      </label>
      <label class="block mb-4">
        <span class="text-xs text-slate-500">Password</span>
        <input id="password" type="password" class="w-full border rounded-xl px-3 py-2" value="admin123">
      </label>
      <button id="loginBtn" class="w-full py-2 rounded-xl bg-slate-900 text-white">Login</button>
    </div>
  </div>`;
  $("#loginBtn").onclick = async () => {
    const j = await POST("/api/auth/login", { email: $("#email").value, password: $("#password").value });
    if (!j.ok) return alert(j.error || "login failed");
    API.token = j.token; localStorage.setItem("token", j.token); viewHome();
  };
}

function layout(content) {
  return `
  <div class="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-xl bg-slate-900 text-white grid place-items-center font-bold">CRM</div>
        <div class="font-semibold">Mini CRM — Doors & Flooring</div>
      </div>
      <div class="flex items-center gap-2">
        <button data-tab="dashboard" class="tab px-3 py-1.5 rounded-xl border">แดชบอร์ด</button>
        <button data-tab="deals" class="tab px-3 py-1.5 rounded-xl border">ดีล</button>
        <button data-tab="companies" class="tab px-3 py-1.5 rounded-xl border">บริษัท</button>
        <button data-tab="contacts" class="tab px-3 py-1.5 rounded-xl border">บุคคล</button>
        <button data-tab="tasks" class="tab px-3 py-1.5 rounded-xl border">งาน</button>
        <div class="mx-2 text-slate-400">|</div>
        <button id="exportDeals" class="px-3 py-1.5 rounded-xl border">Export ดีล</button>
        <div class="mx-2 text-slate-400">|</div>
        <button id="logout" class="px-3 py-1.5 rounded-xl border">ออก</button>
      </div>
    </div>
  </div>
  <div class="max-w-7xl mx-auto p-4">
    ${content}
  </div>`;
}

async function viewHome() {
  app.innerHTML = layout(`
    <div id="panel"></div>
  `);
  $("#logout").onclick = () => { localStorage.removeItem("token"); location.reload(); };
  $("#exportDeals").onclick = () => window.open("/api/export/deals.csv","_blank");
  document.querySelectorAll(".tab").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("bg-slate-900","text-white"));
      btn.classList.add("bg-slate-900","text-white");
      const tab = btn.getAttribute("data-tab");
      if (tab === "dashboard") renderDashboard();
      if (tab === "deals") renderDeals();
      if (tab === "companies") renderCompanies();
      if (tab === "contacts") renderContacts();
      if (tab === "tasks") renderTasks();
    };
  });
  document.querySelector('[data-tab="dashboard"]').click();
}

async function renderDashboard() {
  const wrap = $("#panel");
  const k = await GET("/api/kpi"); if (!k.ok) { wrap.innerHTML = "โหลดไม่สำเร็จ"; return; }
  const d = k.data;
  wrap.innerHTML = `
    <div class="grid md:grid-cols-4 gap-3">
      <div class="bg-white border rounded-2xl p-4"><div class="text-xs text-slate-500">ดีลทั้งหมด</div><div class="text-2xl font-bold">${d.total}</div></div>
      <div class="bg-white border rounded-2xl p-4"><div class="text-xs text-slate-500">ชนะ</div><div class="text-2xl font-bold">${d.wonCount}</div></div>
      <div class="bg-white border rounded-2xl p-4"><div class="text-xs text-slate-500">มูลค่ารวม</div><div class="text-2xl font-bold">${d.estSum.toLocaleString()}</div></div>
      <div class="bg-white border rounded-2xl p-4"><div class="text-xs text-slate-500">ชนะ (มูลค่า)</div><div class="text-2xl font-bold">${d.wonSum.toLocaleString()}</div></div>
    </div>
    <div class="bg-white border rounded-2xl p-4 mt-4">
      <div class="font-semibold mb-2">สรุปตามสเตจ</div>
      <div class="grid grid-cols-6 gap-2">
        ${d.byStage.map(s => `<div class="border rounded-xl p-3 text-center"><div class="text-xs text-slate-500">${s.stage}</div><div class="text-xl font-semibold">${s.count}</div></div>`).join('')}
      </div>
    </div>
  `;
}

async function renderDeals() {
  const wrap = $("#panel");
  wrap.innerHTML = `
    <div class="bg-white border rounded-2xl p-4 shadow-sm mb-3">
      <div class="flex flex-wrap gap-2">
        <input id="q" placeholder="ค้นหา" class="border rounded-xl px-3 py-2" />
        <select id="stage" class="border rounded-xl px-3 py-2">
          <option value="">ทุกสเตจ</option>
          <option>new</option><option>qualify</option><option>proposal</option><option>negotiation</option><option>won</option><option>lost</option>
        </select>
        <button id="add" class="px-3 py-2 rounded-xl border">+ ดีลใหม่</button>
      </div>
    </div>
    <div id="list"></div>
  `;
  $("#add").onclick = () => modalDeal();
  $("#q").oninput = load; $("#stage").onchange = load;
  load();

  async function load() {
    const q = $("#q").value, stage = $("#stage").value;
    const j = await GET('/api/deals?' + new URLSearchParams({ q, stage }));
    if (!j.ok) return; const rows = j.data;
    $("#list").innerHTML = `
      <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${rows.map(x => `
          <div class="bg-white border rounded-2xl p-4">
            <div class="font-semibold">${x.title || '-'}</div>
            <div class="text-xs text-slate-500">฿${(Number(x.value)||0).toLocaleString()} · ${x.stage}</div>
            <div class="mt-2 flex gap-2">
              <select data-stage="${x.id}" class="border rounded-lg px-2 py-1 text-sm">
                ${['new','qualify','proposal','negotiation','won','lost'].map(s=>`<option ${s===x.stage?'selected':''}>${s}</option>`).join('')}
              </select>
              <button data-edit="${x.id}" class="border rounded-lg px-2 py-1 text-sm">แก้</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => modalDeal(rows.find(r => r.id === b.getAttribute('data-edit'))));
    document.querySelectorAll('[data-stage]').forEach(s => s.onchange = async () => {
      const id = s.getAttribute('data-stage'); const stage = s.value;
      const r = await POST('/api/deals/' + id + '/move', { stage }); if (!r.ok) alert(r.error || 'ไม่สำเร็จ'); else load();
    });
  }
  async function modalDeal(row={}) {
    const title = prompt("ชื่อดีล", row.title || "");
    if (title == null) return;
    const value = Number(prompt("มูลค่า", row.value || 0) || 0);
    if (row.id) {
      const r = await PUT('/api/deals/' + row.id, { title, value }); if (!r.ok) return alert(r.error || 'ไม่สำเร็จ');
    } else {
      const r = await POST('/api/deals', { title, value }); if (!r.ok) return alert(r.error || 'สร้างไม่สำเร็จ');
    }
    load();
  }
}

async function renderCompanies() {
  const wrap = $("#panel");
  wrap.innerHTML = `
    <div class="bg-white border rounded-2xl p-4 shadow-sm mb-3">
      <div class="flex flex-wrap gap-2">
        <input id="q" placeholder="ค้นหา" class="border rounded-xl px-3 py-2" />
        <button id="add" class="px-3 py-2 rounded-xl border">+ บริษัทใหม่</button>
      </div>
    </div>
    <div class="bg-white border rounded-2xl p-4 shadow-sm overflow-x-auto">
      <table class="min-w-full text-sm" id="tbl">
        <thead><tr class="bg-slate-50"><th class="p-2">ชื่อ</th><th class="p-2">เบอร์</th><th class="p-2">ที่อยู่</th><th class="p-2"></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  `;
  $("#add").onclick = () => modal();
  $("#q").oninput = load;
  load();

  async function load() {
    const q = $("#q").value; const j = await GET('/api/companies?' + new URLSearchParams({ q }));
    if (!j.ok) return; const tb = $("#tbl tbody"); tb.innerHTML = "";
    j.data.forEach(c => {
      const tr = document.createElement('tr'); tr.className = 'border-t';
      tr.innerHTML = `<td class="p-2">${c.name || ''}</td><td class="p-2">${c.phone || ''}</td><td class="p-2">${c.address || ''}</td>
                      <td class="p-2"><button data-edit="${c.id}" class="border rounded px-2 py-1">แก้</button></td>`;
      tb.appendChild(tr);
    });
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => modal(j.data.find(x => x.id === b.getAttribute('data-edit'))));
  }
  async function modal(row={}) {
    const name = prompt("ชื่อบริษัท", row.name || ""); if (name == null) return;
    const phone = prompt("เบอร์", row.phone || ""); if (phone == null) return;
    const address = prompt("ที่อยู่", row.address || ""); if (address == null) return;
    if (row.id) {
      const r = await PUT('/api/companies/' + row.id, { name, phone, address }); if (!r.ok) return alert(r.error || 'ไม่สำเร็จ');
    } else {
      const r = await POST('/api/companies', { name, phone, address }); if (!r.ok) return alert(r.error || 'สร้างไม่สำเร็จ');
    }
    load();
  }
}

async function renderContacts() {
  const wrap = $("#panel");
  wrap.innerHTML = `
    <div class="bg-white border rounded-2xl p-4 shadow-sm mb-3">
      <div class="flex flex-wrap gap-2">
        <input id="q" placeholder="ค้นหา" class="border rounded-xl px-3 py-2" />
        <button id="add" class="px-3 py-2 rounded-xl border">+ บุคคลใหม่</button>
      </div>
    </div>
    <div class="bg-white border rounded-2xl p-4 shadow-sm overflow-x-auto">
      <table class="min-w-full text-sm" id="tbl">
        <thead><tr class="bg-slate-50"><th class="p-2">ชื่อ</th><th class="p-2">อีเมล</th><th class="p-2">โทร</th><th class="p-2"></th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  `;
  $("#add").onclick = () => modal();
  $("#q").oninput = load;
  load();

  async function load() {
    const q = $("#q").value; const j = await GET('/api/contacts?' + new URLSearchParams({ q }));
    if (!j.ok) return; const tb = $("#tbl tbody"); tb.innerHTML = "";
    j.data.forEach(c => {
      const tr = document.createElement('tr'); tr.className = 'border-t';
      tr.innerHTML = `<td class="p-2">${c.full_name || ''}</td><td class="p-2">${c.email || ''}</td><td class="p-2">${c.phone || ''}</td>
                      <td class="p-2"><button data-edit="${c.id}" class="border rounded px-2 py-1">แก้</button></td>`;
      tb.appendChild(tr);
    });
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => modal(j.data.find(x => x.id === b.getAttribute('data-edit'))));
  }
  async function modal(row={}) {
    const full_name = prompt("ชื่อ-สกุล", row.full_name || ""); if (full_name == null) return;
    const email = prompt("อีเมล", row.email || ""); if (email == null) return;
    const phone = prompt("โทร", row.phone || ""); if (phone == null) return;
    if (row.id) {
      const r = await PUT('/api/contacts/' + row.id, { full_name, email, phone }); if (!r.ok) return alert(r.error || 'ไม่สำเร็จ');
    } else {
      const r = await POST('/api/contacts', { full_name, email, phone }); if (!r.ok) return alert(r.error || 'สร้างไม่สำเร็จ');
    }
    load();
  }
}

async function renderTasks() {
  const wrap = $("#panel");
  wrap.innerHTML = `
    <div class="bg-white border rounded-2xl p-4 shadow-sm mb-3">
      <div class="flex flex-wrap gap-2">
        <input id="q" placeholder="ค้นหา" class="border rounded-xl px-3 py-2" />
        <button id="add" class="px-3 py-2 rounded-xl border">+ เพิ่มงาน</button>
      </div>
    </div>
    <div id="list"></div>
  `;
  $("#add").onclick = () => modal();
  $("#q").oninput = load;
  load();

  async function load() {
    const q = $("#q").value; const j = await GET('/api/activities?' + new URLSearchParams({ q }));
    if (!j.ok) return; const rows = j.data;
    $("#list").innerHTML = rows.map(a => `
      <div class="bg-white border rounded-2xl p-3 shadow-sm mb-2 flex items-center justify-between">
        <div><div class="font-medium">${a.type || 'task'} · ${a.due_at || ''}</div><div class="text-xs text-slate-500">${a.note || ''}</div></div>
        <div class="flex gap-2">
          <button data-done="${a.id}" class="border rounded-lg px-2 py-1 text-sm">${a.done ? '✓ เสร็จแล้ว' : 'ทำเสร็จ'}</button>
          <button data-edit="${a.id}" class="border rounded-lg px-2 py-1 text-sm">แก้</button>
        </div>
      </div>
    `).join('');
    document.querySelectorAll('[data-done]').forEach(b => b.onclick = async () => { const id = b.getAttribute('data-done'); const r = await PUT('/api/activities/'+id, { done: true }); if (!r.ok) return alert(r.error||'ไม่สำเร็จ'); load(); });
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => modal(rows.find(x => x.id === b.getAttribute('data-edit'))));
  }

  async function modal(row={}) {
    const type = prompt("ประเภท (call/meet/note/task)", row.type || "task"); if (type == null) return;
    const due_at = prompt("กำหนดเสร็จ (YYYY-MM-DD)", row.due_at || ""); if (due_at == null) return;
    const note = prompt("รายละเอียด", row.note || ""); if (note == null) return;
    if (row.id) {
      const r = await PUT('/api/activities/' + row.id, { type, due_at, note }); if (!r.ok) return alert(r.error || 'ไม่สำเร็จ');
    } else {
      const r = await POST('/api/activities', { type, due_at, note }); if (!r.ok) return alert(r.error || 'สร้างไม่สำเร็จ');
    }
    load();
  }
}

// boot
(async () => {
  if (!localStorage.getItem("token")) return viewLogin();
  const me = await GET("/api/me"); if (!me.ok) return viewLogin();
  viewHome();
})();
