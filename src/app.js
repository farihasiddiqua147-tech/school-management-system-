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
    [s.name, s.class_name || s.className, s.roll, s.guardian_phone || s.phone || '—', s.user_id ? 'অ্যাকাউন্ট আছে' : 'নেই'].forEach(v => {
      const td = document.createElement('td'); td.textContent = v ?? '—'; tr.appendChild(td);
    });
    const action=document.createElement('td');
    if(adminOnly && s.status==='active'){
      const btn=document.createElement('button');btn.className='secondary';btn.textContent='নিষ্ক্রিয় করুন';
      btn.addEventListener('click',async()=>{if(!confirm('এই শিক্ষার্থীর অ্যাকাউন্ট নিষ্ক্রিয় করবেন? পুরোনো রেকর্ড থাকবে।'))return;try{await api('/api/students/'+s.id+'/deactivate',{method:'POST'});await refreshStudents();toast('শিক্ষার্থী অ্যাকাউন্ট নিষ্ক্রিয় হয়েছে');}catch(error){toast(error.message);}});
      action.appendChild(btn);
    } else action.textContent=s.status==='inactive'?'নিষ্ক্রিয়':'—';
    tr.appendChild(action); $('studentRows').appendChild(tr);
  });
}
function showView(view) {
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  $(view + 'View').classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $('pageTitle').textContent = ({dashboard:'ড্যাশবোর্ড',students:'শিক্ষার্থী',studentPortal:'আমার প্যানেল',teacherPortal:'টিচার প্যানেল',fees:'বেতন ও ফি',notices:'নোটিশ',settings:'অ্যাডমিন সেটিংস'})[view];
}
document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => { showView(btn.dataset.view); if (btn.dataset.view === 'fees') loadFees(); if (btn.dataset.view === 'notices') loadNotices(); }));
document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.go)));
const logout = document.createElement('button');
logout.className = 'secondary'; logout.textContent = 'লগআউট'; logout.style.marginLeft = '12px';
logout.addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'login.html'; });
document.querySelector('.topbar').appendChild(logout);
const adminOnly = user.role === 'admin';
const studentOnly = user.role === 'student';
const teacherOnly = user.role === 'teacher';
document.querySelectorAll('[data-view="studentPortal"]').forEach(el=>el.classList.toggle('hidden',!studentOnly));
document.querySelectorAll('[data-view="teacherPortal"]').forEach(el=>el.classList.toggle('hidden',!teacherOnly));
document.querySelectorAll('[data-view="students"]').forEach(el=>el.classList.toggle('hidden',studentOnly));
document.querySelectorAll('[data-view="dashboard"]').forEach(el=>el.classList.toggle('hidden',studentOnly||teacherOnly));
document.querySelectorAll('[data-view="settings"]').forEach(el => el.classList.toggle('hidden', !adminOnly));
const financeRole = ['admin','accountant'].includes(user.role);
const studentManagementRole = ['admin','teacher'].includes(user.role);
$('showStudentForm').classList.toggle('hidden', !studentManagementRole);
document.querySelectorAll('.quick-card[data-go="students"]').forEach(el => el.classList.toggle('hidden', !studentManagementRole));
document.querySelectorAll('.quick-card[data-go="settings"]').forEach(el => el.classList.toggle('hidden', !adminOnly));
document.querySelectorAll('[data-view="fees"]').forEach(el => el.classList.toggle('hidden', !financeRole));
if (!financeRole) $('feesView').classList.add('hidden');

const noticeCreatePanel = $('noticeCreatePanel');
const canPublishNotices = ['admin','teacher'].includes(user.role);
noticeCreatePanel.classList.toggle('hidden', !canPublishNotices);
async function loadNotices() {
  const list=$('noticeList');
  list.replaceChildren();
  try {
    const data=await api('/api/notices');
    const notices=data.notices||[];
    if(!notices.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='এখনো কোনো নোটিশ নেই।';list.appendChild(empty);return;}
    notices.forEach(n=>{
      const card=document.createElement('article');card.className='panel';
      const heading=document.createElement('h3');heading.textContent=n.title;
      const body=document.createElement('p');body.textContent=n.body;
      const meta=document.createElement('small');meta.className='muted';meta.textContent=(n.audience==='all'?'সবার জন্য':n.audience)+' · '+(n.created_at||'');
      card.append(heading,body,meta);list.appendChild(card);
    });
  } catch(error) { const message=document.createElement('p');message.className='empty';message.textContent=error.message;list.appendChild(message); }
}
$('refreshNotices').addEventListener('click',loadNotices);
$('noticeForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!canPublishNotices)return;
  const data=Object.fromEntries(new FormData(e.currentTarget).entries());
  try { await api('/api/notices',{method:'POST',body:JSON.stringify(data)});e.currentTarget.reset();toast('নোটিশ প্রকাশ হয়েছে');await loadNotices(); }
  catch(error){toast(error.message);}
});

