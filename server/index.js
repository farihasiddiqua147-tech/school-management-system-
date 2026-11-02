require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET to a random secret of at least 32 characters in .env');
  process.exit(1);
}
const dbFile = path.resolve(process.env.DATABASE_FILE || './data/school.sqlite');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim()) }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const roles = ['admin','teacher','student','guardian','accountant'];
const safeUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const fail = (res, status, message) => res.status(status).json({ error: message });
function auth(req,res,next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return fail(res,401,'Login required');
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = db.prepare('SELECT id,name,email,role,active FROM users WHERE id=?').get(payload.sub);
    if (!user || !user.active) return fail(res,401,'Account unavailable');
    req.user = user; next();
  } catch { return fail(res,401,'Invalid or expired token'); }
}
const allow = (...allowed) => (req,res,next) => allowed.includes(req.user.role) ? next() : fail(res,403,'Insufficient permission');
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const parseId = value => /^\d+$/.test(String(value)) && Number(value) > 0 ? Number(value) : null;
function validateBody(req,res,next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return fail(res,400,'JSON object required');
  next();
}
app.get('/api/health',(req,res)=>res.json({ok:true,service:'school-management-api'}));

app.post('/api/auth/login', validateBody, (req,res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return fail(res,400,'Email and password required');
  const user = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
  if (!user || !bcrypt.compareSync(password,user.password_hash)) return fail(res,401,'Invalid email or password');
  const token = jwt.sign({sub:user.id,role:user.role},JWT_SECRET,{expiresIn:'8h'});
  res.json({token,expiresIn:28800,user:safeUser(user)});
});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:safeUser(req.user)}));
app.post('/api/users',auth,allow('admin'),validateBody,(req,res)=>{
  const name=String(req.body.name||'').trim(), email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||''), role=String(req.body.role||'');
  if(!name||!/^\S+@\S+\.\S+$/.test(email)||password.length<12||!roles.includes(role)) return fail(res,400,'Name, valid email, role and password of at least 12 characters required');
  try {
    const info=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(name,email,bcrypt.hashSync(password,12),role);
    res.status(201).json({user:safeUser(db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(info.lastInsertRowid))});
  } catch(e) { if(String(e.message).includes('UNIQUE')) return fail(res,409,'Email already exists'); throw e; }
});

app.get('/api/settings',auth,(req,res)=>{
  const rows=db.prepare('SELECT key,value FROM settings').all(); res.json({settings:Object.fromEntries(rows.map(r=>[r.key,r.value]))});
});
app.put('/api/settings',auth,allow('admin'),validateBody,(req,res)=>{
  const allowed=['schoolName','logoUrl','address','phone','email','academicYear','currency','timezone','smsProvider'];
  const save=db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP');
  const tx=db.transaction(()=>{ for(const key of allowed) if(req.body[key]!==undefined) save.run(key,String(req.body[key]).slice(0,2000)); }); tx();
  res.json({ok:true,settings:Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r=>[r.key,r.value]))});
});

