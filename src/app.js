// Frontend connected to the Express API. For split hosting, define window.SCHOOL_API_BASE before this script.
const API_BASE = window.SCHOOL_API_BASE || '';
const token = sessionStorage.getItem('sms_token');
const storedUser = sessionStorage.getItem('sms_user');
if (!token || !storedUser) window.location.replace('login.html');
const user = (() => { try { return JSON.parse(storedUser || '{}'); } catch { return {}; } })();
const DEFAULT_SETTINGS = { schoolName: 'School Manager', logoUrl: '', address: '', phone: '', email: '', academicYear: new Date().getFullYear(), currency: 'BDT', timezone: 'Asia/Dhaka' };
let settings = {...DEFAULT_SETTINGS};
let students = [];
const $ = id => document.getElementById(id);
async function api(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {'Authorization':'Bearer '+token, 'Content-Type':'application/json', ...(options.headers || {})}
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { sessionStorage.clear(); window.location.replace('login.html'); throw new Error('সেশন শেষ হয়েছে, আবার লগইন করুন।'); }
  if (!response.ok) throw new Error(data.error || 'অনুরোধ সম্পন্ন হয়নি');
  return data;
}
function toast(message) {
  const target = $('toast');
  if (target) { target.textContent = message; target.classList.remove('hidden'); setTimeout(() => target.classList.add('hidden'), 2600); }
  else alert(message);
}
function renderSettings() {
  $('sidebarSchoolName').textContent = settings.schoolName || 'School Manager';
  $('welcomeName').textContent = settings.schoolName || 'School Manager';
  $('brandMark').textContent = (settings.schoolName || 'S').trim().charAt(0).toUpperCase() || 'S';
  $('yearCount').textContent = settings.academicYear || '—';
  $('profileStatus').textContent = settings.schoolName && settings.address && settings.phone ? 'প্রস্তুত' : 'অসম্পূর্ণ';
  const form = $('settingsForm');
  Object.keys(settings).forEach(k => { if (form.elements[k]) form.elements[k].value = settings[k] ?? ''; });
  ['logoUrl','address','phone','email'].forEach(k => { if (form.elements[k]) form.elements[k].value = settings[k] || ''; });
}
function renderStudents() {
  $('studentCount').textContent = students.length;
  $('studentRows').innerHTML = '';
  $('emptyStudents').classList.toggle('hidden', students.length > 0);
  students.forEach(s => {
    const tr = document.createElement('tr');
    [s.name, s.class_name || s.className, s.roll, s.guardian_phone || s.phone || '—'].forEach(v => {
      const td = document.createElement('td'); td.textContent = v ?? '—'; tr.appendChild(td);
    });
    $('studentRows').appendChild(tr);
  });
}
function showView(view) {
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  $(view + 'View').classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $('pageTitle').textContent = ({dashboard:'ড্যাশবোর্ড',students:'শিক্ষার্থী',settings:'অ্যাডমিন সেটিংস'})[view];
}
document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => { showView(btn.dataset.view); if (btn.dataset.view === 'fees') loadFees(); }));
document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.go)));
const logout = document.createElement('button');
logout.className = 'secondary'; logout.textContent = 'লগআউট'; logout.style.marginLeft = '12px';
logout.addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'login.html'; });
document.querySelector('.topbar').appendChild(logout);
const adminOnly = user.role === 'admin';
document.querySelectorAll('[data-view="settings"]').forEach(el => el.classList.toggle('hidden', !adminOnly));
const financeRole = ['admin','accountant'].includes(user.role);
document.querySelectorAll('[data-view="fees"]').forEach(el => el.classList.toggle('hidden', !financeRole));
if (!financeRole) $('feesView').classList.add('hidden');
$('settingsForm').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    data.academicYear = Number(data.academicYear);
    const result = await api('/api/settings', {method:'PUT',body:JSON.stringify(data)});
    settings = {...DEFAULT_SETTINGS,...result.settings,academicYear:Number(result.settings.academicYear || DEFAULT_SETTINGS.academicYear)};
    renderSettings(); toast('স্কুলের সেটিংস সার্ভারে সংরক্ষণ হয়েছে');
  } catch (error) { toast(error.message); }
});
$('showStudentForm').addEventListener('click', () => $('studentForm').classList.toggle('hidden'));
$('cancelStudent').addEventListener('click', () => { $('studentForm').reset(); $('studentForm').classList.add('hidden'); });
function money(value) { return '৳' + Number(value || 0).toLocaleString('en-BD',{maximumFractionDigits:2}); }
function fillFeeStudents() {
  const select=$('feeStudent'); if(!select)return;
  select.innerHTML='<option value="">শিক্ষার্থী নির্বাচন করুন</option>';
  students.forEach(st=>{const o=document.createElement('option');o.value=st.id;o.textContent=`${st.name} — ${st.class_name}, রোল ${st.roll}`;select.appendChild(o);});
}
function renderFees(fees) {
  const total=fees.reduce((n,f)=>n+Number(f.amount),0), collected=fees.reduce((n,f)=>n+Number(f.paid_amount),0);
  $('feeTotal').textContent=money(total); $('feeCollected').textContent=money(collected); $('feeDue').textContent=money(total-collected);
  const body=$('feeRows'); body.innerHTML=''; $('emptyFees').classList.toggle('hidden',fees.length>0);
  fees.forEach(f=>{
    const tr=document.createElement('tr');
    const values=[f.student_name,`${f.description} (${f.fee_type||'other'})`,money(f.amount),money(f.paid_amount),money(Number(f.amount)-Number(f.paid_amount)),f.status==='paid'?'পরিশোধিত':f.status==='partial'?'আংশিক':'বকেয়া'];
    values.forEach(v=>{const td=document.createElement('td');td.textContent=v??'—';tr.appendChild(td);});
    const action=document.createElement('td');
    if(Number(f.amount)>Number(f.paid_amount)){
      const btn=document.createElement('button');btn.className='primary';btn.textContent='পেমেন্ট নিন';
      btn.addEventListener('click',()=>recordFeePayment(f));action.appendChild(btn);
    } else { action.textContent='—'; }
    const receipt=document.createElement('button');receipt.className='secondary';receipt.style.marginLeft='6px';receipt.textContent='রসিদ';
    receipt.addEventListener('click',()=>showFeeHistory(f));action.appendChild(receipt);
    tr.appendChild(action);body.appendChild(tr);
  });
}
async function loadFees() {
  if(!financeRole)return;
  try { const [feeResult]=await Promise.all([api('/api/fees')]); renderFees(feeResult.fees||[]); }
  catch(error){toast(error.message);}
}
async function recordFeePayment(fee) {
  const remaining=Number(fee.amount)-Number(fee.paid_amount);
  const raw=prompt(`কত টাকা গ্রহণ করা হয়েছে? বাকি: ${money(remaining)}`,String(remaining));
  if(raw===null)return;
  const amount=Number(raw);if(!Number.isFinite(amount)||amount<=0){toast('সঠিক টাকার পরিমাণ লিখুন');return;}
  const methodRaw=prompt('পেমেন্ট মাধ্যম লিখুন: cash / bank / bkash / nagad','cash');
  if(methodRaw===null)return;
  const method=methodRaw.trim().toLowerCase();
  if(!['cash','bank','bkash','nagad'].includes(method)){toast('মাধ্যম লিখুন cash, bank, bkash অথবা nagad');return;}
  const reference=prompt('ট্রানজেকশন আইডি (না থাকলে ফাঁকা রাখুন)','')||'';
  try {
    const result=await api(`/api/fees/${fee.id}/payment`,{method:'POST',body:JSON.stringify({amount,method,reference})});
    toast(`পেমেন্ট সংরক্ষিত। রসিদ নম্বর: ${result.receipt.receipt_no}`); await loadFees();
  } catch(error){toast(error.message);}
}
async function showFeeHistory(fee) {
  try {
    const result=await api(`/api/fees/${fee.id}/payments`);
    const lines=(result.payments||[]).map(p=>`${p.receipt_no} — ${money(p.amount)} — ${p.method} — ${p.created_at}`);
    alert(lines.length?lines.join('\\n'):'এই ফি-এর কোনো পেমেন্ট রেকর্ড নেই।');
  } catch(error){toast(error.message);}
}
$('feeForm').addEventListener('submit',async e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());data.amount=Number(data.amount);
  try{await api('/api/fees',{method:'POST',body:JSON.stringify(data)});e.currentTarget.reset();toast('ফি যোগ হয়েছে');await loadFees();}
  catch(error){toast(error.message);}
});
$('refreshFees').addEventListener('click',loadFees);
$('studentForm').addEventListener('submit', async e => {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  try {
    await api('/api/students', {method:'POST',body:JSON.stringify({name:data.get('name'),class_name:data.get('className'),roll:data.get('roll'),guardian_phone:data.get('phone')})});
    await refreshStudents(); e.currentTarget.reset(); e.currentTarget.classList.add('hidden'); toast('শিক্ষার্থীর তথ্য সার্ভারে সংরক্ষণ হয়েছে');
  } catch (error) { toast(error.message); }
});
async function refreshStudents() {
  const result = await api('/api/students?status=all');
  students = result.students || []; renderStudents(); fillFeeStudents();
}
async function init() {
  try {
    const [me, settingsResult, dashboard] = await Promise.all([
      api('/api/auth/me'), api('/api/settings'), api('/api/dashboard')
    ]);
    sessionStorage.setItem('sms_user', JSON.stringify(me.user));
    settings = {...DEFAULT_SETTINGS,...settingsResult.settings,academicYear:Number(settingsResult.settings.academicYear || DEFAULT_SETTINGS.academicYear)};
    const roleLabel = {admin:'Administrator',teacher:'Teacher',student:'Student',guardian:'Guardian',accountant:'Accountant'};
    document.querySelector('.admin-chip b').textContent = me.user.name;
    document.querySelector('.admin-chip small').textContent = roleLabel[me.user.role] || me.user.role;
    $('studentCount').textContent = dashboard.students;
    $('yearCount').textContent = settings.academicYear;
    renderSettings(); await refreshStudents();
    if (!adminOnly) $('settingsView').classList.add('hidden');
    if (financeRole) await loadFees();
  } catch (error) { toast(error.message); }
}
init();