const gatewayForm = $('gatewayForm');
let gatewayConfigs = {};
function showGatewayProvider() {
  const provider = $('gatewayProvider').value;
  $('bkashCredentialFields').classList.toggle('hidden', provider !== 'bkash');
  $('nagadCredentialFields').classList.toggle('hidden', provider !== 'nagad');
  const config = gatewayConfigs[provider] || {};
  $('gatewayMerchantId').value = config.merchantId || '';
  $('gatewayEnabled').value = config.enabled ? 'true' : 'false';
  gatewayForm.querySelectorAll('input[type="password"], textarea').forEach(field => { field.value = ''; });
  const status = config.configured ? 'আগে প্রয়োজনীয় তথ্য সংরক্ষিত আছে। পরিবর্তন করতে নতুন তথ্য লিখুন।' : 'এখনও সব প্রয়োজনীয় Merchant তথ্য সংরক্ষণ করা হয়নি।';
  $('gatewayStatus').textContent = status + ' নিরাপত্তার জন্য পুরোনো Secret আবার দেখানো হয় না।';
}
async function loadGatewaySettings() {
  if (!adminOnly) return;
  try {
    const result = await api('/api/payment-gateways');
    gatewayConfigs = result.gateways || {};
    showGatewayProvider();
  } catch (error) { $('gatewayStatus').textContent = error.message; }
}
$('gatewayProvider').addEventListener('change', showGatewayProvider);
gatewayForm.addEventListener('submit', async e => {
  e.preventDefault();
  const provider = $('gatewayProvider').value;
  const credentials = {};
  gatewayFieldsForProvider(provider).forEach(key => {
    const field = gatewayForm.elements[key];
    if (field && field.value.trim()) credentials[key] = field.value;
  });
  const payload = {merchantId:$('gatewayMerchantId').value.trim(), enabled:$('gatewayEnabled').value === 'true', credentials};
  try {
    const result = await api('/api/payment-gateways/' + provider, {method:'PUT', body:JSON.stringify(payload)});
    toast(result.message || 'গেটওয়ে সেটিংস সংরক্ষিত হয়েছে');
    await loadGatewaySettings();
  } catch (error) { toast(error.message); }
});
function gatewayFieldsForProvider(provider) {
  return provider === 'bkash' ? ['appKey','appSecret','username','password'] : ['merchantPrivateKey','pgPublicKey'];
}

