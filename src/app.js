const DEFAULT_SETTINGS = { schoolName: "School Manager", logoUrl: "", address: "", phone: "", email: "", academicYear: new Date().getFullYear() };
const load = (key, fallback) => { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
let settings = load("sms_settings", DEFAULT_SETTINGS);
let students = load("sms_students", []);
const $ = (id) => document.getElementById(id);
function save() { localStorage.setItem("sms_settings", JSON.stringify(settings)); localStorage.setItem("sms_students", JSON.stringify(students)); }
function toast(message) { $("toast").textContent = message; $("toast").classList.remove("hidden"); setTimeout(() => $("toast").classList.add("hidden"), 2600); }
function renderSettings() {
  $("sidebarSchoolName").textContent = settings.schoolName || "School Manager";
  $("welcomeName").textContent = settings.schoolName || "School Manager";
  $("brandMark").textContent = (settings.schoolName || "S").trim().charAt(0).toUpperCase() || "S";
  $("yearCount").textContent = settings.academicYear || "—";
  $("profileStatus").textContent = settings.schoolName && settings.address && settings.phone ? "প্রস্তুত" : "অসম্পূর্ণ";
  const form = $("settingsForm");
  Object.keys(DEFAULT_SETTINGS).forEach(k => { if (form.elements[k]) form.elements[k].value = settings[k] ?? ""; });
  ["logoUrl","address","phone","email"].forEach(k => { if (form.elements[k]) form.elements[k].value = settings[k] || ""; });
}
function renderStudents() {
  $("studentCount").textContent = students.length;
  $("studentRows").innerHTML = "";
  $("emptyStudents").classList.toggle("hidden", students.length > 0);
  students.forEach(s => {
    const tr = document.createElement("tr");
    [s.name, s.className, s.roll, s.phone || "—"].forEach(v => { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); });
    $("studentRows").appendChild(tr);
  });
}
function showView(view) {
  document.querySelectorAll(".view").forEach(el => el.classList.add("hidden"));
  $(view + "View").classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  $("pageTitle").textContent = ({dashboard:"ড্যাশবোর্ড",students:"শিক্ষার্থী",settings:"অ্যাডমিন সেটিংস"})[view];
}
document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.go)));
$("settingsForm").addEventListener("submit", e => {
  e.preventDefault(); const data = new FormData(e.currentTarget);
  settings = Object.fromEntries(data.entries()); settings.academicYear = Number(settings.academicYear);
  save(); renderSettings(); toast("স্কুলের সেটিংস সংরক্ষণ হয়েছে");
});
$("showStudentForm").addEventListener("click", () => $("studentForm").classList.toggle("hidden"));
$("cancelStudent").addEventListener("click", () => { $("studentForm").reset(); $("studentForm").classList.add("hidden"); });
$("studentForm").addEventListener("submit", e => {
  e.preventDefault(); const data = new FormData(e.currentTarget);
  students.push(Object.fromEntries(data.entries())); save(); renderStudents(); e.currentTarget.reset(); e.currentTarget.classList.add("hidden"); toast("শিক্ষার্থীর তথ্য সংরক্ষণ হয়েছে");
});
renderSettings(); renderStudents(); showView("dashboard");
