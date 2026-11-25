package com.raiyanhub.schoolmanagement

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

private data class ActionSpec(
    val title: String,
    val fields: List<Pair<String, String>>,
    val endpoint: (Map<String, String>) -> String,
    val payload: (Map<String, String>) -> JSONObject
)

class MainActivity : ComponentActivity() {
    private val http by lazy {
        OkHttpClient.Builder().connectTimeout(25, TimeUnit.SECONDS)
            .readTimeout(35, TimeUnit.SECONDS).build()
    }
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val prefs by lazy {
        val key = MasterKey.Builder(this).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            this, "school_secure_session", key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { SchoolApp() }
    }

    private suspend fun api(path: String, method: String = "GET", payload: JSONObject? = null, token: String? = prefs.getString("token", null)): JSONObject =
        withContext(Dispatchers.IO) {
            val builder = Request.Builder().url(BuildConfig.API_BASE_URL + path.removePrefix("/"))
            if (!token.isNullOrBlank()) builder.header("Authorization", "Bearer $token")
            val body = payload?.toString()?.toRequestBody(jsonType)
            when (method) {
                "POST" -> builder.post(body ?: "{}".toRequestBody(jsonType))
                "PUT" -> builder.put(body ?: "{}".toRequestBody(jsonType))
                "PATCH" -> builder.patch(body ?: "{}".toRequestBody(jsonType))
                else -> builder.get()
            }
            http.newCall(builder.build()).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                val data = try { JSONObject(raw) } catch (_: Exception) { JSONObject().put("message", raw) }
                if (!response.isSuccessful) throw IOException(data.optString("error", "Server error (${response.code})"))
                data
            }
        }

    @Composable
    private fun SchoolApp() {
        val scope = rememberCoroutineScope()
        var email by remember { mutableStateOf("") }
        var password by remember { mutableStateOf("") }
        var token by remember { mutableStateOf(prefs.getString("token", null)) }
        var user by remember { mutableStateOf<JSONObject?>(null) }
        var dashboard by remember { mutableStateOf<JSONObject?>(null) }
        var rolePanels by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
        var busy by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }
        var info by remember { mutableStateOf("আপনার স্কুলের অ্যাকাউন্ট দিয়ে লগইন করুন।") }

        fun refreshSession() {
            scope.launch {
                busy = true; error = null
                try {
                    val me = api("/api/auth/me", token = token)
                    user = me.optJSONObject("user")
                    dashboard = api("/api/dashboard", token = token)
                    rolePanels = loadRolePanels(user?.optString("role").orEmpty(), token)
                    info = "সার্ভারের সঙ্গে সংযোগ সফল।"
                } catch (e: Exception) {
                    error = e.message ?: "সংযোগ করা যায়নি"
                    if (error?.contains("Login required") == true || error?.contains("expired", true) == true) {
                        prefs.edit().remove("token").apply(); token = null; user = null
                    }
                } finally { busy = false }
            }
        }

        fun submitAction(spec: ActionSpec, values: Map<String, String>) {
            scope.launch {
                busy = true
                error = null
                try {
                    val response = api(spec.endpoint(values), "POST", spec.payload(values), token)
                    info = response.optString("message").ifBlank { "${spec.title} সফলভাবে সংরক্ষণ হয়েছে।" }
                    dashboard = api("/api/dashboard", token = token)
                    rolePanels = loadRolePanels(user?.optString("role").orEmpty(), token)
                } catch (e: Exception) {
                    error = e.message ?: "তথ্য সংরক্ষণ করা যায়নি"
                } finally {
                    busy = false
                }
            }
        }

        LaunchedEffect(token) { if (!token.isNullOrBlank() && user == null) refreshSession() }

        MaterialTheme(colorScheme = lightColorScheme(primary = androidx.compose.ui.graphics.Color(0xFF155EEF))) {
            Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text("School Management", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text("Native Android App", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                    if (user == null) {
                        Text("লগইন", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                        OutlinedTextField(email, { email = it }, label = { Text("ইমেইল") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedTextField(password, { password = it }, label = { Text("পাসওয়ার্ড") }, modifier = Modifier.fillMaxWidth(), visualTransformation = PasswordVisualTransformation(), singleLine = true)
                        Button(onClick = {
                            scope.launch {
                                busy = true; error = null
                                try {
                                    val result = api("/api/auth/login", "POST", JSONObject().put("email", email.trim()).put("password", password), null)
                                    val newToken = result.optString("token")
                                    if (newToken.isBlank()) throw IOException("সার্ভার থেকে Login token পাওয়া যায়নি")
                                    prefs.edit().putString("token", newToken).apply()
                                    token = newToken
                                    user = result.optJSONObject("user")
                                    dashboard = api("/api/dashboard", token = newToken)
                                    rolePanels = loadRolePanels(user?.optString("role").orEmpty(), newToken)
                                    info = "লগইন সফল হয়েছে।"
                                } catch (e: Exception) { error = e.message ?: "লগইন করা যায়নি" }
                                finally { busy = false }
                            }
                        }, enabled = !busy && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                            Text(if (busy) "অপেক্ষা করুন..." else "লগইন")
                        }
                        Text("এই অ্যাপটি বিদ্যমান স্কুল সার্ভারের সঙ্গে সংযুক্ত। লগইনের জন্য অ্যাডমিনের দেওয়া অ্যাকাউন্ট ব্যবহার করুন।", style = MaterialTheme.typography.bodySmall)
                    } else {
                        val role = user?.optString("role", "").orEmpty().lowercase()
                        Text("স্বাগতম, ${user?.optString("name", "ব্যবহারকারী")}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                        InfoCard("আপনার Role", user?.optString("role", "—") ?: "—")
                        InfoCard("অ্যাকাউন্ট", user?.optString("email", "—") ?: "—")
                        InfoCard("সংযোগ", info)
                        Text("সারসংক্ষেপ", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        JsonCard("ড্যাশবোর্ড", dashboard?.toString(2) ?: "ডেটা লোড হচ্ছে...")
                        Text("আপনার প্যানেল", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        rolePanels.forEach { (label, value) -> JsonCard(label, value) }

                        val actions = actionSpecs(role)
                        if (actions.isNotEmpty()) {
                            Text("দ্রুত কাজ", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Text("ফর্মের তথ্য সার্ভারে পাঠানো হবে। প্রয়োজনীয় অনুমতি না থাকলে সার্ভার সংরক্ষণ করবে না।", style = MaterialTheme.typography.bodySmall)
                            actions.forEach { spec ->
                                ActionForm(spec = spec, enabled = !busy) { submittedSpec, values ->
                                    submitAction(submittedSpec, values)
                                }
                            }
                        }
                        OutlinedButton(onClick = { refreshSession() }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("সব তথ্য রিফ্রেশ") }
                        OutlinedButton(onClick = {
                            prefs.edit().remove("token").apply()
                            token = null; user = null; dashboard = null; rolePanels = emptyMap(); password = ""
                            error = null
                        }, modifier = Modifier.fillMaxWidth()) { Text("লগআউট") }
                    }
                    if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Text("API: ${BuildConfig.API_BASE_URL}", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }

    private fun actionSpecs(role: String): List<ActionSpec> {
        fun f(key: String, label: String) = key to label
        fun obj(values: Map<String, String>, vararg keys: String): JSONObject {
            val result = JSONObject()
            keys.forEach { key -> values[key]?.trim()?.takeIf { it.isNotEmpty() }?.let { result.put(key, it) } }
            return result
        }
        return when (role) {
            "admin" -> listOf(
                ActionSpec("নতুন শিক্ষার্থী যোগ", listOf(f("name","শিক্ষার্থীর নাম"), f("class_name","ক্লাস"), f("roll","রোল"), f("email","লগইন ইমেইল"), f("password","পাসওয়ার্ড (কমপক্ষে ১২ অক্ষর)")),
                    { "/api/students" }, { v -> obj(v,"name","class_name","roll","email","password") }),
                ActionSpec("নোটিশ প্রকাশ", listOf(f("title","নোটিশের শিরোনাম"), f("body","নোটিশের বিস্তারিত"), f("audience","কার জন্য: all/admin/teacher/student/guardian/accountant")),
                    { "/api/notices" }, { v -> obj(v,"title","body","audience").put("published",true) }),
                ActionSpec("ফি তৈরি", listOf(f("student_id","শিক্ষার্থীর ID"), f("description","ফি-এর বিবরণ"), f("amount","টাকার পরিমাণ"), f("due_date","শেষ তারিখ: YYYY-MM-DD")),
                    { "/api/fees" }, { v -> obj(v,"student_id","description","amount","due_date") })
            )
            "teacher" -> listOf(
                ActionSpec("উপস্থিতি জমা", listOf(f("date","তারিখ: YYYY-MM-DD"), f("student_id","শিক্ষার্থীর ID"), f("status","present / absent / late / leave"), f("note","মন্তব্য (ঐচ্ছিক)")),
                    { "/api/attendance/bulk" }, { v ->
                        val record = obj(v,"student_id","status")
                        v["note"]?.trim()?.takeIf { it.isNotEmpty() }?.let { record.put("note",it) }
                        JSONObject().put("date",v["date"]?.trim().orEmpty()).put("records",JSONArray().put(record))
                    }),
                ActionSpec("হোমওয়ার্ক যোগ", listOf(f("class_name","ক্লাস (আপনার দায়িত্বপ্রাপ্ত)"), f("subject","বিষয়"), f("title","হোমওয়ার্কের শিরোনাম"), f("description","বিস্তারিত"), f("due_date","শেষ তারিখ: YYYY-MM-DD")),
                    { "/api/homework" }, { v -> obj(v,"class_name","subject","title","description","due_date") }),
                ActionSpec("নোটিশ প্রকাশ", listOf(f("title","নোটিশের শিরোনাম"), f("body","নোটিশের বিস্তারিত"), f("audience","কার জন্য: all/teacher/student/guardian")),
                    { "/api/notices" }, { v -> obj(v,"title","body","audience").put("published",true) })
            )
            "accountant" -> listOf(
                ActionSpec("নতুন ফি তৈরি", listOf(f("student_id","শিক্ষার্থীর ID"), f("description","ফি-এর বিবরণ"), f("amount","টাকার পরিমাণ"), f("due_date","শেষ তারিখ: YYYY-MM-DD")),
                    { "/api/fees" }, { v -> obj(v,"student_id","description","amount","due_date") }),
                ActionSpec("পেমেন্ট রেকর্ড ও রসিদ", listOf(f("fee_id","ফি ID"), f("amount","জমা টাকার পরিমাণ"), f("method","cash / bank / bkash / nagad"), f("reference","লেনদেন রেফারেন্স (ঐচ্ছিক)")),
                    { v -> "/api/fees/${v["fee_id"]?.trim().orEmpty()}/payment" }, { v -> obj(v,"amount","method","reference") })
            )
            else -> emptyList()
        }
    }

    private suspend fun loadRolePanels(role: String, token: String?): Map<String, String> {
        val endpoints = when (role.lowercase()) {
            "admin" -> listOf(
                "শিক্ষার্থী" to "/api/students?status=all",
                "শিক্ষক ও কর্মী" to "/api/staff",
                "ফি ও পেমেন্ট" to "/api/fees",
                "নোটিশ" to "/api/notices",
                "ফি রিপোর্ট" to "/api/reports/fees"
            )
            "teacher" -> listOf(
                "আমার ক্লাস" to "/api/teacher/me",
                "ক্লাস রুটিন" to "/api/teacher/timetable",
                "হোমওয়ার্ক" to "/api/homework",
                "পরীক্ষা" to "/api/exams",
                "নোটিশ" to "/api/notices"
            )
            "student" -> listOf(
                "আমার পড়াশোনা, উপস্থিতি, ফলাফল ও ফি" to "/api/student/me",
                "নোটিশ" to "/api/notices"
            )
            "guardian" -> listOf(
                "সন্তানের তথ্য" to "/api/students?status=all",
                "উপস্থিতি" to "/api/attendance",
                "ফলাফল" to "/api/results",
                "নোটিশ" to "/api/notices"
            )
            "accountant" -> listOf(
                "শিক্ষার্থী তালিকা" to "/api/students?status=all",
                "ফি ও পেমেন্ট" to "/api/fees",
                "আয় ও বকেয়া রিপোর্ট" to "/api/reports/fees"
            )
            else -> emptyList()
        }
        val result = linkedMapOf<String, String>()
        for ((label, path) in endpoints) {
            result[label] = try {
                api(path, token = token).toString(2)
            } catch (e: Exception) {
                "এই তথ্য এখন পাওয়া যায়নি: ${e.message ?: "API error"}"
            }
        }
        return result
    }

    @Composable
    private fun ActionForm(spec: ActionSpec, enabled: Boolean, onSubmit: (ActionSpec, Map<String, String>) -> Unit) {
        var values by remember(spec.title) { mutableStateOf(emptyMap<String, String>()) }
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(spec.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                spec.fields.forEach { (key, label) ->
                    OutlinedTextField(
                        value = values[key].orEmpty(),
                        onValueChange = { next -> values = values + (key to next) },
                        label = { Text(label) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = key !in listOf("body", "description", "note"),
                        visualTransformation = if (key == "password") PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None
                    )
                }
                Button(
                    onClick = { onSubmit(spec, values) },
                    enabled = enabled && spec.fields.filterNot { it.first in listOf("note","description","due_date","reference","audience") }.all { values[it.first].orEmpty().isNotBlank() },
                    modifier = Modifier.fillMaxWidth()
                ) { Text(if (enabled) "সংরক্ষণ করুন" else "অপেক্ষা করুন...") }
            }
        }
    }

    @Composable
    private fun InfoCard(label: String, value: String) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            }
        }
    }

    @Composable
    private fun JsonCard(label: String, value: String) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(6.dp))
                Text(value, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
