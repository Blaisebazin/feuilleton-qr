(() => {
  // Correctif hauteur mobile : 100vh/100dvh ne tient pas toujours compte correctement
  // de la barre d'adresse qui se réduit/s'agrandit sur mobile. On calcule la vraie
  // hauteur visible en JS et on l'expose en variable CSS --vh, mise à jour en continu.
  function setViewportHeightVar() {
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  }
  setViewportHeightVar();
  window.addEventListener('resize', setViewportHeightVar);
  window.addEventListener('orientationchange', setViewportHeightVar);

  const el = {
    siteTitle: document.getElementById('site-title'),
    siteSynopsis: document.getElementById('site-synopsis'),
    postmark: document.getElementById('postmark'),
    eyebrow: document.getElementById('chapter-eyebrow'),
    title: document.getElementById('chapter-title'),
    content: document.getElementById('page-content'),
    scrollHint: document.getElementById('scroll-hint'),
    prevPage: document.getElementById('prev-page'),
    nextPage: document.getElementById('next-page'),
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

  let chaptersList = [];   // liste légère { id, title, author, publishedAt }
  let currentChapter = null;
  let currentIndex = 0;    // 0 = dernier chapitre publié
  let total = 0;
  let bookTitle = '';

  const dateFormatterLong = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  const dateFormatterShort = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short'
  });
  const yearFormatter = new Intl.DateTimeFormat('fr-FR', { year: 'numeric' });

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
        el.siteSynopsis.hidden = false;
      } else {
        el.siteSynopsis.hidden = true;
      }
    } catch {
      /* pas bloquant si ça échoue */
    }
  }

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
    el.postmark.innerHTML = `${dateFormatterShort.format(date).toUpperCase()}<br>${yearFormatter.format(date)}`;
  }

  function paragraphsOf(text) {
    return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  }

  // Le chapitre entier (image + texte + signature) est rendu d'un coup dans un
  // conteneur qui défile nativement — plus de découpage artificiel en "pages".
  function renderChapterContent() {
    el.content.innerHTML = '';
    el.content.scrollTop = 0;

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

    // Laisse le temps au navigateur de calculer les dimensions avant de juger
    // s'il y a de quoi défiler.
    requestAnimationFrame(updateScrollButtons);
  }

  function updateScrollButtons() {
    const { scrollTop, scrollHeight, clientHeight } = el.content;
    const atTop = scrollTop <= 2;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 2;

    el.prevPage.disabled = atTop;
    el.nextPage.disabled = atBottom;

    const canScroll = scrollHeight > clientHeight + 2;
    el.scrollHint.classList.toggle('hidden-hint', !canScroll || atBottom);
  }

  function scrollByScreen(direction) {
    el.content.scrollBy({ top: direction * el.content.clientHeight * 0.85, behavior: 'smooth' });
  }

  el.prevPage.addEventListener('click', () => scrollByScreen(-1));
  el.nextPage.addEventListener('click', () => scrollByScreen(1));

  let scrollTicking = false;
  el.content.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      updateScrollButtons();
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
    resizeTimer = setTimeout(updateScrollButtons, 200);
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
