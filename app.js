'use strict';

const sections = [
  { id: 'front-page', title: 'Front Page', subtitle: 'A little perspective, before the day begins.' },
  { id: 'technology', title: 'Technology', subtitle: 'The tools, ideas, and inventions worth understanding.' },
  { id: 'business', title: 'Business', subtitle: 'The companies and decisions shaping how we live.' },
  { id: 'world', title: 'World & Politics', subtitle: 'India and the wider world, with context.' },
  { id: 'formula-one', title: 'Formula One', subtitle: 'Beyond the chequered flag.' },
  { id: 'sport', title: 'Sport', subtitle: 'The stories behind the score.' },
  { id: 'deals', title: 'The Smart Buy', subtitle: 'Reported offers. Check the retailer before buying.' }
];
const validSections = new Set([...sections.map(section => section.id), 'local']);
const edition = document.querySelector('#edition');
const reader = document.querySelector('#article-reader');
const editionStage = document.querySelector('#edition-stage');
const pageMotion = Object.freeze({ duration: 680, easing: 'cubic-bezier(.4,0,.6,1)' });
let activePageTurn = null;
const savedStories = new Map();
let stories = [];
let storyById = new Map();
let editionData = null;
let currentSection = 'front-page';
let activeStoryId = null;
let textSize = 0;
let toastTimer;
const requestedDate = new URLSearchParams(location.search).get('edition');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || !url.hostname.includes('.') || /^\d+(\.\d+){3}$/.test(url.hostname)
      || /\.(local|localhost|internal)$/.test(url.hostname)) return '';
    return url.href;
  } catch { return ''; }
}
function validStory(story) {
  return story && /^[a-f0-9]{20}$/.test(story.id) && validSections.has(story.section)
    && typeof story.title === 'string' && story.title.length > 0 && story.title.length <= 350
    && typeof story.source === 'string' && typeof story.deck === 'string' && story.deck.length <= 2000
    && Boolean(safeUrl(story.url)) && Number.isFinite(Date.parse(story.publishedAt))
    && (story.summary === undefined || (Array.isArray(story.summary) && story.summary.length <= 8
      && story.summary.every(paragraph => typeof paragraph === 'string' && paragraph.length <= 2000)));
}
function dateInIndia(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
function formatDate(value, short = false) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: short ? 'short' : 'long', ...(short ? {} : { weekday: 'long', year: 'numeric' }) }).format(new Date(value));
}
function formatTime(value) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) + ' IST';
}
function announce(message) {
  const status = document.querySelector('#status');
  clearTimeout(toastTimer);
  status.textContent = message;
  status.hidden = false;
  toastTimer = setTimeout(() => { status.hidden = true; }, 4500);
}
try {
  const stored = JSON.parse(localStorage.getItem('vrushabh-daily-shelf') || '[]');
  if (Array.isArray(stored)) stored.filter(validStory).forEach(story => savedStories.set(story.id, story));
} catch { announce('Saved stories are available for this visit. Browser storage is unavailable.'); }

