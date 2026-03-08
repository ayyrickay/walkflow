export default function LoginPage() {
  return (
    <section>
      <h1>Sign in</h1>
      <p>Use email and password to log in.</p>

      <h2>Login</h2>
      <form method="post" action="/api/auth/login">
        <label htmlFor="login-email">Email</label>
        <input id="login-email" name="email" type="email" required />

        <label htmlFor="login-password">Password</label>
        <input id="login-password" name="password" type="password" minLength={8} required />

        <button type="submit">Login</button>
      </form>

      <h2>Create account</h2>
      <form method="post" action="/api/auth/register">
        <label htmlFor="register-email">Email</label>
        <input id="register-email" name="email" type="email" required />

        <label htmlFor="register-phone">Phone (E.164)</label>
        <input id="register-phone" name="phoneE164" type="tel" placeholder="+15555550123" required />

        <label htmlFor="register-password">Password</label>
        <input id="register-password" name="password" type="password" minLength={8} required />

        <button type="submit">Create account</button>
      </form>
    </section>
  );
}
