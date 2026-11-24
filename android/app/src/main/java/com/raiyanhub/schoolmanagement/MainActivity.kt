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
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

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
                        Text("স্বাগতম, ${user?.optString("name", "ব্যবহারকারী")}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                        InfoCard("আপনার Role", user?.optString("role", "—") ?: "—")
                        InfoCard("অ্যাকাউন্ট", user?.optString("email", "—") ?: "—")
                        InfoCard("সংযোগ", info)
                        Text("সারসংক্ষেপ", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(dashboard?.toString(2) ?: "ডেটা লোড হচ্ছে...", style = MaterialTheme.typography.bodySmall)
                        Text("আপনার প্যানেল", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        rolePanels.forEach { (label, value) -> InfoCard(label, value) }
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
    private fun InfoCard(label: String, value: String) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            }
        }
    }
}