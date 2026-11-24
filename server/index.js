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
const crypto = require('crypto');

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
// Idempotent fee-module migrations for existing SQLite databases.
const feeColumns = db.prepare("PRAGMA table_info(fees)").all().map(c => c.name);
if (!feeColumns.includes('fee_type')) db.exec("ALTER TABLE fees ADD COLUMN fee_type TEXT NOT NULL DEFAULT 'other'");
if (!feeColumns.includes('billing_period')) db.exec("ALTER TABLE fees ADD COLUMN billing_period TEXT");
db.exec(`
  CREATE TABLE IF NOT EXISTS fee_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fee_id INTEGER NOT NULL REFERENCES fees(id),
    receipt_no TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL CHECK(amount > 0),
    method TEXT NOT NULL CHECK(method IN ('cash','bank','bkash','nagad')),
    reference TEXT,
    received_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_fee_payments_fee ON fee_payments(fee_id, created_at);
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS payment_gateway_settings (
    provider TEXT PRIMARY KEY CHECK(provider IN ('bkash','nagad')),
    merchant_id TEXT NOT NULL DEFAULT '',
    encrypted_credentials TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

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
  
// Payment gateway credentials are encrypted at rest and never returned by the read API.
const paymentConfigKey = crypto.createHash('sha256').update(JWT_SECRET + '|payment-gateway-config-v1').digest();
function encryptPaymentCredentials(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', paymentConfigKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
function decryptPaymentCredentials(value) {
  if (!value) return {};
  const [iv, tag, encrypted] = value.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', paymentConfigKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8'));
}
const gatewayFields = {
  bkash: ['appKey','appSecret','username','password'],
  nagad: ['merchantPrivateKey','pgPublicKey']
};
app.get('/api/payment-gateways', auth, allow('admin'), (req,res) => {
  const rows = db.prepare('SELECT provider,merchant_id,encrypted_credentials,enabled,updated_at FROM payment_gateway_settings').all();
  const gateways = {};
  for (const provider of ['bkash','nagad']) {
    const row = rows.find(r => r.provider === provider);
    let credentials = {};
    try { credentials = row ? decryptPaymentCredentials(row.encrypted_credentials) : {}; } catch { return fail(res,500,'Payment settings could not be decrypted. Check the server secret configuration.'); }
    gateways[provider] = {
      merchantId: row ? row.merchant_id : '',
      enabled: !!(row && row.enabled),
      configured: !!(row && row.merchant_id && gatewayFields[provider].every(key => !!credentials[key])),
      credentialStatus: Object.fromEntries(gatewayFields[provider].map(key => [key, !!credentials[key]])),
      updatedAt: row ? row.updated_at : null
    };
  }
  res.json({gateways});
});
app.put('/api/payment-gateways/:provider', auth, allow('admin'), validateBody, (req,res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!gatewayFields[provider]) return fail(res,400,'Unsupported payment provider');
  const merchantId = String(req.body.merchantId || '').trim().slice(0,120);
  const enabled = req.body.enabled === true ? 1 : 0;
  const supplied = req.body.credentials && typeof req.body.credentials === 'object' && !Array.isArray(req.body.credentials) ? req.body.credentials : {};
  const existing = db.prepare('SELECT encrypted_credentials FROM payment_gateway_settings WHERE provider=?').get(provider);
  let credentials = {};
  try { credentials = existing ? decryptPaymentCredentials(existing.encrypted_credentials) : {}; }
  catch { return fail(res,500,'Saved payment credentials could not be decrypted. Check the server secret configuration.'); }
  for (const key of gatewayFields[provider]) {
    if (supplied[key] !== undefined && String(supplied[key]).trim()) {
      if (String(supplied[key]).length > 12000) return fail(res,400,'Credential value is too long');
      credentials[key] = String(supplied[key]);
    }
  }
  if (enabled && (!merchantId || !gatewayFields[provider].every(key => !!credentials[key]))) {
    return fail(res,400,'Merchant ID and all required credentials must be saved before enabling this configuration');
  }
  const encrypted = encryptPaymentCredentials(credentials);
  db.prepare(`INSERT INTO payment_gateway_settings(provider,merchant_id,encrypted_credentials,enabled,updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(provider) DO UPDATE SET merchant_id=excluded.merchant_id,encrypted_credentials=excluded.encrypted_credentials,enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP`)
    .run(provider,merchantId,encrypted,enabled);
  res.json({ok:true,message:'Payment gateway settings saved securely. Live checkout still requires provider API integration and callback verification.'});
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
app.get('/api/fees',auth,allow('admin','accountant'),(req,res)=>{
 let sql='SELECT f.*,s.name student_name,s.class_name,s.roll FROM fees f JOIN students s ON s.id=f.student_id',args=[];
 if(req.query.student_id){sql+=' WHERE f.student_id=?';args.push(Number(req.query.student_id));}
 sql+=' ORDER BY f.due_date DESC,f.id DESC LIMIT 1000';
 res.json({fees:db.prepare(sql).all(...args)});
});
app.post('/api/fees',auth,allow('admin','accountant'),validateBody,(req,res)=>{
 const b=req.body, studentId=parseId(b.student_id), amount=Number(b.amount);
 const types=['monthly_tuition','exam_fee','admission_fee','session_fee','transport_fee','development_fee','other'];
 const feeType=types.includes(b.fee_type)?b.fee_type:'other';
 if(!studentId||!String(b.description||'').trim()||!Number.isFinite(amount)||amount<=0)return fail(res,400,'Student, description and positive amount required');
 const student=db.prepare('SELECT id FROM students WHERE id=?').get(studentId);if(!student)return fail(res,404,'Student not found');
 const x=db.prepare("INSERT INTO fees(student_id,description,amount,paid_amount,due_date,status,fee_type,billing_period) VALUES(?,?,?,0,?,'unpaid',?,?)").run(studentId,String(b.description).trim(),amount,b.due_date||null,feeType,b.billing_period||null);
 res.status(201).json({fee:db.prepare('SELECT * FROM fees WHERE id=?').get(x.lastInsertRowid)});
});
app.get('/api/fees/:id/payments',auth,allow('admin','accountant'),(req,res)=>{
 const id=parseId(req.params.id);if(!id)return fail(res,400,'Invalid fee id');
 const fee=db.prepare('SELECT id,student_id FROM fees WHERE id=?').get(id);if(!fee)return fail(res,404,'Fee not found');
 res.json({payments:db.prepare('SELECT id,receipt_no,amount,method,reference,created_at FROM fee_payments WHERE fee_id=? ORDER BY id DESC').all(id)});
});
app.post('/api/fees/:id/payment',auth,allow('admin','accountant'),validateBody,(req,res)=>{
 const id=parseId(req.params.id),amount=Number(req.body.amount),method=String(req.body.method||'cash');
 if(!id||!Number.isFinite(amount)||amount<=0||!['cash','bank','bkash','nagad'].includes(method))return fail(res,400,'Valid fee id, positive amount and payment method required');
 const fee=db.prepare('SELECT * FROM fees WHERE id=?').get(id);if(!fee)return fail(res,404,'Fee not found');
 const balance=Number((fee.amount-fee.paid_amount).toFixed(2));
 if(amount>balance+0.001)return fail(res,400,'Payment exceeds the outstanding balance');
 const receiptNo='RCPT-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Date.now()).slice(-6);
 const tx=db.transaction(()=>{
   db.prepare('INSERT INTO fee_payments(fee_id,receipt_no,amount,method,reference,received_by) VALUES(?,?,?,?,?,?)').run(id,receiptNo,amount,method,String(req.body.reference||'').slice(0,100)||null,req.user.id);
   const paid=Number((fee.paid_amount+amount).toFixed(2)),status=paid>=fee.amount?'paid':paid>0?'partial':'unpaid';
   db.prepare('UPDATE fees SET paid_amount=?,status=? WHERE id=?').run(paid,status,id);
 });
 tx();
 res.json({ok:true,receipt:{receipt_no:receiptNo,amount,method,created_at:new Date().toISOString()},fee:db.prepare('SELECT * FROM fees WHERE id=?').get(id)});
});
// Online checkout remains disabled until verified merchant credentials and provider callbacks are configured.
app.post('/api/payments/online',auth,validateBody,(req,res)=>{
 const provider=String(req.body.provider||'');
 if(!['bkash','nagad'].includes(provider))return fail(res,400,'Unsupported payment provider');
 return res.status(503).json({error:'Online payment gateway is not configured yet. Please use the school office payment option for now.'});
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
app.get('/index.html', (req,res) => res.sendFile(path.join(publicRoot, 'index.html')));
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
