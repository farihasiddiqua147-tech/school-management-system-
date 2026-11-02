// Set API_BASE to the deployed API URL when frontend and API use different domains.
const API_BASE = window.SCHOOL_API_BASE || '';
const form = document.getElementById('loginForm');
const message = document.getElementById('message');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = 'যাচাই করা হচ্ছে…';
  const data = new FormData(form);
  try {
    const response = await fetch(API_BASE + '/api/auth/login', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email:data.get('email'), password:data.get('password')})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'লগইন ব্যর্থ হয়েছে');
    sessionStorage.setItem('sms_token', result.token);
    sessionStorage.setItem('sms_user', JSON.stringify(result.user));
    window.location.href = 'index.html';
  } catch (error) {
    message.textContent = error.message || 'API-তে সংযোগ করা যায়নি।';
  }
});