function sectionName(id) {
  return id === 'local' ? 'Closer to home' : sections.find(section => section.id === id)?.title || 'Saved Stories';
}
function headline(story, level = 'h2') {
  return `<${level}><a class="headline-link" href="${escapeHtml(safeUrl(story.url))}" data-article="${story.id}">${escapeHtml(story.title)}</a></${level}>`;
}
function readButton(story) {
  return `<button class="read-link" type="button" data-article="${story.id}">Read story <span aria-hidden="true">↗</span><span class="sr-only">: ${escapeHtml(story.title)}</span></button>`;
}
function metadata(story) {
  return `<p class="byline">${escapeHtml(story.source)} · ${story.timestampType === 'updated' ? 'Updated ' : ''}${escapeHtml(formatDate(story.publishedAt, true))}, ${escapeHtml(formatTime(story.publishedAt))}${story.older ? ' · 24–48h' : ''}${story.updated ? ' · Updated story' : ''}${story.kind === 'analysis' ? ' · Analysis' : ''}</p>`;
}
function excerptText(story) {
  return story.deck || 'A headline from the publisher. Open the original report for details.';
}
function leadImage(story) {
  const image = story.image;
  if (!image || image.kind !== 'publisher' || !/^assets\/news\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(image.src)) return '';
  return `<figure class="lead-figure"><img data-story-image src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || `Image accompanying the ${story.source} report`)}" width="1536" height="1024" fetchpriority="high"><figcaption>Image supplied with <a href="${escapeHtml(safeUrl(story.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(image.credit || story.source)}’s report</a>.</figcaption></figure>`;
}
function storyCard(story) {
  const saved = savedStories.has(story.id);
  return `<article class="section-story"><p class="eyebrow">${escapeHtml(sectionName(story.section))}${story.scope === 'india' ? ' / INDIA' : ''}</p>${headline(story)}${metadata(story)}<p>${escapeHtml(excerptText(story))}</p>${story.section === 'deals' ? '<p class="offer-note">Reported offer · Price and stock are not independently verified.</p>' : ''}<div class="story-actions">${readButton(story)}<button class="save-button" type="button" data-save="${story.id}" aria-pressed="${saved}" aria-label="${saved ? 'Unsave' : 'Save'}: ${escapeHtml(story.title)}">${saved ? 'Saved ✓' : 'Save +'}</button></div></article>`;
}
function frontPage() {
  const lead = stories.find(story => story.section === 'technology') || stories[0];
  if (!lead) return emptyState('No new stories passed selection.', 'This edition has no stories to display.');
  const picked = new Set([lead.id]);
  const pick = section => {
    const story = stories.find(item => item.section === section && !picked.has(item.id));
    if (story) picked.add(story.id);
    return story;
  };
  const briefs = ['business', 'world', 'world'].map(pick).filter(Boolean);
  const teasers = ['formula-one', 'technology', 'deals'].map(pick).filter(Boolean);
  const local = stories.find(story => story.section === 'local');
  return `<div class="front-grid"><article class="lead"><p class="eyebrow">The big picture <span class="issue-label">${escapeHtml(sectionName(lead.section))}</span></p>${headline(lead, 'h1')}<p class="deck">${escapeHtml(excerptText(lead))}</p>${metadata(lead)}${leadImage(lead)}${readButton(lead)}</article><aside class="brief-rail" aria-label="The morning brief"><h2 class="sidebar-title">The morning brief</h2><div class="briefs">${briefs.map((story, index) => `<article class="brief"><p class="brief-number">0${index + 1} / ${escapeHtml(sectionName(story.section)).toUpperCase()}</p>${headline(story, 'h3')}<p>${escapeHtml(excerptText(story))}</p>${metadata(story)}</article>`).join('')}</div><div class="contents-note"><p>For the curious mind.<br>And the morning coffee.</p><a href="#formula-one">In the paddock <span>05</span></a><a href="#deals">The smart buy <span>07</span></a></div></aside></div><div class="below-fold">${teasers.map((story, index) => `<article class="teaser"><p class="eyebrow">${escapeHtml(sectionName(story.section))}</p>${index === 0 ? '<div class="racing-rule" aria-hidden="true"></div>' : ''}${headline(story)}${metadata(story)}<p>${escapeHtml(excerptText(story))}</p>${readButton(story)}</article>`).join('')}</div>${local ? `<section class="local-brief"><p class="eyebrow">Closer to home · One local brief</p>${headline(local)}${metadata(local)}<p>${escapeHtml(excerptText(local))}</p>${readButton(local)}</section>` : ''}${sourceDetails()}`;
}
function sourceDetails() {
  const available = editionData.sources.filter(source => source.status === 'ok').length;
  return `<details class="source-details"><summary>Sources for this edition · ${available} of ${editionData.sources.length} feeds available</summary><p>Publisher reports are attributed. Similar headlines are grouped where detected. Linked reports do not establish independent verification.</p><ul>${editionData.sources.map(source => `<li><span>${escapeHtml(source.name)} · ${escapeHtml(sectionName(source.section))}</span><span>${source.status === 'ok' ? `${Number(source.count) || 0} recent items` : 'Unavailable'}</span></li>`).join('')}</ul></details>`;
}
function emptyState(title, text, retry = false) {
  return `<div class="empty-state"><p class="eyebrow">The Vrushabh Daily</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><button class="outlined-button" type="button" ${retry ? 'data-retry' : 'data-go-front'}>${retry ? 'Try again' : 'Read the front page'}</button>${retry && requestedDate ? '<p><a href="./">Open the latest edition</a></p>' : ''}</div>`;
}
function updateSavedControls() {
  document.querySelector('#saved-count').textContent = savedStories.size;
  document.querySelector('#saved-stories').setAttribute('aria-label', `Saved stories, ${savedStories.size} ${savedStories.size === 1 ? 'story' : 'stories'}`);
  const saved = savedStories.has(activeStoryId);
  const button = document.querySelector('#save-article');
  button.textContent = saved ? 'Saved · Remove from saved stories' : 'Save this story';
  button.setAttribute('aria-pressed', String(saved));
}
function renderSection(id) {
  const selected = sections.find(section => section.id === id);
  currentSection = selected ? id : id === 'saved' ? 'saved' : 'front-page';
  const index = sections.findIndex(section => section.id === currentSection);
  document.querySelectorAll('[data-section]').forEach(link => {
    if (link.dataset.section === currentSection) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelector('#saved-stories').setAttribute('aria-pressed', String(currentSection === 'saved'));
  document.querySelectorAll('[data-page-number]').forEach(label => { label.textContent = index < 0 ? 'SAVED' : `${String(index + 1).padStart(2, '0')} / 07`; });
  document.querySelectorAll('[data-page-step]').forEach(button => {
    button.disabled = !editionData || (Number(button.dataset.pageStep) < 0 ? index <= 0 : index === sections.length - 1);
  });
  document.title = `${sectionName(currentSection)} — The Vrushabh Daily`;
  if (!editionData && currentSection !== 'saved') return;
  if (currentSection === 'front-page') edition.innerHTML = frontPage();
  else {
    const filtered = currentSection === 'saved' ? [...savedStories.values()] : stories.filter(story => story.section === currentSection);
    edition.innerHTML = `<header class="section-heading"><div><p class="eyebrow">The Vrushabh Daily</p><h1>${escapeHtml(sectionName(currentSection))}</h1><p>${escapeHtml(selected?.subtitle || 'Keep a little something for later.')}</p></div><span class="section-page-label">${filtered.length} ${filtered.length === 1 ? 'STORY' : 'STORIES'}</span></header>${filtered.length ? `<div class="story-list">${filtered.map(storyCard).join('')}</div>` : emptyState(currentSection === 'saved' ? 'A good story can wait.' : 'A quieter day in this section.', currentSection === 'saved' ? 'Save a story while you read. It stays here across editions in this browser.' : 'No fresh stories passed selection. There is no older filler.')}`;
  }
  updateSavedControls();
}
function finishPageTurn(focus = true) {
  const turn = activePageTurn;
  if (!turn) return;
  activePageTurn = null;
  turn.animations.forEach(animation => animation.cancel());
  turn.leaf.remove();
  turn.shadow.remove();
  editionStage.style.minHeight = '';
  editionStage.classList.remove('is-turning');
  edition.inert = false;
  edition.setAttribute('aria-busy', 'false');
  if (focus) edition.focus({ preventScroll: true });
}
function turnToSection(id) {
  const target = sections.some(section => section.id === id) || id === 'saved' ? id : 'front-page';
  if (target === currentSection) return;
  finishPageTurn(false);
  const previous = sections.findIndex(section => section.id === currentSection);
  const next = sections.findIndex(section => section.id === target);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!editionData || previous < 0 || next < 0 || reduceMotion || typeof edition.animate !== 'function') {
    renderSection(target);
    edition.focus({ preventScroll: true });
    return;
  }
  const direction = next > previous ? 1 : -1;
  const height = edition.offsetHeight;
  const leaf = document.createElement('div');
  leaf.className = `page-leaf ${direction > 0 ? 'turn-forward' : 'turn-backward'}`;
  leaf.setAttribute('aria-hidden', 'true');
  leaf.inert = true;
  const front = document.createElement('div');
  front.className = 'page-face page-face-front';
  front.append(...[...edition.childNodes].map(node => node.cloneNode(true)));
  front.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  front.querySelectorAll('a,button,summary,select,[tabindex]').forEach(node => node.setAttribute('tabindex', '-1'));
  const back = document.createElement('div');
  back.className = 'page-face page-face-back';
  leaf.append(front, back);
  const shadow = document.createElement('div');
  shadow.className = 'page-turn-shadow';
  shadow.setAttribute('aria-hidden', 'true');
  leaf.style.height = `${height}px`;
  renderSection(target);
  editionStage.style.minHeight = `${Math.max(height, edition.offsetHeight)}px`;
  editionStage.classList.add('is-turning');
  edition.inert = true;
  edition.setAttribute('aria-busy', 'true');
  editionStage.append(shadow, leaf);
  if (window.scrollY > document.querySelector('.paper').offsetTop + 120) {
    window.scrollTo({ top: document.querySelector('.paper').offsetTop, behavior: 'instant' });
  }
  const options = { duration: pageMotion.duration, easing: pageMotion.easing, fill: 'both' };
  const fold = leaf.animate([
    { transform: 'rotateY(0deg) skewY(0deg)', opacity: 1 },
    { transform: `rotateY(${-direction * 45}deg) skewY(${-direction * 1.4}deg)`, opacity: 1, offset: .5 },
    { transform: `rotateY(${-direction * 135}deg) skewY(${-direction * 2.5}deg)`, opacity: 0 }
  ], options);
  const shadowAnimation = shadow.animate([{ opacity: 0 }, { opacity: .24, offset: .4 }, { opacity: 0 }], options);
  const incoming = edition.animate([{ opacity: .3 }, { opacity: 1 }], { ...options, duration: pageMotion.duration * .75, delay: pageMotion.duration * .15 });
  const turn = { leaf, shadow, animations: [fold, shadowAnimation, incoming] };
  activePageTurn = turn;
  Promise.all(turn.animations.map(animation => animation.finished.catch(() => {}))).then(() => {
    if (activePageTurn === turn) finishPageTurn();
  });
  document.querySelector('#page-announcement').textContent = `${sectionName(target)}, page ${next + 1} of ${sections.length}.`;
}
function stepPage(step) {
  if (!editionData) return;
  const index = sections.findIndex(section => section.id === currentSection);
  const next = index + step;
  if (next >= 0 && next < sections.length) location.hash = sections[next].id;
}
function toggleSaved(id) {
  const story = storyById.get(id) || savedStories.get(id);
  if (!story) return;
  if (savedStories.has(id)) savedStories.delete(id); else savedStories.set(id, story);
  let persisted = true;
  try { localStorage.setItem('vrushabh-daily-shelf', JSON.stringify([...savedStories.values()])); }
  catch { persisted = false; }
  updateSavedControls();
  if (currentSection !== 'front-page') {
    const focusId = document.activeElement?.dataset.save;
    renderSection(currentSection);
    if (focusId) (edition.querySelector(`[data-save="${focusId}"]`) || edition.querySelector('[data-go-front]') || edition).focus({ preventScroll: true });
  }
  announce(persisted ? (savedStories.has(id) ? 'Story saved for later.' : 'Story removed from saved stories.') : 'Saved stories changed for this visit. Browser storage is unavailable.');
}
function openStory(id) {
  const story = storyById.get(id) || savedStories.get(id);
  if (!story) return;
  activeStoryId = id;
  document.querySelector('#reader-title').textContent = story.title;
  document.querySelector('#reader-category').textContent = sectionName(story.section);
  document.querySelector('#reader-deck').textContent = excerptText(story);
  document.querySelector('#reader-note').textContent = `${story.source} · ${story.timestampType === 'updated' ? 'Updated' : 'Published'} ${formatDate(story.publishedAt, true)}, ${formatTime(story.publishedAt)}${story.older ? ' · From the 24–48h window' : ''}${story.updated ? ' · Updated story' : ''}`;
  const coverage = Array.isArray(story.coverage) ? story.coverage.filter(item => item && safeUrl(item.url)) : [];
  const credited = coverage.length ? coverage : [{ source: story.source, url: story.url }];
  document.querySelector('#reader-body').innerHTML = `${story.summary?.length ? '' : '<p>This saved item belongs to an early preview. Open the latest edition for complete articles.</p>'}${story.section === 'deals' ? '<p class="offer-note">Prices and repair charges are reported figures. Live price, stock, and retailer conditions are not independently verified.</p>' : ''}<p class="source-brief-note">Written for The Vrushabh Daily · AI-assisted editorial.</p><details class="article-sources"><summary>Sources & credits</summary><ul>${credited.map(item => `<li><a href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source || story.source)}</a></li>`).join('')}</ul></details>`;
  if (story.summary?.length) {
    const body = document.querySelector('#reader-body');
    const paragraphs = story.summary.map(text => {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      return paragraph;
    });
    body.prepend(...paragraphs);
    const minutes = Math.max(1, Math.ceil(story.summary.join(' ').split(/\s+/).length / 200));
    document.querySelector('#reader-note').textContent += ` · ${minutes} min read`;
  }
  updateSavedControls();
  reader.showModal();
  reader.scrollTop = 0;
  document.body.classList.add('reader-open');
}
async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error('Edition request failed');
  return response.json();
}
async function loadEdition() {
  finishPageTurn(false);
  editionData = null;
  edition.setAttribute('aria-busy', 'true');
  edition.innerHTML = '<div class="empty-state"><p class="eyebrow">The morning paper</p><h1>Opening your edition…</h1></div>';
  try {
    if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) throw new Error('Invalid date');
    const path = requestedDate ? `data/editions/${requestedDate}.json` : 'data/latest.json';
    const [issue, archive] = await Promise.allSettled([fetchJson(path), fetchJson('data/index.json')]);
    if (issue.status !== 'fulfilled') throw new Error('Edition unavailable');
    const data = issue.value;
    if (!data || data.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)
      || !Array.isArray(data.stories) || !Array.isArray(data.sources)
      || !data.stories.every(validStory) || !Number.isFinite(Date.parse(data.generatedAt))
      || Date.parse(data.generatedAt) > Date.now() + 300000
      || dateInIndia(new Date(data.generatedAt)) !== data.date
      || !data.stories.every(story => {
        const age = Date.parse(data.generatedAt) - Date.parse(story.publishedAt);
        return age >= 0 && age <= 48 * 3600000;
      })
      || (requestedDate && requestedDate !== data.date)) throw new Error('Invalid edition');
    editionData = data;
    stories = data.stories;
    storyById = new Map(stories.map(story => [story.id, story]));
    document.querySelector('#edition-date').dateTime = data.date;
    document.querySelector('#edition-date').textContent = formatDate(`${data.date}T08:00:00+05:30`);
    document.querySelector('#edition-number').textContent = 'THE PERSONAL EDITION';
    document.querySelector('#collection-time').textContent = `Collected ${formatTime(data.generatedAt)}`;
    const old = data.date !== dateInIndia(new Date());
    document.querySelector('#edition-state').textContent = requestedDate ? 'From the archive' : old ? 'Latest available edition' : 'Your daily edition';
    const articleWords = stories.reduce((count, story) => count + (story.summary || []).join(' ').trim().split(/\s+/).filter(Boolean).length, 0);
    const readingTime = articleWords ? ` · ${Math.ceil(articleWords / 200)} min read` : '';
    document.querySelector('#issue-summary').textContent = `${stories.length} stories${readingTime} · Last 24 hours, with selected coverage up to 48h`;
    const unavailable = data.sources.filter(source => source.status !== 'ok').length;
    const notice = document.querySelector('#edition-notice');
    const messages = [];
    if (old) messages.push(requestedDate ? `Archive edition from ${formatDate(`${data.date}T08:00:00+05:30`, true)}. Stories reflect that edition’s collection time.` : `No edition for today is available. Showing ${formatDate(`${data.date}T08:00:00+05:30`, true)} with its original timestamps.`);
    if (unavailable) messages.push(`${unavailable} ${unavailable === 1 ? 'feed was' : 'feeds were'} unavailable. Available reporting is included.`);
    notice.textContent = messages.join(' ');
    notice.hidden = !messages.length;
    const picker = document.querySelector('#archive-select');
    const dates = archive.status === 'fulfilled' && Array.isArray(archive.value?.dates) ? archive.value.dates.filter(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) : [];
    picker.replaceChildren();
    picker.add(new Option('Latest', ''));
    new Set([data.date, ...dates]).forEach(date => picker.add(new Option(formatDate(`${date}T08:00:00+05:30`, true), date)));
    picker.value = requestedDate || '';
    picker.disabled = false;
    renderSection(location.hash.slice(1) || 'front-page');
  } catch {
    document.querySelector('#edition-state').textContent = 'Edition unavailable';
    document.querySelector('#edition-notice').hidden = true;
    edition.innerHTML = emptyState('Your newspaper could not open.', location.protocol === 'file:' ? 'Open the local server preview to read dated editions.' : 'Try again in a moment. Saved stories are still available in this browser.', true);
  } finally { edition.setAttribute('aria-busy', 'false'); updateSavedControls(); }
}
edition.addEventListener('click', event => {
  const article = event.target.closest('[data-article]');
  if (article) { event.preventDefault(); openStory(article.dataset.article); return; }
  const save = event.target.closest('[data-save]');
  if (save) toggleSaved(save.dataset.save);
  if (event.target.closest('[data-go-front]')) {
    if (currentSection === 'front-page') renderSection('front-page'); else location.hash = 'front-page';
  }
  if (event.target.closest('[data-retry]')) loadEdition();
});
edition.addEventListener('error', event => {
  if (event.target.matches('[data-story-image]')) event.target.closest('figure').hidden = true;
}, true);
document.querySelector('#close-reader').addEventListener('click', () => reader.close());
reader.addEventListener('close', () => {
  document.body.classList.remove('reader-open');
  (edition.querySelector(`[data-article="${activeStoryId}"]`) || edition).focus({ preventScroll: true });
});
reader.addEventListener('click', event => {
  const bounds = reader.getBoundingClientRect();
  if (event.target === reader && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) reader.close();
});
document.querySelector('#save-article').addEventListener('click', () => toggleSaved(activeStoryId));
document.querySelector('#saved-stories').addEventListener('click', () => { location.hash = 'saved'; });
document.querySelector('#text-size').addEventListener('click', () => {
  textSize = (textSize + 1) % 3;
  const labels = ['standard', 'large', 'larger'];
  document.documentElement.dataset.textSize = labels[textSize];
  document.querySelector('#text-size').setAttribute('aria-label', `Text size: ${labels[textSize]}. ${textSize === 2 ? 'Return to standard text size.' : 'Increase text size.'}`);
  announce(`Text size: ${labels[textSize]}.`);
});
document.querySelectorAll('[data-page-step]').forEach(button => {
  button.addEventListener('click', () => stepPage(Number(button.dataset.pageStep)));
});
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || reader.open
    || event.target.closest('input,select,textarea,[contenteditable="true"]') || !window.getSelection().isCollapsed) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    stepPage(event.key === 'ArrowRight' ? 1 : -1);
  }
});
document.querySelectorAll('[data-swipe-zone]').forEach(zone => {
  let start = null;
  let ignoreClicksUntil = 0;
  zone.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.clientX < 24 || event.clientX > innerWidth - 24) return;
    start = { x: event.clientX, y: event.clientY, time: performance.now() };
  });
  zone.addEventListener('pointercancel', () => { start = null; });
  zone.addEventListener('pointerup', event => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const elapsed = performance.now() - start.time;
    start = null;
    if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.7 && elapsed < 900) {
      ignoreClicksUntil = performance.now() + 350;
      stepPage(dx < 0 ? 1 : -1);
    }
  });
  zone.addEventListener('click', event => {
    if (performance.now() < ignoreClicksUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
});
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
  if (event.matches) finishPageTurn();
});
document.querySelector('#archive-select').addEventListener('change', event => {
  const url = new URL(location.href);
  if (event.target.value) url.searchParams.set('edition', event.target.value); else url.searchParams.delete('edition');
  location.href = url.href;
});
window.addEventListener('hashchange', () => {
  if (location.hash === '#edition') { finishPageTurn(false); edition.focus(); return; }
  turnToSection(location.hash.slice(1));
});
loadEdition();
