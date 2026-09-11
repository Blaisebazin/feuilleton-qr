(() => {
  const TOKEN_KEY = 'feuilleton_admin_token';

  const el = {
    loginView: document.getElementById('login-view'),
    adminView: document.getElementById('admin-view'),
    password: document.getElementById('password'),
    loginBtn: document.getElementById('login-btn'),
    loginMsg: document.getElementById('login-msg'),
    logoutBtn: document.getElementById('logout-btn'),
    form: document.getElementById('chapter-form'),
    title: document.getElementById('title'),
    text: document.getElementById('text'),
    image: document.getElementById('image'),
    author: document.getElementById('author'),
    formMsg: document.getElementById('form-msg'),
    chaptersList: document.getElementById('chapters-list'),
    formHeading: document.getElementById('form-heading'),
    submitBtn: document.getElementById('submit-btn'),
    cancelEditBtn: document.getElementById('cancel-edit-btn'),
    currentImageField: document.getElementById('current-image-field'),
    currentImagePreview: document.getElementById('current-image-preview'),
    removeImage: document.getElementById('remove-image'),
    bookTitle: document.getElementById('book-title'),
    synopsis: document.getElementById('synopsis'),
    saveTitleBtn: document.getElementById('save-title-btn'),
    titleMsg: document.getElementById('title-msg')
  };

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function showMsg(node, text, kind) {
    node.textContent = text;
    node.className = `form-msg ${kind}`;
    node.hidden = false;
  }

  async function authedFetch(url, opts = {}) {
    const headers = opts.headers || {};
    headers.Authorization = `Bearer ${getToken()}`;
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401) {
      clearToken();
      showLogin();
      throw new Error('Session expirée, reconnectez-vous.');
    }
    return res;
  }

  function showLogin() {
    el.loginView.classList.remove('hidden');
    el.adminView.classList.add('hidden');
  }

  function showAdmin() {
    el.loginView.classList.add('hidden');
    el.adminView.classList.remove('hidden');
    loadChapters();
    loadBookTitle();
  }

  async function loadBookTitle() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      el.bookTitle.value = data.bookTitle || '';
      el.synopsis.value = data.synopsis || '';
    } catch {
      /* pas bloquant */
    }
  }

  el.saveTitleBtn.addEventListener('click', async () => {
    el.titleMsg.hidden = true;
    try {
      const res = await authedFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookTitle: el.bookTitle.value, synopsis: el.synopsis.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Échec de l\'enregistrement.');
      showMsg(el.titleMsg, 'Titre et synopsis enregistrés.', 'success');
    } catch (err) {
      showMsg(el.titleMsg, err.message, 'error');
    }
  });

  el.loginBtn.addEventListener('click', async () => {
    el.loginMsg.hidden = true;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: el.password.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Échec de connexion.');
      setToken(data.token);
      el.password.value = '';
      showAdmin();
    } catch (err) {
      showMsg(el.loginMsg, err.message, 'error');
    }
  });

  el.password.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.loginBtn.click();
  });

  el.logoutBtn.addEventListener('click', () => {
    clearToken();
    showLogin();
  });

  let editingId = null;

  function startEdit(chapter) {
    editingId = chapter.id;
    el.title.value = chapter.title;
    el.text.value = chapter.text;
    el.author.value = chapter.author;
    el.image.value = '';
    el.removeImage.checked = false;

    if (chapter.image) {
      el.currentImageField.hidden = false;
      el.currentImagePreview.src = chapter.image;
    } else {
      el.currentImageField.hidden = true;
    }

    el.formHeading.textContent = `Modifier « ${chapter.title} »`;
    el.submitBtn.textContent = 'Enregistrer les modifications';
    el.cancelEditBtn.classList.remove('hidden');
    el.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    editingId = null;
    el.form.reset();
    el.author.value = 'Blaise BAZINGA';
    el.currentImageField.hidden = true;
    el.formHeading.textContent = 'Nouveau chapitre';
    el.submitBtn.textContent = 'Publier ce chapitre';
    el.cancelEditBtn.classList.add('hidden');
    el.formMsg.hidden = true;
  }

  el.cancelEditBtn.addEventListener('click', cancelEdit);

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.formMsg.hidden = true;
    const fd = new FormData();
    fd.append('title', el.title.value);
    fd.append('text', el.text.value);
    fd.append('author', el.author.value);
    if (el.image.files[0]) fd.append('image', el.image.files[0]);

    try {
      let res;
      if (editingId) {
        if (el.removeImage.checked && !el.image.files[0]) fd.append('removeImage', 'true');
        res = await authedFetch(`/api/admin/chapters/${editingId}`, { method: 'PUT', body: fd });
      } else {
        res = await authedFetch('/api/admin/chapters', { method: 'POST', body: fd });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Échec de l\'enregistrement.');

      if (editingId) {
        showMsg(el.formMsg, 'Chapitre mis à jour.', 'success');
        cancelEdit();
      } else {
        showMsg(el.formMsg, 'Chapitre publié — il est maintenant le dernier affiché aux lecteurs.', 'success');
        el.form.reset();
        el.author.value = 'Blaise BAZINGA';
      }
      loadChapters();
    } catch (err) {
      showMsg(el.formMsg, err.message, 'error');
    }
  });

  async function loadChapters() {
    try {
      const res = await authedFetch('/api/admin/chapters');
      const chapters = await res.json();
      renderChapters(chapters);
    } catch (err) {
      el.chaptersList.innerHTML = `<p class="form-msg error">${err.message}</p>`;
    }
  }

  function renderChapters(chapters) {
    el.chaptersList.innerHTML = '';
    if (!chapters.length) {
      el.chaptersList.innerHTML = '<p class="form-msg">Aucun chapitre publié pour l\'instant.</p>';
      return;
    }
    const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    chapters.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'chapter-row';
      row.innerHTML = `
        <div class="info">
          <span class="t">${escapeHTML(c.title)}${i === 0 ? '<span class="tag-latest"> · chapitre actuel</span>' : ''}${c.image ? ' 🖼' : ''}</span>
          <span class="d">${fmt.format(new Date(c.publishedAt))} — ${escapeHTML(c.author)}</span>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="btn secondary" data-action="edit">Modifier</button>
          <button class="btn danger" data-action="delete">Supprimer</button>
        </div>
      `;
      row.querySelector('[data-action="edit"]').addEventListener('click', () => startEdit(c));
      row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteChapter(c.id, c.title));
      el.chaptersList.appendChild(row);
    });
  }

  async function deleteChapter(id, title) {
    if (!confirm(`Supprimer définitivement « ${title} » ?`)) return;
    try {
      const res = await authedFetch(`/api/admin/chapters/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Suppression impossible.');
      if (editingId === id) cancelEdit();
      loadChapters();
    } catch (err) {
      alert(err.message);
    }
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  if (getToken()) showAdmin(); else showLogin();
})();
