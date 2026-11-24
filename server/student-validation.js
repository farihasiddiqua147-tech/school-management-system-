function validateStudentLogin(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return 'Student login requires a valid email address';
  }
  if (normalizedPassword.length < 12) {
    return 'Student login password must be at least 12 characters';
  }
  return null;
}

module.exports = { validateStudentLogin };