app.get('/api/dashboard',auth,(req,res)=>{
  const count=table=>db.prepare('SELECT COUNT(*) n FROM '+table).get().n;
  const outstanding=db.prepare("SELECT COALESCE(SUM(amount-paid_amount),0) amount FROM fees WHERE status!='paid'").get().amount;
  res.json({students:count('students'),staff:count('staff'),exams:count('exams'),notices:count('notices'),outstandingFees:outstanding});
});
app.get('/api/students',auth,allow('admin','teacher','accountant','guardian'),(req,res)=>{
  const {className,status='active',q=''}=req.query;
  let sql='SELECT id,student_code,name,class_name,roll,guardian_name,guardian_phone,status,created_at FROM students WHERE 1=1', args=[];
  if(className){sql+=' AND class_name=?';args.push(String(className));}
  if(status!=='all'){sql+=' AND status=?';args.push(String(status));}
  if(q){sql+=' AND (name LIKE ? OR student_code LIKE ? OR roll LIKE ?)';args.push('%'+q+'%','%'+q+'%','%'+q+'%');}
  if(req.user.role==='guardian') { const guardian=db.prepare('SELECT id FROM students WHERE guardian_user_id=?').all(req.user.id).map(x=>x.id); if(!guardian.length)return res.json({students:[]}); sql+=' AND id IN ('+guardian.map(()=>'?').join(',')+')';args.push(...guardian); }
  res.json({students:db.prepare(sql+' ORDER BY class_name,roll LIMIT 500').all(...args)});
});
app.post('/api/students',auth,allow('admin','teacher'),validateBody,(req,res)=>{
  const b=req.body, name=String(b.name||'').trim(), cls=String(b.class_name||'').trim(), roll=String(b.roll||'').trim();
  if(!name||!cls||!roll)return fail(res,400,'Student name, class and roll are required');
  try { const x=db.prepare('INSERT INTO students(student_code,name,class_name,roll,guardian_name,guardian_phone,guardian_user_id) VALUES(?,?,?,?,?,?,?)').run(b.student_code||null,name,cls,roll,b.guardian_name||null,b.guardian_phone||null,b.guardian_user_id||null); res.status(201).json({student:db.prepare('SELECT * FROM students WHERE id=?').get(x.lastInsertRowid)}); }
  catch(e){if(String(e.message).includes('UNIQUE'))return fail(res,409,'Student code already exists');throw e;}
});
app.patch('/api/students/:id',auth,allow('admin','teacher'),validateBody,(req,res)=>{
 const id=parseId(req.params.id);if(!id)return fail(res,400,'Invalid id');
 const keys=['student_code','name','class_name','roll','guardian_name','guardian_phone','status']; const updates=keys.filter(k=>req.body[k]!==undefined);
 if(!updates.length)return fail(res,400,'No editable fields supplied');
 const stmt=db.prepare('UPDATE students SET '+updates.map(k=>k+'=?').join(',')+' WHERE id=?');
 const result=stmt.run(...updates.map(k=>req.body[k]),id);if(!result.changes)return fail(res,404,'Student not found');
 res.json({student:db.prepare('SELECT * FROM students WHERE id=?').get(id)});
});
app.get('/api/staff',auth,allow('admin','teacher'),(req,res)=>res.json({staff:db.prepare('SELECT id,user_id,name,designation,phone,joined_on,active FROM staff ORDER BY name LIMIT 500').all()}));
app.post('/api/staff',auth,allow('admin'),validateBody,(req,res)=>{
 const b=req.body;if(!String(b.name||'').trim()||!String(b.designation||'').trim())return fail(res,400,'Name and designation required');
 const x=db.prepare('INSERT INTO staff(user_id,name,designation,phone,joined_on) VALUES(?,?,?,?,?)').run(b.user_id||null,String(b.name).trim(),String(b.designation).trim(),b.phone||null,b.joined_on||null);
 res.status(201).json({staff:db.prepare('SELECT * FROM staff WHERE id=?').get(x.lastInsertRowid)});
});

