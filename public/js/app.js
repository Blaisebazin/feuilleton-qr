(() => {
  function setViewportHeightVar() {
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  }
  setViewportHeightVar();
  window.addEventListener('resize', setViewportHeightVar);
  window.addEventListener('orientationchange', setViewportHeightVar);

  const el = {
    siteTitle: document.getElementById('site-title'),
    synopsisToggle: document.getElementById('synopsis-toggle'),
    siteSynopsis: document.getElementById('site-synopsis'),
    eyebrow: document.getElementById('chapter-eyebrow'),
    title: document.getElementById('chapter-title'),
    content: document.getElementById('chapter-content'),
    scrollArea: document.getElementById('scroll-area'),
    scrollHint: document.getElementById('scroll-hint'),
    archiveBadge: document.getElementById('archive-badge'),
    btnPreviousChapter: document.getElementById('btn-previous-chapter'),
    btnHistory: document.getElementById('btn-history'),
    btnLatest: document.getElementById('btn-latest'),
    btnShare: document.getElementById('btn-share'),
    toast: document.getElementById('toast'),
    historyOverlay: document.getElementById('history-overlay'),
    historyList: document.getElementById('history-list'),
    historyClose: document.getElementById('history-close')
  };

  let chaptersList = [];
  let currentChapter = null;
  let currentIndex = 0;
  let total = 0;
  let bookTitle = '';

  const dateFormatterLong = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Erreur ${res.status}`);
    }
    return res.json();
  }

  async function loadList() {
    chaptersList = await fetchJSON('/api/chapters');
  }

  async function loadSiteTitle() {
    try {
      const { bookTitle: bt, synopsis } = await fetchJSON('/api/settings');
      bookTitle = bt || '';
      el.siteTitle.textContent = bookTitle;
      document.title = bookTitle || 'Le Feuilleton';
      if (synopsis) {
        el.siteSynopsis.textContent = synopsis;
        el.synopsisToggle.hidden = false;
      } else {
        el.synopsisToggle.hidden = true;
        el.siteSynopsis.hidden = true;
      }
    } catch {
      /* pas bloquant si ça échoue */
    }
  }

  el.synopsisToggle.addEventListener('click', () => {
    const isOpen = !el.siteSynopsis.hidden;
    el.siteSynopsis.hidden = isOpen;
    el.synopsisToggle.classList.toggle('open', !isOpen);
    el.synopsisToggle.innerHTML = isOpen
      ? 'Synopsis <span class="chev">⌄</span>'
      : 'Masquer le synopsis <span class="chev">⌄</span>';
  });

  async function loadLatest() {
    const data = await fetchJSON('/api/chapters/latest');
    applyChapter(data.chapter, data.index, data.total);
  }

  async function loadById(id) {
    const data = await fetchJSON(`/api/chapters/${id}`);
    applyChapter(data.chapter, data.index, data.total);
  }

  function applyChapter(chapter, index, totalCount) {
    currentChapter = chapter;
    currentIndex = index;
    total = totalCount;
    syncUrl();
    renderChapterShell();
    renderChapterContent();
    renderChrome();
    el.scrollArea.scrollTop = 0;
    requestAnimationFrame(updateScrollHint);
  }

  function syncUrl() {
    const isLatest = currentIndex === 0;
    const url = isLatest ? location.pathname : `${location.pathname}?c=${currentChapter.id}`;
    history.replaceState(null, '', url);
  }

  function renderChapterShell() {
    const date = new Date(currentChapter.publishedAt);
    el.eyebrow.textContent = `Chapitre diffusé le ${dateFormatterLong.format(date)}`;
    el.title.textContent = currentChapter.title;
  }

  function paragraphsOf(text) {
    return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  }

  function renderChapterContent() {
    el.content.innerHTML = '';

    if (currentChapter.image) {
      const wrap = document.createElement('div');
      wrap.className = 'chapter-image';
      const img = document.createElement('img');
      img.src = currentChapter.image;
      img.alt = currentChapter.title;
      wrap.appendChild(img);
      el.content.appendChild(wrap);
    }

    for (const text of paragraphsOf(currentChapter.text)) {
      const p = document.createElement('p');
      p.className = 'chapter-p';
      p.textContent = text;
      el.content.appendChild(p);
    }

    const sig = document.createElement('p');
    sig.className = 'signature';
    sig.textContent = `— ${currentChapter.author}`;
    el.content.appendChild(sig);
  }

  function updateScrollHint() {
    const { scrollTop, scrollHeight, clientHeight } = el.scrollArea;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 4;
    const canScroll = scrollHeight > clientHeight + 4;
    el.scrollHint.classList.toggle('hidden-hint', !canScroll || atBottom);
  }

  let scrollTicking = false;
  el.scrollArea.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      updateScrollHint();
      scrollTicking = false;
    });
  });

  function renderChrome() {
    const isArchive = currentIndex > 0;
    el.archiveBadge.hidden = !isArchive;
    if (isArchive) {
      el.archiveBadge.textContent = `Chapitre archivé — ${dateFormatterLong.format(new Date(currentChapter.publishedAt))}`;
    }
    el.btnLatest.hidden = !isArchive;
    el.btnPreviousChapter.disabled = currentIndex >= total - 1;
  }

  el.btnPreviousChapter.addEventListener('click', async () => {
    if (currentIndex >= total - 1) return;
    const target = chaptersList[currentIndex + 1] || (await loadList(), chaptersList[currentIndex + 1]);
    if (target) await loadById(target.id);
  });

  el.btnLatest.addEventListener('click', async () => {
    await loadLatest();
  });

  el.btnHistory.addEventListener('click', async () => {
    if (!chaptersList.length) await loadList();
    renderHistory();
    el.historyOverlay.classList.add('open');
  });
  el.historyClose.addEventListener('click', () => el.historyOverlay.classList.remove('open'));
  el.historyOverlay.addEventListener('click', (e) => {
    if (e.target === el.historyOverlay) el.historyOverlay.classList.remove('open');
  });

  function renderHistory() {
    el.historyList.innerHTML = '';
    if (!chaptersList.length) {
      el.historyList.innerHTML = '<p class="empty-state">Aucun chapitre publié pour l\'instant.</p>';
      return;
    }
    chaptersList.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'history-item' + (currentChapter && c.id === currentChapter.id ? ' current' : '');
      btn.innerHTML = `<span class="h-title">${escapeHTML(c.title)}</span><span class="h-date">${dateFormatterLong.format(new Date(c.publishedAt))}${i === 0 ? ' · dernier chapitre' : ''}</span>`;
      btn.addEventListener('click', async () => {
        el.historyOverlay.classList.remove('open');
        await loadById(c.id);
      });
      el.historyList.appendChild(btn);
    });
  }

  el.btnShare.addEventListener('click', shareCurrentChapter);

  async function shareCurrentChapter() {
    if (!currentChapter) return;
    const url = location.href;
    const title = bookTitle ? `${bookTitle} — ${currentChapter.title}` : currentChapter.title;
    const text = `Je te partage « ${bookTitle || currentChapter.title} » — lis le chapitre ici :`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (err) {
        /* l'utilisateur a annulé le partage, rien à faire */
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast('Lien copié — colle-le où tu veux pour inviter quelqu\'un !');
    } catch {
      showToast(url);
    }
  }

  let toastTimer = null;
  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200);
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateScrollHint, 200);
  });

  async function boot() {
    try {
      await loadSiteTitle();
      await loadList();
      const params = new URLSearchParams(location.search);
      const sharedId = params.get('c');
      if (sharedId) {
        try {
          await loadById(sharedId);
        } catch {
          await loadLatest();
        }
      } else {
        await loadLatest();
      }
    } catch (err) {
      el.title.textContent = 'Aucun chapitre pour le moment';
      el.eyebrow.textContent = '';
      el.content.innerHTML = `<p class="empty-state">${escapeHTML(err.message)}</p>`;
    }
  }

  boot();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
})();