$('teacherForm').addEventListener('submit',async e=>{
 e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());
 try{const result=await api('/api/staff',{method:'POST',body:JSON.stringify(data)});e.currentTarget.reset();toast('শিক্ষক অ্যাকাউন্ট তৈরি হয়েছে: '+result.staff.name);}
 catch(error){toast(error.message);}
});
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
    await api('/api/students', {method:'POST',body:JSON.stringify({name:data.get('name'),class_name:data.get('className'),roll:data.get('roll'),guardian_phone:data.get('phone'),email:data.get('email'),password:data.get('password')})});
    await refreshStudents(); e.currentTarget.reset(); e.currentTarget.classList.add('hidden'); toast('শিক্ষার্থীর তথ্য সার্ভারে সংরক্ষণ হয়েছে');
  } catch (error) { toast(error.message); }
});
async function refreshStudents() {
  const result = await api('/api/students?status=all');
  students = result.students || []; renderStudents(); fillFeeStudents();
}
async function loadStudentPortal() {
  const data=await api('/api/student/me'), st=data.student;
  $('studentProfile').textContent=`${st.name} · ${st.class_name} · রোল ${st.roll} · আইডি ${st.student_code||st.id}`;
  const attendanceRecords=data.attendance||[], present=attendanceRecords.filter(x=>['present','late'].includes(x.status)).length;
  $('studentAttendanceRate').textContent=attendanceRecords.length?Math.round(present/attendanceRecords.length*100)+'%':'—';
  const feeRecords=data.fees||[], due=feeRecords.reduce((n,f)=>n+Math.max(0,Number(f.amount)-Number(f.paid_amount)),0);
  $('studentDueTotal').textContent=money(due);
  const resultsForAverage=data.results||[], averageMax=resultsForAverage.reduce((n,r)=>n+Number(r.max_marks||0),0),averageMarks=resultsForAverage.reduce((n,r)=>n+Number(r.marks||0),0);
  $('studentAverage').textContent=averageMax?Math.round(averageMarks/averageMax*100)+'%':'—';
  const feeTable=$('studentFeeRows');feeTable.innerHTML='';
  (data.fees||[]).forEach(f=>{const tr=document.createElement('tr');[f.description,money(f.amount),money(f.paid_amount),money(Number(f.amount)-Number(f.paid_amount)),f.status==='paid'?'পরিশোধিত':f.status==='partial'?'আংশিক':'বকেয়া'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});feeTable.appendChild(tr);});
  const results=$('studentResultRows');results.innerHTML='';(data.results||[]).forEach(r=>{const tr=document.createElement('tr');[r.exam_name,r.subject,r.marks,r.max_marks].forEach(v=>{const td=document.createElement('td');td.textContent=v??'—';tr.appendChild(td);});results.appendChild(tr);});
  const attendanceTable=$('studentAttendanceRows');attendanceTable.innerHTML='';(data.attendance||[]).forEach(r=>{const tr=document.createElement('tr');[r.attendance_date,r.status,r.note||'—'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});attendanceTable.appendChild(tr);});
  $('studentHomework').textContent=(data.homework||[]).map(h=>h.title+' · '+h.subject+' · '+(h.due_date||'তারিখ নেই')).join(' | ')||'এখনো কোনো হোমওয়ার্ক নেই';
  const routine=$('studentRoutineRows');routine.innerHTML='';(data.timetable||[]).forEach(r=>{const tr=document.createElement('tr');[r.weekday,r.period,r.subject,[r.starts_at,r.ends_at].filter(Boolean).join('–')||'—',r.room||'—'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});routine.appendChild(tr);});
}
async function loadTeacherPortal() {
  const data=await api('/api/teacher/me');
  $('teacherProfile').textContent=data.teacher.name+' · '+data.teacher.designation;
  $('teacherClasses').textContent='দায়িত্বপ্রাপ্ত ক্লাস: '+((data.classes||[]).join(', ')||'এখনো ক্লাস বরাদ্দ হয়নি। অ্যাডমিনকে রুটিনে দায়িত্ব দিতে বলুন।');
  const select=$('teacherClass');select.innerHTML='<option value="">ক্লাস নির্বাচন করুন</option>';
  (data.classes||[]).forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;select.appendChild(o);});
  const date=$('teacherDate');date.value=new Date().toISOString().slice(0,10);
  const routine=await api('/api/teacher/timetable');const body=$('teacherRoutineRows');body.innerHTML='';
  (routine.timetable||[]).forEach(r=>{const tr=document.createElement('tr');[r.class_name,r.weekday,r.period,r.subject,[r.starts_at,r.ends_at].filter(Boolean).join('–')||'—',r.room||'—'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.appendChild(td);});body.appendChild(tr);});
  await loadTeacherExams();
}