app.get('/api/attendance',auth,allow('admin','teacher','guardian','student'),(req,res)=>{
 const date=String(req.query.date||new Date().toISOString().slice(0,10));
 res.json({date,attendance:db.prepare('SELECT a.*,s.name student_name,s.class_name,s.roll FROM attendance a JOIN students s ON s.id=a.student_id WHERE attendance_date=? ORDER BY s.class_name,s.roll').all(date)});
});
app.post('/api/attendance/bulk',auth,allow('admin','teacher'),validateBody,(req,res)=>{
 const {date,records}=req.body;if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date))||!Array.isArray(records)||records.length>500)return fail(res,400,'Valid date and up to 500 records required');
 const save=db.prepare("INSERT INTO attendance(student_id,attendance_date,status,note,marked_by) VALUES(?,?,?,?,?) ON CONFLICT(student_id,attendance_date) DO UPDATE SET status=excluded.status,note=excluded.note,marked_by=excluded.marked_by");
 const tx=db.transaction(()=>records.forEach(r=>{if(!parseId(r.student_id)||!['present','absent','late','leave'].includes(r.status))throw new Error('Invalid attendance record');save.run(Number(r.student_id),date,r.status,r.note||null,req.user.id)}));
 try{tx();res.json({ok:true,saved:records.length});}catch(e){return fail(res,400,e.message);}
});
app.get('/api/homework',auth,(req,res)=>res.json({homework:db.prepare('SELECT * FROM homework ORDER BY due_date DESC LIMIT 300').all()}));
app.post('/api/homework',auth,allow('admin','teacher'),validateBody,(req,res)=>{
 const b=req.body;if(!b.class_name||!b.subject||!b.title)return fail(res,400,'Class, subject and title required');
 const x=db.prepare('INSERT INTO homework(class_name,subject,title,description,due_date,created_by) VALUES(?,?,?,?,?,?)').run(b.class_name,b.subject,b.title,b.description||null,b.due_date||null,req.user.id);
 res.status(201).json({homework:db.prepare('SELECT * FROM homework WHERE id=?').get(x.lastInsertRowid)});
});
app.get('/api/exams',auth,(req,res)=>res.json({exams:db.prepare('SELECT * FROM exams ORDER BY exam_date DESC LIMIT 300').all()}));
app.post('/api/exams',auth,allow('admin','teacher'),validateBody,(req,res)=>{
 const b=req.body;if(!b.name||!b.class_name)return fail(res,400,'Exam name and class required');
 const x=db.prepare('INSERT INTO exams(name,class_name,exam_date,academic_year) VALUES(?,?,?,?)').run(b.name,b.class_name,b.exam_date||null,b.academic_year||null);
 res.status(201).json({exam:db.prepare('SELECT * FROM exams WHERE id=?').get(x.lastInsertRowid)});
});
app.post('/api/results',auth,allow('admin','teacher'),validateBody,(req,res)=>{
 const b=req.body;if(!parseId(b.exam_id)||!parseId(b.student_id)||!String(b.subject||'').trim()||!Number.isFinite(Number(b.marks))||!Number.isFinite(Number(b.max_marks))||Number(b.max_marks)<=0||Number(b.marks)<0||Number(b.marks)>Number(b.max_marks))return fail(res,400,'Valid exam, student, subject and marks are required');
 db.prepare('INSERT INTO results(exam_id,student_id,subject,marks,max_marks) VALUES(?,?,?,?,?) ON CONFLICT(exam_id,student_id,subject) DO UPDATE SET marks=excluded.marks,max_marks=excluded.max_marks').run(b.exam_id,b.student_id,b.subject,b.marks,b.max_marks);
 res.json({ok:true});
});
app.get('/api/results',auth,allow('admin','teacher','student','guardian'),(req,res)=>{
 let sql='SELECT r.*,e.name exam_name,e.class_name,s.name student_name,s.roll FROM results r JOIN exams e ON e.id=r.exam_id JOIN students s ON s.id=r.student_id',args=[];
 if(req.query.exam_id){sql+=' WHERE r.exam_id=?';args.push(Number(req.query.exam_id));}
 res.json({results:db.prepare(sql+' ORDER BY e.name,s.class_name,s.roll,r.subject LIMIT 2000').all(...args)});
});
app.get('/api/fees',auth,allow('admin','accountant','guardian'),(req,res)=>res.json({fees:db.prepare('SELECT f.*,s.name student_name,s.class_name,s.roll FROM fees f JOIN students s ON s.id=f.student_id ORDER BY f.due_date DESC LIMIT 1000').all()}));
app.post('/api/fees',auth,allow('admin','accountant'),validateBody,(req,res)=>{
 const b=req.body;if(!parseId(b.student_id)||!String(b.description||'').trim()||!Number.isFinite(Number(b.amount))||Number(b.amount)<0)return fail(res,400,'Student, description and non-negative amount required');
 const x=db.prepare('INSERT INTO fees(student_id,description,amount,paid_amount,due_date,status) VALUES(?,?,?,?,?,?)').run(b.student_id,b.description,b.amount,b.paid_amount||0,b.due_date||null,Number(b.paid_amount||0)>=Number(b.amount)?'paid':Number(b.paid_amount||0)>0?'partial':'unpaid');
 res.status(201).json({fee:db.prepare('SELECT * FROM fees WHERE id=?').get(x.lastInsertRowid)});
});
app.post('/api/fees/:id/payment',auth,allow('admin','accountant'),validateBody,(req,res)=>{
 const id=parseId(req.params.id),amount=Number(req.body.amount);if(!id||!Number.isFinite(amount)||amount<=0)return fail(res,400,'Valid fee id and positive payment amount required');
 const fee=db.prepare('SELECT * FROM fees WHERE id=?').get(id);if(!fee)return fail(res,404,'Fee not found');
 const paid=Math.min(fee.amount,fee.paid_amount+amount),status=paid>=fee.amount?'paid':paid>0?'partial':'unpaid';
 db.prepare('UPDATE fees SET paid_amount=?,status=? WHERE id=?').run(paid,status,id);res.json({fee:db.prepare('SELECT * FROM fees WHERE id=?').get(id)});
});
app.get('/api/notices',auth,(req,res)=>res.json({notices:db.prepare('SELECT id,title,body,audience,published,created_at FROM notices WHERE published=1 ORDER BY created_at DESC LIMIT 300').all()}));
app.post('/api/notices',auth,allow('admin','teacher'),validateBody,(req,res)=>{
 const b=req.body;if(!String(b.title||'').trim()||!String(b.body||'').trim())return fail(res,400,'Notice title and body required');
 const x=db.prepare('INSERT INTO notices(title,body,audience,published,created_by) VALUES(?,?,?,?,?)').run(b.title,b.body,b.audience||'all',b.published===false?0:1,req.user.id);
 res.status(201).json({notice:db.prepare('SELECT * FROM notices WHERE id=?').get(x.lastInsertRowid)});
});

