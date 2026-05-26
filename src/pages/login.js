export function renderLogin(view) {
  let mode = 'login';

  function render() {
    const isSignup = mode === 'signup';
    view.innerHTML = `
      <div class="auth-card">
        <h1>💰 Tài chính</h1>
        <div class="auth-tabs">
          <button type="button" data-tab="login"  class="${isSignup ? '' : 'active'}">Đăng nhập</button>
          <button type="button" data-tab="signup" class="${isSignup ? 'active' : ''}">Đăng ký</button>
        </div>
        <form id="auth-form" class="form-grid" autocomplete="on">
          ${isSignup ? `
            <label class="full">Tên
              <input name="name" required autocomplete="name" />
            </label>
          ` : ''}
          <label class="full">Email
            <input name="email" type="email" required autocomplete="email" />
          </label>
          <label class="full">Mật khẩu
            <input name="password" type="password" required minlength="8"
                   autocomplete="${isSignup ? 'new-password' : 'current-password'}" />
          </label>
          <div class="full auth-error" id="auth-error" hidden></div>
          <div class="modal-actions full">
            <button type="submit" id="auth-submit">${isSignup ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
          </div>
        </form>
      </div>
    `;

    view.querySelectorAll('.auth-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.tab;
        render();
      });
    });

    view.querySelector('#auth-form').addEventListener('submit', onSubmit);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const errEl = view.querySelector('#auth-error');
    const submit = view.querySelector('#auth-submit');
    errEl.hidden = true;
    submit.classList.add('btn-loading');
    submit.disabled = true;

    const payload = {
      email: form.email.value.trim().toLowerCase(),
      password: form.password.value,
    };
    if (mode === 'signup') payload.name = form.name.value.trim();

    try {
      const res = await fetch('/api/auth/' + mode, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }
      window.location.hash = '#/dashboard';
      window.location.reload();
    } catch (err) {
      errEl.textContent = err.message || 'Lỗi không xác định';
      errEl.hidden = false;
      submit.classList.remove('btn-loading');
      submit.disabled = false;
    }
  }

  render();
}