// Teacher dashboard workflows
let teacherStudents=[];
async function loadTeacherAttendance(){
 const className=$('teacherClass').value,date=$('teacherDate').value;
 if(!className||!date){toast('ক্লাস ও তারিখ নির্বাচন করুন');return;}
 try{const data=await api('/api/teacher/attendance?class_name='+encodeURIComponent(className)+'&date='+encodeURIComponent(date));const body=$('teacherAttendanceRows');body.innerHTML='';$('teacherAttendanceEmpty').classList.toggle('hidden',data.students.length>0);
 data.students.forEach(st=>{const tr=document.createElement('tr');const roll=document.createElement('td');roll.textContent=st.roll;const name=document.createElement('td');name.textContent=st.name;const cell=document.createElement('td');const select=document.createElement('select');select.dataset.studentId=st.id;[['present','উপস্থিত'],['absent','অনুপস্থিত'],['late','বিলম্ব'],['leave','ছুটি']].forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;select.appendChild(o);});select.value=st.status||'present';cell.appendChild(select);tr.append(roll,name,cell);body.appendChild(tr);});
 teacherStudents=data.students;
 const studentSelect=$('teacherMarkStudent');studentSelect.innerHTML='<option value="">শিক্ষার্থী নির্বাচন</option>';data.students.forEach(st=>{const o=document.createElement('option');o.value=st.id;o.textContent=st.name+' — '+st.roll;studentSelect.appendChild(o);});
 }catch(e){toast(e.message);}
}
$('loadTeacherAttendance').addEventListener('click',loadTeacherAttendance);
$('saveTeacherAttendance').addEventListener('click',async()=>{const date=$('teacherDate').value;const records=[...$('teacherAttendanceRows').querySelectorAll('select[data-student-id]')].map(x=>({student_id:Number(x.dataset.studentId),status:x.value}));if(!records.length){toast('আগে শিক্ষার্থী লোড করুন');return;}try{await api('/api/attendance/bulk',{method:'POST',body:JSON.stringify({date,records})});toast('উপস্থিতি সংরক্ষণ হয়েছে');}catch(e){toast(e.message);}});
$('teacherHomeworkForm').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());data.class_name=$('teacherClass').value;if(!data.class_name){toast('ক্লাস নির্বাচন করুন');return;}try{await api('/api/homework',{method:'POST',body:JSON.stringify(data)});e.currentTarget.reset();toast('হোমওয়ার্ক প্রকাশ হয়েছে');}catch(err){toast(err.message);}});
$('teacherExamForm').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());data.class_name=$('teacherClass').value;if(!data.class_name){toast('ক্লাস নির্বাচন করুন');return;}try{const r=await api('/api/exams',{method:'POST',body:JSON.stringify(data)});e.currentTarget.reset();await loadTeacherExams();$('teacherExamSelect').value=r.exam.id;toast('পরীক্ষা তৈরি হয়েছে');}catch(err){toast(err.message);}});
async function loadTeacherExams(){try{const r=await api('/api/exams');const sel=$('teacherExamSelect');sel.innerHTML='<option value="">পরীক্ষা নির্বাচন</option>';(r.exams||[]).filter(x=>x.class_name===$('teacherClass').value).forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.name+' · '+(x.exam_date||'তারিখ নেই');sel.appendChild(o);});}catch(e){toast(e.message);}}
$('teacherMarksForm').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());data.marks=Number(data.marks);data.max_marks=Number(data.max_marks);try{await api('/api/results',{method:'POST',body:JSON.stringify(data)});toast('নম্বর সংরক্ষণ হয়েছে');e.currentTarget.reset();}catch(err){toast(err.message);}});
$('teacherClass').addEventListener('change',async()=>{await loadTeacherAttendance();await loadTeacherExams();});
$('routineAssignForm').addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());data.period=Number(data.period);try{await api('/api/timetable',{method:'POST',body:JSON.stringify(data)});toast('শিক্ষকের ক্লাস রুটিন বরাদ্দ হয়েছে');}catch(err){toast(err.message);}});
async function loadRoutineTeachers(){try{const r=await api('/api/staff');const sel=$('routineTeacher');sel.innerHTML='<option value="">শিক্ষক নির্বাচন</option>';(r.staff||[]).filter(x=>x.active&&x.user_id).forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.name+' — '+x.designation;sel.appendChild(o);});}catch(e){toast(e.message);}}

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
    renderSettings();
    if (studentOnly) { document.querySelectorAll('.view').forEach(el=>el.classList.add('hidden')); $('studentPortalView').classList.remove('hidden'); $('pageTitle').textContent='আমার প্যানেল'; await loadStudentPortal(); return; }
    if (teacherOnly) { document.querySelectorAll('.view').forEach(el=>el.classList.add('hidden')); $('teacherPortalView').classList.remove('hidden'); $('pageTitle').textContent='টিচার প্যানেল'; await loadTeacherPortal(); await refreshStudents(); return; }
    await refreshStudents();
    if (!adminOnly) $('settingsView').classList.add('hidden');
    if (financeRole) await loadFees();
    if (adminOnly) { await loadGatewaySettings(); await loadRoutineTeachers(); }
  } catch (error) { toast(error.message); }
}
init();