function gradePoint(percent) {
  if (percent >= 80) return {letter:'A+',point:5.00};
  if (percent >= 70) return {letter:'A',point:4.00};
  if (percent >= 60) return {letter:'A-',point:3.50};
  if (percent >= 50) return {letter:'B',point:3.00};
  if (percent >= 40) return {letter:'C',point:2.00};
  if (percent >= 33) return {letter:'D',point:1.00};
  return {letter:'F',point:0.00};
}
app.get('/api/reports/marksheet',auth,allow('admin','teacher','student','guardian'),(req,res)=>{
  const examId=parseId(req.query.exam_id), studentId=parseId(req.query.student_id);
  if(!examId||!studentId)return fail(res,400,'exam_id and student_id are required');
  if(req.user.role==='student') {
    const linked=db.prepare('SELECT id FROM students WHERE id=? AND name=?').get(studentId,req.user.name);
    if(!linked)return fail(res,403,'You may only view your own marksheet');
  }
  if(req.user.role==='guardian') {
    const linked=db.prepare('SELECT id FROM students WHERE id=? AND guardian_user_id=?').get(studentId,req.user.id);
    if(!linked)return fail(res,403,'You may only view your linked student marksheet');
  }
  const student=db.prepare('SELECT id,name,class_name,roll,student_code FROM students WHERE id=?').get(studentId);
  const exam=db.prepare('SELECT id,name,class_name,exam_date,academic_year FROM exams WHERE id=?').get(examId);
  if(!student||!exam)return fail(res,404,'Student or exam not found');
  const subjects=db.prepare('SELECT subject,marks,max_marks FROM results WHERE exam_id=? AND student_id=? ORDER BY subject').all(examId,studentId);
  if(!subjects.length)return res.json({student,exam,subjects:[],totalMarks:0,totalMaxMarks:0,percentage:0,gpa:0,grade:'N/A'});
  const enriched=subjects.map(s=>({...s,percentage:Number((s.marks/s.max_marks*100).toFixed(2)),...gradePoint(s.marks/s.max_marks*100)}));
  const totalMarks=subjects.reduce((n,s)=>n+s.marks,0),totalMaxMarks=subjects.reduce((n,s)=>n+s.max_marks,0);
  const percentage=Number((totalMarks/totalMaxMarks*100).toFixed(2));
  const gpa=Number((enriched.reduce((n,s)=>n+s.point,0)/enriched.length).toFixed(2));
  res.json({student,exam,subjects:enriched,totalMarks,totalMaxMarks,percentage,gpa,grade:gradePoint(percentage).letter});
});
app.get('/api/reports/fees',auth,allow('admin','accountant'),(req,res)=>{
  const rows=db.prepare("SELECT status,COUNT(*) AS invoices,COALESCE(SUM(amount),0) AS billed,COALESCE(SUM(paid_amount),0) AS collected,COALESCE(SUM(amount-paid_amount),0) AS outstanding FROM fees GROUP BY status").all();
  const total=db.prepare('SELECT COUNT(*) AS invoices,COALESCE(SUM(amount),0) AS billed,COALESCE(SUM(paid_amount),0) AS collected,COALESCE(SUM(amount-paid_amount),0) AS outstanding FROM fees').get();
  res.json({total,byStatus:rows});
});

// Serve the frontend from the same origin as the API so login works without CORS setup.
const publicRoot = path.resolve(__dirname, '..');
app.get('/', (req,res) => res.sendFile(path.join(publicRoot, 'index.html')));
app.get('/login.html', (req,res) => res.sendFile(path.join(publicRoot, 'login.html')));
app.use('/src', express.static(path.join(publicRoot, 'src'), { dotfiles: 'deny', index: false }));

app.use('/api',(req,res)=>fail(res,404,'API endpoint not found'));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:process.env.NODE_ENV==='production'?'Internal server error':err.message});});

function bootstrapAdmin(){
 const email=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase(),password=String(process.env.ADMIN_PASSWORD||''),name=String(process.env.ADMIN_NAME||'School Administrator');
 if(!email||!password)return;
 if(password.length<12){console.warn('ADMIN_PASSWORD must be at least 12 characters; admin bootstrap skipped');return;}
 const existing=db.prepare('SELECT id FROM users WHERE email=?').get(email);
 if(!existing){db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(name,email,bcrypt.hashSync(password,12),'admin');console.log('Initial admin account created for',email);}
}
bootstrapAdmin();
app.listen(PORT,()=>console.log('School Management API listening on port '+PORT));
