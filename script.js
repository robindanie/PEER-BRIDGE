import {
  registerUser,
  updateUser,
  createSessionRequest,
  acceptSessionRequest,
  rejectSessionRequest,
  completeSession,
  submitRating,
  getUserByEmail,
  getUserById,
  getAllUsers,
  getSessionsForUser,
  getAllSessions,
  findPendingOrAcceptedSession,
  createNotification,
  getNotificationsForUser,
  updateNotification,
  deleteNotification,
  subscribeNotificationsForUser,
  subscribeSessionsForUser,
  addReview,
  getReviewsForUser
} from './firebase.js';

const SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'OOPS with C++',
  'Java',
  'Python',
  'Data Structures',
  'Database Systems'
];

const page = document.body.dataset.page;
const AUTH_KEY = 'peerbridgeCurrentUser';

// Global subject pool loaded from all Firebase users
let GLOBAL_SUBJECTS_CACHE = null;
async function loadGlobalSubjects() {
  if (GLOBAL_SUBJECTS_CACHE) return GLOBAL_SUBJECTS_CACHE;
  try {
    const allUsers = await getAllUsers();
    const allSubjects = new Set(SUBJECTS);
    allUsers.forEach(u => {
      (u.strongSubjects || []).forEach(s => allSubjects.add(s));
      (u.weakSubjects || []).forEach(s => allSubjects.add(s));
    });
    GLOBAL_SUBJECTS_CACHE = [...allSubjects].sort();
  } catch (e) {
    GLOBAL_SUBJECTS_CACHE = [...SUBJECTS];
  }
  return GLOBAL_SUBJECTS_CACHE;
}

function setActiveNav() {
  document.querySelectorAll('nav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href && location.pathname.endsWith(href)) a.classList.add('active');
    else a.classList.remove('active');
  });
}

function setCurrentUser(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}

function clearCurrentUser() {
  localStorage.removeItem(AUTH_KEY);
}

function getCurrentUser() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    clearCurrentUser();
    return null;
  }
}

function requireUserOrRedirect() {
  const user = getCurrentUser();
  if (!user) {
    location.href = 'index.html';
    return null;
  }
  return user;
}

function intersects(a = [], b = []) {
  return Array.isArray(a) && Array.isArray(b) && a.some((item) => b.includes(item));
}

function sortByRegionPriority(items, region) {
  return items.sort((a, b) => {
    const aRegion = (a.region || '').trim().toLowerCase() === (region || '').trim().toLowerCase();
    const bRegion = (b.region || '').trim().toLowerCase() === (region || '').trim().toLowerCase();
    if (aRegion !== bRegion) {
      return aRegion ? -1 : 1;
    }
    return (b.rating || 0) - (a.rating || 0);
  });
}

const AVAILABILITY_DAYS = ['Weekdays', 'Weekends'];
const AVAILABILITY_TIMES = ['Morning (6-10 AM)', 'Afternoon (12-4 PM)', 'Evening (5-9 PM)'];

function ratingToStars(r) {
  const val = Math.round(Number(r || 0));
  return Math.max(1, Math.min(5, val));
}

function getModalContainer() {
  return document.getElementById('modalContainer');
}

function getToastContainer() {
  return document.getElementById('toastContainer');
}

function closeModal() {
  const modalContainer = getModalContainer();
  if (!modalContainer) return;
  modalContainer.innerHTML = '';
  modalContainer.classList.add('hidden');
  modalContainer.setAttribute('aria-hidden', 'true');
}

function openModal(contentHtml) {
  const modalContainer = getModalContainer();
  if (!modalContainer) return;
  modalContainer.innerHTML = '<div class="modal" role="dialog">' + contentHtml + '</div>';
  modalContainer.classList.remove('hidden');
  modalContainer.setAttribute('aria-hidden', 'false');
  modalContainer.addEventListener('click', (e) => {
    if (e.target === modalContainer) closeModal();
  }, { once: true });
}

function showToast(message) {
  const toastContainer = getToastContainer();
  if (!toastContainer) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.remove(); }, 3200);
}

function setButtonLoading(btn, loadingText, loading) {
  if (!btn) return;
  const spinner = btn.querySelector('.btn-spinner');
  const text = btn.querySelector('.btn-text') || btn;
  if (loading) {
    btn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    if (text) text.textContent = loadingText;
  } else {
    btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

async function getProfileContextType(userId) {
  const curr = getCurrentUser();
  if (!curr || !userId) return null;
  const target = await getUserById(userId);
  if (!target) return null;
  if (intersects(target.strongSubjects || [], curr.weakSubjects || [])) return 'tutor';
  if (intersects(target.weakSubjects || [], curr.strongSubjects || [])) return 'student';
  if (page === 'student') return 'tutor';
  if (page === 'tutor') return 'student';
  return null;
}

async function openProfileModal(userId, contextType) {
  const all = await getAllUsers();
  const target = all.find((u) => u.id === userId) || await getUserById(userId);
  if (!target) return;
  const strongTags = (target.strongSubjects || []).map(s => `<span class="tag">${s}</span>`).join('');
  const weakTags = (target.weakSubjects || []).map(s => `<span class="tag">${s}</span>`).join('');
  const availability = (target.availabilityDays || []).map(d => `<span class="badge">${d}</span>`).join('') + ' ' + (target.availabilityTime || []).map(t => `<span class="badge">${t}</span>`).join(' ');
  const address = target.address || {};
  const addressText = `${address.doorNumber ? address.doorNumber + ', ' : ''}${address.street ? address.street + '<br/>' : ''}${address.city ? address.city + '<br/>' : ''}${address.state ? address.state + ' - ' : ''}${address.postalCode || ''}`;
  const left = `<div class="profile-left"><div class="profile-identity card"><div class="avatar-placeholder">${(target.name||'?').slice(0,1)}</div><div><h3>${target.name || 'Unknown'}</h3><div class="meta"><span class="stars">${'★'.repeat(ratingToStars(target.rating != null ? target.rating : 3))}</span><span class="review-count"> ${target.totalRatings || 0} Reviews</span></div></div></div><div class="card"><div class="profile-label">Email</div><div class="profile-value">${target.email || '-'}</div></div><div class="card"><div class="profile-label">Phone</div><div class="profile-value">${target.phone || '-'}</div></div><div class="card"><div class="profile-label">Region</div><div class="profile-value">${target.region || '-'}</div></div><div class="card"><div class="profile-label">About Me</div><div class="profile-value">${target.bio || 'No bio added.'}</div></div></div>`;
  const middle = `<div class="profile-middle"><div class="card"><div class="profile-label">Address</div><div class="profile-value">${addressText || '-'}</div></div><div class="card"><div class="profile-label">Availability</div><div class="profile-value">${availability || '-'}</div></div><div class="card"><div class="profile-label">Strong Subjects</div><div class="profile-value">${strongTags || '-'}</div></div><div class="card"><div class="profile-label">Weak Subjects</div><div class="profile-value">${weakTags || '-'}</div></div></div>`;
  const right = `<div class="profile-right"><div id="reviewsPreview" class="card reviews-column"><div class="profile-label">Reviews</div><div class="profile-value">Loading...</div></div></div>`;
  const footer = `<div class="actions"><button id="closeModalBtn" class="btn secondary">Close</button> ${(contextType === 'tutor') ? `<button class="btn request-session" data-id="${userId}">Request Session</button>` : `<button class="btn offer-help" data-id="${userId}">Offer Help</button>`}</div>`;
  const gridHtml = `<div class="profile-modal-grid">${left}${middle}${right}</div>${footer}`;
  openModal(gridHtml);
  document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
  const modalContainer = getModalContainer();
  modalContainer?.querySelector('.request-session')?.addEventListener('click', (e) => { const id = e.target.dataset.id; openSessionModal(id, 'request'); });
  modalContainer?.querySelector('.offer-help')?.addEventListener('click', (e) => { const id = e.target.dataset.id; openSessionModal(id, 'offer'); });
  const modalEl = modalContainer?.querySelector('.modal');
  if (modalEl) {
    modalEl.classList.add('profile-modal','solid');
  }
  (async () => {
    try {
      const reviews = await getReviewsForUser(target.id);
      const preview = document.getElementById('reviewsPreview');
      if (!preview) return;
      preview.innerHTML = '';
      if (!reviews.length) { preview.innerHTML = '<div class="profile-label">Reviews</div><div class="profile-value">No reviews yet.</div>'; return; }
      const avg = target.rating != null ? ratingToStars(target.rating) : 3;
      const avgHtml = `<div class="reviews-summary"><div class="stars">${'★'.repeat(avg)}</div><div>${target.totalRatings || 0} Reviews</div></div>`;
      const list = document.createElement('div');
      list.className = 'review-list';
      reviews.slice().reverse().slice(0,5).forEach(r => {
        const card = document.createElement('div'); card.className = 'card review-card';
        const stars = '★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating))));
        const feedbackText = r.feedback ? `"${r.feedback}"` : 'No written feedback.';
        card.innerHTML = `<div class="stars">${stars}</div><div class="review-meta"><strong>${r.reviewerName || 'Reviewer'}</strong><span>${new Date(r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt || Date.now())).toLocaleDateString()}</span></div><div class="review-feedback">${feedbackText}</div>`;
        list.appendChild(card);
      });
      preview.innerHTML = '<div class="profile-label">Reviews</div>';
      preview.appendChild((() => { const d=document.createElement('div'); d.innerHTML = avgHtml; return d; })());
      preview.appendChild(list);
    } catch (err) { console.error('Failed to load reviews', err); }
  })();
  try { window.openProfileModal = openProfileModal; } catch (e) { /* ignore in restricted contexts */ }
}

async function checkDoubleBooking(tutorId, date, time, excludeSessionId) {
  const allSessions = await getAllSessions();
  return allSessions.some(s => {
    if (excludeSessionId && s.id === excludeSessionId) return false;
    const st = (s.status || '').toLowerCase();
    return s.tutorID === tutorId &&
           s.date === date &&
           s.time === time &&
           (st === 'accepted' || st === 'pending');
  });
}

async function openSessionModal(targetUserId, mode) {
  const modalContainer = getModalContainer();
  if (!modalContainer) return;
  const all = await getAllUsers();
  const target = all.find(u => u.id === targetUserId) || await getUserById(targetUserId);
  const curr = getCurrentUser();
  if (!target || !curr) return;
  let common = [];
  if (mode === 'request') common = (target.strongSubjects || []).filter(s => (curr.weakSubjects || []).includes(s));
  else common = (curr.strongSubjects || []).filter(s => (target.weakSubjects || []).includes(s));
  if (!common.length) { showToast('No subjects in common to schedule a session.'); return; }

  const availDays = (target.availabilityDays || []).map(d => d.trim().toLowerCase());
  const availTimes = (target.availabilityTime || []).map(t => t.trim().toLowerCase());

  const allowWeekdays = availDays.includes('weekdays');
  const allowWeekends = availDays.includes('weekends');
  const restrictDays = (allowWeekdays !== allowWeekends);

  const allowedSlots = [];
  if (availTimes.some(t => t.includes('morning'))) allowedSlots.push('Morning');
  if (availTimes.some(t => t.includes('afternoon'))) allowedSlots.push('Afternoon');
  if (availTimes.some(t => t.includes('evening'))) allowedSlots.push('Evening');
  const hasTimeRestrictions = allowedSlots.length > 0 && allowedSlots.length < 3;

  const subjectOptions = common.map(s => `<option value="${s}">${s}</option>`).join('');
  const title = mode === 'request' ? 'Request a Learning Session' : 'Offer Learning Support';

  const allSlots = [
    { key: 'Morning', label: '🌅 Morning' },
    { key: 'Afternoon', label: '☀️ Afternoon' },
    { key: 'Evening', label: '🌙 Evening' }
  ];
  const slotButtons = allSlots.map(slot => {
    const disabled = hasTimeRestrictions && !allowedSlots.includes(slot.key);
    return `<button type="button" class="btn time-slot" data-slot="${slot.key}" ${disabled ? 'disabled' : ''}>${slot.label}</button>`;
  }).join('');

  let availHint = '';
  const targetName = target.name || 'This user';
  let availDaysHuman = 'All Days';
  if (restrictDays) {
    availDaysHuman = allowWeekdays ? 'Weekdays' : 'Weekends';
  }
  const availTimesHuman = allowedSlots.length > 0 ? allowedSlots.join(', ') : 'Any';

  const body = `<div class="session-dialog"><h3>${title}</h3><div class="card session-form-card"><label>Subject<select id="sessionSubject">${subjectOptions}</select></label><label>Session Date<input id="sessionDate" type="date" min="${new Date().toISOString().split('T')[0]}" /><span class="avail-hint" style="font-size:0.82rem;color:rgba(226,232,240,0.8);margin-top:2px;">${targetName} is available on: ${availDaysHuman}</span></label><div id="timeSlots" class="time-slots">${slotButtons}</div><span class="avail-hint" style="font-size:0.82rem;color:rgba(226,232,240,0.8);margin-top:-8px;">${hasTimeRestrictions ? `Available slots: ${availTimesHuman}` : ''}</span></div><div class="actions"><button id="cancelSessionBtn" class="btn secondary">Cancel</button><button id="sendSessionBtn" class="btn"><span class="btn-text">Send ${mode==='request'?'Request':'Offer'}</span><span class="btn-spinner hidden" aria-hidden="true"></span></button></div></div>`;
  openModal(body);
  const modalEl2 = modalContainer.querySelector('.modal');
  if (modalEl2) {
    modalEl2.classList.add('session-modal','solid');
  }
  let selectedSlot = null;
  const sendBtn = modalContainer.querySelector('#sendSessionBtn');
  const sendBtnText = sendBtn?.querySelector('.btn-text');
  const sendBtnSpinner = sendBtn?.querySelector('.btn-spinner');
  const timeSlotsEl = modalContainer.querySelector('#timeSlots');
  if (timeSlotsEl) {
    const labelEl = document.createElement('label'); labelEl.textContent = 'Time Slot';
    labelEl.style.cssText = 'font-size:0.93rem;font-weight:600;display:grid;gap:0.4rem;';
    timeSlotsEl.parentNode.insertBefore(labelEl, timeSlotsEl);
  }

  modalContainer.querySelectorAll('.time-slot[disabled]').forEach(btn => {
    btn.style.opacity = '0.35';
    btn.style.cursor = 'not-allowed';
    btn.style.pointerEvents = 'none';
  });

  const dateInput = modalContainer.querySelector('#sessionDate');
  if (dateInput && restrictDays) {
    dateInput.addEventListener('input', function validateDate() {
      if (!this.value) return;
      const day = new Date(this.value + 'T12:00:00').getDay();
      const isWeekend = (day === 0 || day === 6);
      const isValidDay = (allowWeekdays && !isWeekend) || (allowWeekends && isWeekend);
      if (!isValidDay) {
        this.setCustomValidity('This date doesn\'t match the user\'s availability.');
        this.style.borderColor = '#ef4444';
        const hint = document.querySelector('.date-avail-hint') || (() => {
          const h = document.createElement('p');
          h.className = 'date-avail-hint';
          h.style.cssText = 'color:#ef4444;font-size:0.82rem;margin-top:4px;';
          this.parentNode.appendChild(h);
          return h;
        })();
        hint.textContent = `The user is only available on ${allowWeekdays ? 'Weekdays' : 'Weekends'}. Please select a valid date.`;
        if (sendBtn) sendBtn.disabled = true;
      } else {
        this.setCustomValidity('');
        this.style.borderColor = '';
        const hint = document.querySelector('.date-avail-hint');
        if (hint) hint.textContent = '';
        if (sendBtn && selectedSlot) sendBtn.disabled = false;
      }
    });
  }

  modalContainer.querySelectorAll('.time-slot:not([disabled])').forEach(btn => btn.addEventListener('click', (e) => {
    modalContainer.querySelectorAll('.time-slot').forEach(b => {
      b.classList.remove('active');
    });
    const cur = e.currentTarget;
    cur.classList.add('active');
    selectedSlot = cur.dataset.slot;
    if (sendBtn) sendBtn.disabled = false;
  }));
  if (sendBtn) sendBtn.disabled = true;
  modalContainer.querySelector('#cancelSessionBtn')?.addEventListener('click', closeModal);
  modalContainer.querySelector('#sendSessionBtn')?.addEventListener('click', async () => {
    const subject = modalContainer.querySelector('#sessionSubject').value;
    const date = modalContainer.querySelector('#sessionDate').value;
    const time = selectedSlot;
    if (!subject || !date || !time) { showToast('Please complete all fields.'); return; }
    try {
      const studentId = mode === 'request' ? curr.id : targetUserId;
      const tutorId = mode === 'request' ? targetUserId : curr.id;
      const existing = await findPendingOrAcceptedSession(studentId, tutorId, subject);
      const sourceButton = document.querySelector(`[data-id="${targetUserId}"]`)?.querySelector('.request-session, .offer-help');
      if (existing) {
        if (sourceButton) {
          sourceButton.textContent = mode === 'request' ? 'Request Sent' : 'Offer Sent';
          sourceButton.disabled = true;
          sourceButton.style.opacity = '0.7';
          sourceButton.style.cursor = 'not-allowed';
        }
        showToast('You already have a request for this subject.');
        closeModal();
        return;
      }
      const doubleBooked = await checkDoubleBooking(tutorId, date, time);
      if (doubleBooked) {
        if (sendBtn) { sendBtn.disabled = false; if (sendBtnSpinner) sendBtnSpinner.classList.add('hidden'); if (sendBtnText) sendBtnText.textContent = 'Send Request'; }
        showToast('This tutor is already booked for the selected date and time.');
        return;
      }
      if (sendBtn) { sendBtn.disabled = true; if (sendBtnSpinner) sendBtnSpinner.classList.remove('hidden'); if (sendBtnText) sendBtnText.textContent = 'Sending...'; }
      const docRef = (mode === 'request') ? await createSessionRequest(curr.id, targetUserId, subject, date, time) : await createSessionRequest(targetUserId, curr.id, subject, date, time);
      const notifPayload = {
        recipientID: (mode === 'request') ? tutorId : studentId,
        senderID: curr.id,
        senderName: curr.name || 'Someone',
        subject,
        date,
        time,
        requestID: docRef.id,
        status: 'pending',
        type: (mode === 'request') ? 'request' : 'offer',
        message: (mode === 'request') ? `${curr.name || 'Someone'} has requested help in ${subject}.` : `${curr.name || 'Someone'} has offered to help you with ${subject}.`
      };
      await createNotification(notifPayload);
      if (sourceButton) {
        sourceButton.textContent = mode === 'request' ? 'Request Sent' : 'Offer Sent';
        sourceButton.disabled = true;
        sourceButton.style.opacity = '0.7';
        sourceButton.style.cursor = 'not-allowed';
      }
      closeModal();
      showToast(mode === 'request' ? '✅ Request sent successfully' : '✅ Offer sent successfully');
      setTimeout(() => { location.href = 'sessions.html'; }, 700);
    } catch (err) { console.error(err); showToast('Failed to send request.'); if (sendBtn) { sendBtn.disabled = false; if (sendBtnSpinner) sendBtnSpinner.classList.add('hidden'); if (sendBtnText) sendBtnText.textContent = 'Send Request'; } }
  });
}

async function hashPassword(rawPassword) {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawPassword);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function setupNotificationBell() {
  // Find bells by original IDs or by new mobile/nav IDs
  const bell = document.getElementById('notifBell') || document.getElementById('navNotifBell');
  const dot = document.getElementById('notifDot') || document.getElementById('navNotifDot');
  // Also find mobile bell for sync
  const mobileBell = document.getElementById('mobileNotifBell');
  const mobileDot = document.getElementById('mobileNotifDot');
  if (!bell && !mobileBell) return;
  const curr = getCurrentUser();
  if (!curr) return;
  let panel = document.querySelector('.notif-panel');
  if (!panel) {
    panel = document.createElement('div'); panel.className = 'notif-panel'; panel.innerHTML = '<h3>Notifications</h3><div id="notifList"></div>';
    document.body.appendChild(panel);
  }

  let unsub = null;
  const DISMISSED_KEY = `peerbridge_dismissed_${curr.id}`;
  function getDismissedIds() {
    try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')); }
    catch (e) { return new Set(); }
  }
  function addDismissedId(id) {
    const set = getDismissedIds();
    set.add(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  }
  const LAST_VIEWED_KEY = `peerbridge_last_viewed_${curr.id}`;
  function getLastViewedTime() {
    return Number(localStorage.getItem(LAST_VIEWED_KEY) || 0);
  }
  function setLastViewedTime() {
    localStorage.setItem(LAST_VIEWED_KEY, Date.now().toString());
  }

  const viewed = new Set();
  let latestNotifications = [];

  function markCurrentNotificationsViewed() {
    latestNotifications.forEach((n) => {
      if (n?.id && n.unread) viewed.add(n.id);
    });
    setLastViewedTime();
    if (dot) dot.classList.add('hidden');
    document.querySelectorAll('.notif-card.notif-unread').forEach((card) => {
      card.classList.remove('notif-unread');
      card.style.borderLeft = '';
    });
  }

  function renderList(list) {
    const notifList = document.getElementById('notifList');
    if (!notifList) return;
    notifList.innerHTML = '';
    const dismissedIds = getDismissedIds();
    list = (list || []).filter(n => n && !dismissedIds.has(n.id));
    latestNotifications = list;
    if (!list.length) {
      notifList.innerHTML = '<p class="hint">No notifications</p>';
      dot?.classList.add('hidden');
      return;
    }
    list.sort((a, b) => {
      const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tb - ta;
    });
    const lastViewed = getLastViewedTime();
    const unread = list.filter(n => {
      const nTime = n.createdAt && n.createdAt.toDate ? n.createdAt.toDate().getTime() : (n.createdAt ? new Date(n.createdAt).getTime() : 0);
      return n.unread && nTime > lastViewed;
    }).length;
    if (dot) dot.classList.toggle('hidden', unread === 0);
    list.forEach(n => {
      const card = document.createElement('div'); card.className = 'notif-card'; card.dataset.id = n.id; card.style.position = 'relative';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'notif-close';
      closeBtn.innerHTML = '×';
      closeBtn.title = 'Dismiss';
      closeBtn.style.position = 'absolute'; closeBtn.style.top = '8px'; closeBtn.style.right = '8px'; closeBtn.style.border = 'none'; closeBtn.style.background = 'transparent'; closeBtn.style.color = 'rgba(255,255,255,0.8)'; closeBtn.style.fontSize = '18px'; closeBtn.style.cursor = 'pointer'; closeBtn.style.padding = '2px 6px';
      closeBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        addDismissedId(n.id);
        dismissedIds.add(n.id);
        const currentCard = document.querySelector(`.notif-card[data-id="${n.id}"]`);
        if (currentCard) currentCard.remove();
        const remaining = notifList.querySelectorAll('.notif-card').length;
        if (!remaining) notifList.innerHTML = '<p class="hint">No notifications</p>';
        if (dot && remaining === 0) dot.classList.add('hidden');
      });

      const title = document.createElement('p');
      if (n.message) {
        title.innerHTML = `<strong>${n.message}</strong>`;
      } else {
        title.innerHTML = `<strong>${n.senderName || 'Someone'}</strong> requested help in <strong>${n.subject}</strong>`;
      }
      const meta = document.createElement('p'); meta.className = 'meta'; meta.textContent = `${n.date || ''} • ${n.time || ''}`;
      card.appendChild(closeBtn);
      card.appendChild(title); card.appendChild(meta);
      const actions = document.createElement('div'); actions.className = 'notif-actions';
      const view = document.createElement('button'); view.className = 'btn'; view.innerHTML = '<span class="btn-text">View Profile</span><span class="btn-spinner hidden" aria-hidden="true"></span>';
      view.addEventListener('click', async () => {
        console.log('Notif: View clicked', n.id, n.senderID);
        panel.classList.remove('open');
        try {
          const contextType = await getProfileContextType(n.senderID);
          if (typeof openProfileModal === 'function') openProfileModal(n.senderID, contextType);
          else if (window.openProfileModal) window.openProfileModal(n.senderID, contextType);
        } catch (err) {
          console.warn('Failed to open profile from notification', err);
        }
      });
      actions.appendChild(view);
      const st = (n.status || '').toLowerCase();
      if (st === 'pending') {
        const accept = document.createElement('button'); accept.className = 'btn'; accept.innerHTML = '<span class="btn-text">Accept</span><span class="btn-spinner hidden" aria-hidden="true"></span>';
        const decline = document.createElement('button'); decline.className = 'btn secondary'; decline.innerHTML = '<span class="btn-text">Decline</span><span class="btn-spinner hidden" aria-hidden="true"></span>';
        accept.addEventListener('click', async () => {
          console.log('Notif: Accept clicked', n.id, n.requestID);
          setButtonLoading(accept, 'Accepting...', true);
          try {
            await acceptSessionRequest(n.requestID);
            console.log('Accepted session in firestore', n.requestID);
            await updateNotification(n.id, { status: 'accepted', unread: false });
            console.log('Updated notification status', n.id);
            await createNotification({ recipientID: n.senderID, senderID: curr.id, senderName: curr.name || 'Someone', subject: n.subject, date: n.date, time: n.time, requestID: n.requestID, status: 'accepted', message: 'Your request has been accepted. Check the Sessions page for further details.' });
            console.log('Created notification for student', n.senderID);
            setButtonLoading(accept, '', false);
            location.href = 'sessions.html';
          } catch (err) { console.error('Failed accept', err); setButtonLoading(accept, '', false); showToast('Failed to accept request'); }
        });
        decline.addEventListener('click', async () => {
          console.log('Notif: Decline clicked', n.id, n.requestID);
          setButtonLoading(decline, 'Declining...', true);
          try {
            await rejectSessionRequest(n.requestID);
            console.log('Rejected session in firestore', n.requestID);
            await updateNotification(n.id, { status: 'declined', unread: false });
            console.log('Updated notification status to declined', n.id);
            await createNotification({ recipientID: n.senderID, senderID: curr.id, senderName: curr.name || 'Someone', subject: n.subject, date: n.date, time: n.time, requestID: n.requestID, status: 'declined', message: 'Your request has been declined.' });
            setButtonLoading(decline, '', false);
            const card = document.querySelector(`.notif-card[data-id="${n.id}"]`);
            if (card) { const actionsDiv = card.querySelector('.notif-actions'); if (actionsDiv) { actionsDiv.innerHTML = ''; const badge = document.createElement('span'); badge.className = 'badge-status badge-declined'; badge.textContent = 'Declined'; actionsDiv.appendChild(badge); } }
          } catch (err) { console.error('Failed decline', err); setButtonLoading(decline, '', false); showToast('Failed to decline request'); }
        });
        actions.appendChild(accept); actions.appendChild(decline);
      } else if (st === 'accepted') {
        const badge = document.createElement('span'); badge.className = 'badge-status badge-accepted'; badge.textContent = 'Accepted';
        badge.style.background = 'linear-gradient(135deg, #d5b893, #6f4d38)'; badge.style.color = '#fff'; badge.style.padding = '6px 10px'; badge.style.borderRadius = '14px'; badge.style.fontWeight = '600'; badge.style.fontFamily = 'inherit'; actions.appendChild(badge);
      } else if (st === 'declined') {
        const badge = document.createElement('span'); badge.className = 'badge-status badge-declined'; badge.textContent = 'Declined';
        badge.style.backgroundColor = '#6c757d'; badge.style.color = '#fff'; badge.style.padding = '6px 10px'; badge.style.borderRadius = '14px'; badge.style.fontWeight = '600'; badge.style.fontFamily = 'inherit'; actions.appendChild(badge);
      }
      card.appendChild(actions);
      if (n.unread && !viewed.has(n.id)) {
        card.classList.add('notif-unread');
        card.style.borderLeft = '4px solid #d5b893';
      } else {
        card.classList.remove('notif-unread');
        card.style.borderLeft = '';
      }

      const timeEl = document.createElement('div'); timeEl.className = 'notif-time';
      timeEl.style.fontSize = '12px'; timeEl.style.color = 'rgba(255,255,255,0.6)'; timeEl.style.marginTop = '8px';
      const created = n.createdAt && n.createdAt.toDate ? n.createdAt.toDate() : (n.createdAt ? new Date(n.createdAt) : null);
      timeEl.textContent = formatNotificationTime(created);
      card.appendChild(timeEl);

      notifList.appendChild(card);
    });
  }

  function formatNotificationTime(d) {
    if (!d) return '';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfGiven = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    const time = new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (startOfToday === startOfGiven) return `Today, ${time}`;
    if (startOfToday - startOfGiven === oneDay) return `Yesterday, ${time}`;
    return `${new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}, ${time}`;
  }

  if (unsub) unsub();
  unsub = subscribeNotificationsForUser(curr.id, (list) => renderList(list));

  bell.addEventListener('click', (e) => {
    e.preventDefault();
    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
      bell.setAttribute('aria-expanded', 'false');
    } else {
      panel.classList.add('open');
      bell.setAttribute('aria-expanded', 'true');
      markCurrentNotificationsViewed();
    }
  });
  // Also wire up mobile bell outside nav drawer
  if (mobileBell) {
    mobileBell.addEventListener('click', (e) => {
      e.preventDefault();
      if (panel.classList.contains('open')) {
        panel.classList.remove('open');
      } else {
        panel.classList.add('open');
        markCurrentNotificationsViewed();
      }
    });
  }
}

function personCard(person, actions = '') {
  const strong = (person.strongSubjects || []).join(', ') || '-';
  const weak = (person.weakSubjects || []).join(', ') || '-';
  const total = person.totalRatings != null ? person.totalRatings : 0;
  const region = person.region || '-';
  const availability = (person.availabilityDays || []).join(', ') + ' | ' + (person.availabilityTime || []).join(', ');
  const stars = '★'.repeat(ratingToStars(person.rating != null ? person.rating : 3));

  return '<article class="person-card">' +
    '<h3>' + (person.name || 'Unknown') + '</h3>' +
    '<p class="meta"><strong>Strong subjects:</strong> ' + strong + '</p>' +
    '<p class="meta"><strong>Weak subjects:</strong> ' + weak + '</p>' +
    '<p class="meta"><strong>Rating:</strong> <span class="stars">' + stars + '</span> <span>(' + total + ')</span></p>' +
    '<p class="meta"><strong>Region:</strong> ' + region + '</p>' +
    '<p class="meta"><strong>Availability:</strong> ' + availability + '</p>' +
    '<div class="action-row">' + actions + '</div>' +
    '</article>';
}

function sessionCard(session, usersCache, actions = '') {
  const studentName = (usersCache.get(session.studentID) || {}).name || 'Student';
  const tutorName = (usersCache.get(session.tutorID) || {}).name || 'Tutor';
  const statusClass = ((session.status || 'pending')).toLowerCase();
  const statusText = session.status || 'pending';

  return '<article class="session-card">' +
    '<h3>' + (session.subject || 'Session') + '</h3>' +
    '<p class="meta"><strong>Date:</strong> ' + (session.date || 'TBD') + '</p>' +
    '<p class="meta"><strong>Time:</strong> ' + (session.time || 'TBD') + '</p>' +
    '<p class="meta"><strong>Student:</strong> ' + studentName + '</p>' +
    '<p class="meta"><strong>Tutor:</strong> ' + tutorName + '</p>' +
    '<span class="status ' + statusClass + '">' + statusText + '</span>' +
    '<div class="action-row">' + actions + '</div>' +
    '</article>';
}

async function loadTutorsForStudent(student) {
  const allUsers = await getAllUsers();
  const matches = allUsers
    .filter((candidate) => candidate.id !== student.id)
    .filter((candidate) => intersects(candidate.strongSubjects, student.weakSubjects))
    .filter((candidate) => intersects(candidate.availabilityDays, student.availabilityDays))
    .filter((candidate) => intersects(candidate.availabilityTime, student.availabilityTime));

  return sortByRegionPriority(matches, student.region);
}

async function loadStudentsForTutor(tutor) {
  const allUsers = await getAllUsers();
  const matches = allUsers
    .filter((candidate) => candidate.id !== tutor.id)
    .filter((candidate) => intersects(tutor.strongSubjects, candidate.weakSubjects))
    .filter((candidate) => intersects(candidate.availabilityDays, tutor.availabilityDays))
    .filter((candidate) => intersects(candidate.availabilityTime, tutor.availabilityTime));

  return sortByRegionPriority(matches, tutor.region);
}

async function initHomePage() {
  const loginToggle = document.getElementById('openLogin');
  const loginPanel = document.getElementById('loginPanel');
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('emailInput');
  const emailError = document.getElementById('emailError');
  const passwordInput = document.getElementById('passwordInput');
  const capsWarning = document.getElementById('capsWarning');
  const togglePasswordBtn = document.getElementById('togglePassword');
  const signInButton = document.getElementById('signInButton');
  const loginError = document.getElementById('loginError');

  if (!loginPanel || !loginForm || !emailInput || !passwordInput) return;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (loginToggle) {
    loginToggle.addEventListener('click', () => {
      loginPanel.classList.toggle('hidden');
      loginPanel.setAttribute('aria-hidden', String(loginPanel.classList.contains('hidden')));
      if (!loginPanel.classList.contains('hidden')) {
        setTimeout(() => emailInput.focus(), 180);
      }
    });
  }

  emailInput.addEventListener('input', () => {
    const val = (emailInput.value || '').trim();
    if (!val) {
      emailError.textContent = '';
      return;
    }
    if (!emailRegex.test(val)) {
      emailError.textContent = 'Please enter a valid email address.';
    } else {
      emailError.textContent = '';
    }
  });

  if (togglePasswordBtn) {
    const eye = togglePasswordBtn.querySelector('.icon-eye');
    const eyeSlash = togglePasswordBtn.querySelector('.icon-eye-slash');
    togglePasswordBtn.addEventListener('click', () => {
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      togglePasswordBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      if (eye) eye.classList.toggle('hidden');
      if (eyeSlash) eyeSlash.classList.toggle('hidden');
    });
  }

  const capsCheck = (e) => {
    if (e.getModifierState && e.getModifierState('CapsLock')) {
      capsWarning.textContent = 'Caps Lock is on.';
    } else {
      capsWarning.textContent = '';
    }
  };
  passwordInput.addEventListener('keydown', (e) => {
    capsCheck(e);
    if (e.key === 'Enter') {
      e.preventDefault();
      loginForm.requestSubmit ? loginForm.requestSubmit() : loginForm.submit();
    }
  });
  passwordInput.addEventListener('keyup', capsCheck);

  let processing = false;

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    emailError.textContent = '';
    loginError.textContent = '';

    const email = (emailInput.value || '').trim();
    if (!emailRegex.test(email)) {
      emailError.textContent = 'Please enter a valid email address.';
      emailInput.focus();
      return;
    }

    const password = (passwordInput.value || '').trim();
    if (!password) {
      loginError.textContent = 'Email or password is incorrect. Please try again.';
      passwordInput.focus();
      return;
    }

    if (processing) return;
    processing = true;

    const btnText = signInButton?.querySelector('.btn-text');
    const btnSpinner = signInButton?.querySelector('.btn-spinner');
    if (signInButton) signInButton.disabled = true;
    if (btnSpinner) btnSpinner.classList.remove('hidden');
    if (btnText) btnText.textContent = 'Signing In...';

    try {
      const user = await getUserByEmail(email.toLowerCase());
      if (!user) {
        loginError.textContent = 'Email or password is incorrect. Please try again.';
        throw new Error('user-not-found');
      }

      const passwordHash = await hashPassword(password);
      if (!user.password || user.password !== passwordHash) {
        loginError.textContent = 'Email or password is incorrect. Please try again.';
        throw new Error('invalid-credentials');
      }

      setCurrentUser(user);
      location.href = 'student.html';
    } catch (err) {
      console.log('login attempt error', err);
      processing = false;
      if (signInButton) signInButton.disabled = false;
      if (btnSpinner) btnSpinner.classList.add('hidden');
      if (btnText) btnText.textContent = 'Sign In';
    }
  });
}

async function initRegisterPage() {
  const form = document.getElementById('registrationForm');
  if (!form) return;

  const strongContainer = document.getElementById('strongSubjectChips');
  const weakContainer = document.getElementById('weakSubjectChips');
  const availabilityDaysContainer = document.getElementById('availabilityDaysChips');
  const availabilityTimeContainer = document.getElementById('availabilityTimeChips');

  const selectedStrong = [];
  const selectedWeak = [];
  const selectedAvailabilityDays = [];
  const selectedAvailabilityTime = [];

  function renderChips(container, selectedArray, oppositeArray, items = [], addCustom = false, rerenderFn) {
    if (!container) return;
    container.innerHTML = '';
    const subjectList = items.length ? items : SUBJECTS;

    // FIX: Build combined set — default subjects + any custom subjects in selectedArray
    const allSubjects = [...new Set([...subjectList, ...selectedArray])];

    allSubjects.forEach((subject) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (selectedArray.includes(subject) ? ' active' : '');
      chip.textContent = subject;
      chip.addEventListener('click', () => {
        const idx = selectedArray.indexOf(subject);
        if (idx === -1) {
          if (oppositeArray) {
            const oppositeIdx = oppositeArray.indexOf(subject);
            if (oppositeIdx !== -1) {
              oppositeArray.splice(oppositeIdx, 1);
            }
          }
          selectedArray.push(subject);
        } else {
          selectedArray.splice(idx, 1);
        }
        rerenderFn();
      });
      container.appendChild(chip);
    });

    // Add "+ Add Subject" button for custom subjects
    if (addCustom) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'add-subject-btn';
      addBtn.textContent = '+ Add Subject';
      addBtn.addEventListener('click', () => {
        // Replace button with input
        const inputWrap = document.createElement('div');
        inputWrap.className = 'custom-subject-input';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Enter subject name...';
        const addConfirm = document.createElement('button');
        addConfirm.type = 'button';
        addConfirm.textContent = 'Add';
        addConfirm.addEventListener('click', () => {
          const val = input.value.trim();
          if (!val) return;
          if (selectedArray.includes(val)) { showToast('Subject already added'); return; }
          if (oppositeArray && oppositeArray.includes(val)) {
            oppositeArray.splice(oppositeArray.indexOf(val), 1);
          }
          selectedArray.push(val);
          rerenderFn();
        });
        // Subject suggestions dropdown
        const suggestionsEl = document.createElement('div');
        suggestionsEl.className = 'subject-suggestions';
        inputWrap.style.position = 'relative';
        inputWrap.appendChild(suggestionsEl);

        async function updateSuggestions() {
          const val = input.value.trim().toLowerCase();
          suggestionsEl.innerHTML = '';
          if (!val || val.length < 1) { suggestionsEl.classList.remove('open'); return; }
          // FIX: Search all items including global subjects
          const globalSubjects = await loadGlobalSubjects();
          const allSubjects = [...new Set([...items, ...globalSubjects, ...selectedArray])];
          const matches = allSubjects.filter(s => s.toLowerCase().includes(val) && !selectedArray.includes(s));
          if (!matches.length) { suggestionsEl.classList.remove('open'); return; }
          matches.forEach(m => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = m;
            item.addEventListener('click', () => {
              if (!selectedArray.includes(m)) {
                if (oppositeArray && oppositeArray.includes(m)) oppositeArray.splice(oppositeArray.indexOf(m), 1);
                selectedArray.push(m);
              }
              input.value = '';
              suggestionsEl.classList.remove('open');
              rerenderFn();
            });
            suggestionsEl.appendChild(item);
          });
          suggestionsEl.classList.add('open');
        }

        input.addEventListener('input', updateSuggestions);
        input.addEventListener('focus', updateSuggestions);
        input.addEventListener('blur', () => { setTimeout(() => suggestionsEl.classList.remove('open'), 150); });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim();
            if (!val) return;
            // Check for exact or partial match
            const allSubjects = items.concat(selectedArray.filter(s => !items.includes(s)));
            const match = allSubjects.find(s => s.toLowerCase() === val.toLowerCase() || s.toLowerCase().includes(val.toLowerCase()));
            if (match && !selectedArray.includes(match)) {
              if (oppositeArray && oppositeArray.includes(match)) oppositeArray.splice(oppositeArray.indexOf(match), 1);
              selectedArray.push(match);
              input.value = '';
              suggestionsEl.classList.remove('open');
              rerenderFn();
            } else {
              addConfirm.click();
            }
          }
        });
        inputWrap.appendChild(input);
        inputWrap.appendChild(addConfirm);
        container.appendChild(inputWrap);
        input.focus();
        addBtn.style.display = 'none';
      });
      container.appendChild(addBtn);
    }
  }

  function rerenderAllChips() {
    renderChips(strongContainer, selectedStrong, selectedWeak, SUBJECTS, true, rerenderAllChips);
    renderChips(weakContainer, selectedWeak, selectedStrong, SUBJECTS, true, rerenderAllChips);
    renderChips(availabilityDaysContainer, selectedAvailabilityDays, null, AVAILABILITY_DAYS, false, rerenderAllChips);
    renderChips(availabilityTimeContainer, selectedAvailabilityTime, null, AVAILABILITY_TIMES, false, rerenderAllChips);
  }

  rerenderAllChips();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);

    const password = (data.get('password') || '').toString();
    const confirmPassword = (data.get('confirmPassword') || '').toString();

    const registerMessageEl = document.getElementById('registerMessage');
    if (!password || password.length < 6) {
      if (registerMessageEl) registerMessageEl.textContent = 'Password must be at least 6 characters.';
      return;
    }

    if (password !== confirmPassword) {
      if (registerMessageEl) registerMessageEl.textContent = 'Passwords do not match.';
      return;
    }

    const payload = {
      name: (data.get('name') || '').toString().trim(),
      dob: data.get('dob'),
      gender: data.get('gender'),
      email: (data.get('email') || '').toString().trim().toLowerCase(),
      phone: (data.get('phone') || '').toString().trim(),
      address: {
        doorNumber: (data.get('doorNumber') || '').toString().trim(),
        street: (data.get('street') || '').toString().trim(),
        city: (data.get('city') || '').toString().trim(),
        state: (data.get('state') || '').toString().trim(),
        postalCode: (data.get('postalCode') || '').toString().trim()
      },
      region: (data.get('region') || '').toString().trim(),
      strongSubjects: [...selectedStrong],
      weakSubjects: [...selectedWeak],
      availabilityDays: [...selectedAvailabilityDays],
      availabilityTime: [...selectedAvailabilityTime],
      bio: (data.get('bio') || '').toString().trim(),
      password: await hashPassword(password)
    };

    const id = await registerUser(payload);
    payload.id = id;
    payload.rating = 2.5;
    payload.totalRatings = 0;
    setCurrentUser(payload);

    const messageEl = document.getElementById('registerMessage');
    if (messageEl) {
      messageEl.textContent = 'Account created successfully! Welcome to PeerBridge!';
    }

    setTimeout(() => {
      location.href = 'student.html';
    }, 1300);
  });
}

async function initDashboardPage() {
  const user = requireUserOrRedirect();
  if (!user) return;

  const titleEl = document.getElementById('dashboardTitle');
  if (titleEl) titleEl.textContent = `Hello, ${user.name || 'Peer'}! 👋`;

  const findBtn = document.getElementById('findTutorsBtn');
  const helpBtn = document.getElementById('helpStudentsBtn');
  const resultsContainer = document.getElementById('resultsContainer');

  function sortMatches(list = [], currentUser) {
    return list.sort((a, b) => {
      const aRegion = ((a.region || '') || '').toString().trim().toLowerCase() === ((currentUser.region || '') || '').toString().trim().toLowerCase();
      const bRegion = ((b.region || '') || '').toString().trim().toLowerCase() === ((currentUser.region || '') || '').toString().trim().toLowerCase();

      if (aRegion !== bRegion) return aRegion ? -1 : 1;

      const aAvail = intersects(a.availabilityDays, currentUser.availabilityDays) || intersects(a.availabilityTime, currentUser.availabilityTime);
      const bAvail = intersects(b.availabilityDays, currentUser.availabilityDays) || intersects(b.availabilityTime, currentUser.availabilityTime);
      if (aAvail !== bAvail) return aAvail ? -1 : 1;

      const aYear = (a.academicYear || '') === (currentUser.academicYear || '');
      const bYear = (b.academicYear || '') === (currentUser.academicYear || '');
      if (aYear !== bYear) return aYear ? -1 : 1;

      return (b.rating || 0) - (a.rating || 0);
    });
  }

  function renderTutorCard(t) {
    const strong = (t.strongSubjects || []).join(', ') || '-';
    const availability = (t.availabilityDays || []).join(', ') + ' | ' + (t.availabilityTime || []).join(', ');
    const stars = '★'.repeat(ratingToStars(t.rating != null ? t.rating : 3));
    return `<article class="person-card" data-type="tutor" data-id="${t.id}">
      <h3>${t.name || 'Unknown'}</h3>
      <p class="meta"><strong>Rating:</strong> <span class="stars">${stars}</span></p>
      <p class="meta"><strong>Strong subjects:</strong> ${strong}</p>
      <p class="meta"><strong>Region:</strong> ${t.region || '-'}</p>
      <p class="meta"><strong>Availability:</strong> ${availability}</p>
      <div class="action-row"><button class="btn secondary view-profile" data-id="${t.id}">View Profile</button><button class="btn request-session" data-id="${t.id}">Request Session</button></div>
    </article>`;
  }

  function renderStudentCard(s) {
    const weak = (s.weakSubjects || []).join(', ') || '-';
    const availability = (s.availabilityDays || []).join(', ') + ' | ' + (s.availabilityTime || []).join(', ');
    const stars = '★'.repeat(ratingToStars(s.rating != null ? s.rating : 3));
    return `<article class="person-card" data-type="student" data-id="${s.id}">
      <h3>${s.name || 'Unknown'}</h3>
      <p class="meta"><strong>Rating:</strong> <span class="stars">${stars}</span></p>
      <p class="meta"><strong>Weak subjects:</strong> ${weak}</p>
      <p class="meta"><strong>Region:</strong> ${s.region || '-'}</p>
      <p class="meta"><strong>Availability:</strong> ${availability}</p>
      <div class="action-row"><button class="btn secondary view-profile" data-id="${s.id}">View Profile</button><button class="btn offer-help" data-id="${s.id}">Offer Help</button></div>
    </article>`;
  }

  async function matchTutorsForUser(curr) {
    const all = await getAllUsers();
    const matches = all.filter((u) => u.id !== curr.id && intersects(u.strongSubjects, curr.weakSubjects));
    return sortMatches(matches, curr);
  }

  async function matchStudentsForUser(curr) {
    const all = await getAllUsers();
    const matches = all.filter((u) => u.id !== curr.id && intersects(u.weakSubjects, curr.strongSubjects));
    return sortMatches(matches, curr);
  }

  async function showTutors() {
    if (!resultsContainer) return;
    resultsContainer.innerHTML = '<p class="hint">Searching for tutors...</p>';
    const matches = await matchTutorsForUser(user);
    resultsContainer.innerHTML = matches.length ? matches.map(renderTutorCard).join('') : '<p>No matching tutors found right now.</p>';
  }

  async function showStudents() {
    if (!resultsContainer) return;
    resultsContainer.innerHTML = '<p class="hint">Searching for students seeking help...</p>';
    const matches = await matchStudentsForUser(user);
    resultsContainer.innerHTML = matches.length ? matches.map(renderStudentCard).join('') : '<p>No matching students found right now.</p>';
  }
  if (findBtn) findBtn.addEventListener('click', (e) => { e.preventDefault(); showTutors(); });
  if (helpBtn) helpBtn.addEventListener('click', (e) => { e.preventDefault(); showStudents(); });

  let allMatchesCache = [];
  let currentMode = null;

  function renderFilteredCards() {
    if (!resultsContainer || !allMatchesCache.length) {
      if (resultsContainer && currentMode) {
        resultsContainer.innerHTML = `<p class="hint">No ${currentMode === 'tutors' ? 'tutors' : 'students'} found matching your criteria.</p>`;
      }
      return;
    }

    const searchVal = (document.getElementById('communitySearch')?.value || '').toLowerCase().trim();
    const subjectFilter = document.getElementById('subjectFilter')?.value || 'all';
    const regionFilter = (document.getElementById('regionFilter')?.value || '').toLowerCase().trim();
    const sortBy = document.getElementById('sortBy')?.value || 'rating';

    let filtered = allMatchesCache.filter(p => {
      if (searchVal) {
        const nameMatch = (p.name || '').toLowerCase().includes(searchVal);
        const strongMatch = (p.strongSubjects || []).some(s => s.toLowerCase().includes(searchVal));
        const weakMatch = (p.weakSubjects || []).some(s => s.toLowerCase().includes(searchVal));
        const regionMatch = (p.region || '').toLowerCase().includes(searchVal);
        if (!nameMatch && !strongMatch && !weakMatch && !regionMatch) return false;
      }
      if (subjectFilter !== 'all') {
        const allSubjects = [...(p.strongSubjects || []), ...(p.weakSubjects || [])];
        if (!allSubjects.some(s => s.toLowerCase() === subjectFilter.toLowerCase())) return false;
      }
      if (regionFilter) {
        if (!(p.region || '').toLowerCase().includes(regionFilter)) return false;
      }
      return true;
    });

    if (sortBy === 'rating') filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (sortBy === 'reviews') filtered.sort((a, b) => (b.totalRatings || 0) - (a.totalRatings || 0));
    else if (sortBy === 'name-asc') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'name-desc') filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));

    const cards = filtered.map(p => {
      const cardType = currentMode === 'tutors' ? 'tutor' : 'student';
      const cardFn = cardType === 'tutor' ? renderTutorCard : renderStudentCard;
      return cardFn(p);
    }).join('');

    resultsContainer.classList.add('community-grid');
    resultsContainer.innerHTML = cards || `<p class="hint">No ${currentMode === 'tutors' ? 'tutors' : 'students'} match your filters.</p>`;
  }

  function buildFilterUI(mode) {
    const existing = document.querySelector('.community-filters');
    if (existing) existing.remove();

    const filterDiv = document.createElement('div');
    filterDiv.className = 'community-filters card';
    filterDiv.style.cssText = 'padding:1rem;margin-bottom:1rem;';

    let subjectOptions = '<option value="all">All Subjects</option>';
    if (mode === 'tutors') {
      (user.weakSubjects || []).forEach(s => {
        subjectOptions += `<option value="${s}">${s}</option>`;
      });
    } else {
      (user.strongSubjects || []).forEach(s => {
        subjectOptions += `<option value="${s}">${s}</option>`;
      });
    }

    filterDiv.innerHTML = `
      <div class="filter-grid-row">
        <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">Search</label><div style="position:relative;display:flex;align-items:center;"><input id="communitySearch" type="text" placeholder="Search by name, subject, or region..." style="width:100%;padding:0.55rem 0.75rem;padding-right:2.2rem;" /><svg id="searchIconBtn" style="position:absolute;right:10px;cursor:pointer;color:rgba(213,184,147,0.7);flex-shrink:0;" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></div></div>
        <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">Subject</label><select id="subjectFilter" style="width:100%;padding:0.55rem 0.75rem;">${subjectOptions}</select></div>
        <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">Region</label><input id="regionFilter" type="text" placeholder="Filter..." style="width:100%;padding:0.55rem 0.75rem;" /></div>
        <div><label style="font-size:0.8rem;font-weight:600;display:block;margin-bottom:4px;">Sort</label><select id="sortBy" style="width:100%;padding:0.55rem 0.75rem;"><option value="rating">Highest Rated</option><option value="reviews">Most Reviews</option><option value="name-asc">Name A-Z</option><option value="name-desc">Name Z-A</option></select></div>
      </div>
    `;
    resultsContainer?.parentNode?.insertBefore(filterDiv, resultsContainer);

    filterDiv.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', renderFilteredCards);
      el.addEventListener('change', renderFilteredCards);
    });
  }

  showTutors = async function() {
    currentMode = 'tutors';
    if (!resultsContainer) return;
    buildFilterUI('tutors');
    resultsContainer.innerHTML = '<p class="hint">Searching for tutors...</p>';
    allMatchesCache = await matchTutorsForUser(user);
    renderFilteredCards();
  };
  showStudents = async function() {
    currentMode = 'students';
    if (!resultsContainer) return;
    buildFilterUI('students');
    resultsContainer.innerHTML = '<p class="hint">Searching for students...</p>';
    allMatchesCache = await matchStudentsForUser(user);
    renderFilteredCards();
  };

  setupNotificationBell();

  try {
    if (user && user.id) {
      subscribeSessionsForUser(user.id, (list) => {
        list.forEach(s => {
          const otherId = (s.studentID === user.id) ? s.tutorID : s.studentID;
          const selector = `[data-id="${otherId}"] .request-session, [data-id="${otherId}"] .offer-help`;
          const btn = document.querySelector(selector);
          if (!btn) return;
          const st = (s.status || '').toLowerCase();
          if (st === 'pending' || st === 'accepted') {
            btn.textContent = (s.studentID === user.id) ? 'Request Sent' : 'Offer Sent';
            btn.disabled = true; btn.style.opacity = '0.7'; btn.style.cursor = 'not-allowed';
          }
        });
      });
    }
  } catch (e) { console.error(e); }

  const modalContainer = document.getElementById('modalContainer');
  const toastContainer = document.getElementById('toastContainer');

  function closeModal() {
    if (!modalContainer) return;
    modalContainer.innerHTML = '';
    modalContainer.classList.add('hidden');
    modalContainer.setAttribute('aria-hidden', 'true');
  }

  function openModal(contentHtml) {
    if (!modalContainer) return;
    modalContainer.innerHTML = '<div class="modal" role="dialog">' + contentHtml + '</div>';
    modalContainer.classList.remove('hidden');
    modalContainer.setAttribute('aria-hidden', 'false');
    modalContainer.addEventListener('click', (e) => {
      if (e.target === modalContainer) closeModal();
    }, { once: true });
  }

  function showToast(message) {
    if (!toastContainer) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.remove(); }, 3200);
  }

  function setButtonLoading(btn, loadingText, loading) {
    if (!btn) return;
    const spinner = btn.querySelector('.btn-spinner');
    const text = btn.querySelector('.btn-text') || btn;
    if (loading) {
      btn.disabled = true;
      if (spinner) spinner.classList.remove('hidden');
      if (text) text.textContent = loadingText;
    } else {
      btn.disabled = false;
      if (spinner) spinner.classList.add('hidden');
    }
  }

  if (resultsContainer) {
    resultsContainer.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const id = target.dataset.id;
      const card = target.closest('article.person-card');
      const cardType = card?.dataset?.type || null;
      if (target.classList.contains('view-profile')) {
        openProfileModal(id, cardType);
        return;
      }
      if (target.classList.contains('request-session')) {
        openSessionModal(id, 'request');
        return;
      }
      if (target.classList.contains('offer-help')) {
        openSessionModal(id, 'offer');
        return;
      }
    });
  }
}

async function openEditProfileModal(targetUser) {
  const profileContent = document.getElementById('profileContent');
  if (!profileContent) return;
  const currStrong = [...(targetUser.strongSubjects || [])];
  const currWeak = [...(targetUser.weakSubjects || [])];
  const currAvailDays = [...(targetUser.availabilityDays || [])];
  const currAvailTime = [...(targetUser.availabilityTime || [])];
  const addr = targetUser.address || {};

  function renderEditChips(container, items, selectedArray, addCustom = false, rerenderFn) {
    if (!container) return;
    container.innerHTML = '';
    const allItems = [...items];
    // Add any custom subjects that aren't in the default list
    selectedArray.forEach(s => {
      if (!allItems.includes(s)) allItems.push(s);
    });

    // Build combined set — default items + any custom items in selectedArray
    const allSubjects = [...new Set([...allItems, ...selectedArray])];

    allSubjects.forEach(item => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (selectedArray.includes(item) ? ' active' : '');
      chip.textContent = item;
      chip.addEventListener('click', () => {
        const idx = selectedArray.indexOf(item);
        if (idx === -1) selectedArray.push(item);
        else selectedArray.splice(idx, 1);
        if (rerenderFn) rerenderFn();
        else renderEditChips(container, items, selectedArray, addCustom, rerenderFn);
      });
      container.appendChild(chip);
    });

    if (addCustom) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'add-subject-btn';
      addBtn.textContent = '+ Add Subject';
      addBtn.addEventListener('click', () => {
        const inputWrap = document.createElement('div');
        inputWrap.className = 'custom-subject-input';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Enter subject name...';
        const addConfirm = document.createElement('button');
        addConfirm.type = 'button';
        addConfirm.textContent = 'Add';
        addConfirm.addEventListener('click', () => {
          const val = input.value.trim();
          if (!val) return;
          if (selectedArray.includes(val)) { showToast('Subject already added'); return; }
          selectedArray.push(val);
          if (rerenderFn) rerenderFn();
        });
        // Subject suggestions dropdown
        const suggestionsEl = document.createElement('div');
        suggestionsEl.className = 'subject-suggestions';
        inputWrap.style.position = 'relative';
        inputWrap.appendChild(suggestionsEl);

        async function updateSuggestions() {
          const val = input.value.trim().toLowerCase();
          suggestionsEl.innerHTML = '';
          if (!val || val.length < 1) { suggestionsEl.classList.remove('open'); return; }
          const globalSubjects = await loadGlobalSubjects();
          const allSubjects = [...new Set([...items, ...globalSubjects, ...selectedArray])];
          const matches = allSubjects.filter(s => s.toLowerCase().includes(val) && !selectedArray.includes(s));
          if (!matches.length) { suggestionsEl.classList.remove('open'); return; }
          matches.forEach(m => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = m;
            item.addEventListener('click', () => {
              if (!selectedArray.includes(m)) {
                selectedArray.push(m);
              }
              input.value = '';
              suggestionsEl.classList.remove('open');
              if (rerenderFn) rerenderFn();
            });
            suggestionsEl.appendChild(item);
          });
          suggestionsEl.classList.add('open');
        }

        input.addEventListener('input', updateSuggestions);
        input.addEventListener('focus', updateSuggestions);
        input.addEventListener('blur', () => { setTimeout(() => suggestionsEl.classList.remove('open'), 150); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addConfirm.click(); });
        inputWrap.appendChild(input);
        inputWrap.appendChild(addConfirm);
        container.appendChild(inputWrap);
        input.focus();
        addBtn.style.display = 'none';
      });
      container.appendChild(addBtn);
    }
  }

  function rerenderEditChips() {
    renderEditChips(document.getElementById('editStrongChips'), SUBJECTS, currStrong, true, rerenderEditChips);
    renderEditChips(document.getElementById('editWeakChips'), SUBJECTS, currWeak, true, rerenderEditChips);
    renderEditChips(document.getElementById('editAvailDaysChips'), AVAILABILITY_DAYS, currAvailDays, false, rerenderEditChips);
    renderEditChips(document.getElementById('editAvailTimeChips'), AVAILABILITY_TIMES, currAvailTime, false, rerenderEditChips);
  }

  profileContent.innerHTML = `
    <div class="profile-page-shell edit-profile-page">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="margin:0;color:var(--tan);">Edit Profile</h2>
        <div>
          <button id="cancelEditPage" class="btn secondary" style="margin-right:0.5rem;">Cancel</button>
          <button id="saveEditPage" class="btn"><span class="btn-text">Save Changes</span><span class="btn-spinner hidden"></span></button>
        </div>
      </div>
      <div class="card" style="padding:1.25rem;">
        <h3 style="margin:0 0 0.75rem;color:var(--tan);font-size:0.95rem;">Personal Information</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
          <label>Full Name<input id="editName" value="${targetUser.name || ''}" /></label>
          <label>Email<input id="editEmail" value="${targetUser.email || ''}" /></label>
          <label>Phone<input id="editPhone" value="${targetUser.phone || ''}" /></label>
        </div>
      </div>
      <div class="card" style="padding:1.25rem;margin-top:0.85rem;">
        <h3 style="margin:0 0 0.75rem;color:var(--tan);font-size:0.95rem;">Address & Location</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
          <label>Region / Locality<input id="editRegion" value="${targetUser.region || ''}" /></label>
          <label>City<input id="editCity" value="${addr.city || ''}" /></label>
          <label>State<input id="editState" value="${addr.state || ''}" /></label>
          <label>Door Number<input id="editDoor" value="${addr.doorNumber || ''}" /></label>
          <label>Street / Area<input id="editStreet" value="${addr.street || ''}" /></label>
          <label>Postal Code<input id="editPostal" value="${addr.postalCode || ''}" /></label>
        </div>
      </div>
      <div class="card" style="padding:1.25rem;margin-top:0.85rem;">
        <h3 style="margin:0 0 0.75rem;color:var(--tan);font-size:0.95rem;">Academic & Availability</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.85rem;">
          <label>Strong Subjects<div id="editStrongChips" class="chip-container"></div></label>
          <label>Weak Subjects<div id="editWeakChips" class="chip-container"></div></label>
          <label>Availability Days<div id="editAvailDaysChips" class="chip-container"></div></label>
          <label>Availability Time<div id="editAvailTimeChips" class="chip-container"></div></label>
        </div>
        <label style="margin-top:0.75rem;">Bio<textarea id="editBio" rows="2">${targetUser.bio || ''}</textarea></label>
      </div>
      <div class="card" style="padding:1.25rem;margin-top:0.85rem;">
        <h3 style="margin:0 0 0.75rem;color:var(--tan);font-size:0.95rem;">Change Password</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
          <label>Current Password<input id="editCurPw" type="password" placeholder="Required to change" /></label>
          <label>New Password<input id="editNewPw" type="password" placeholder="Min 6 characters" /></label>
          <label>Confirm New Password<input id="editConfirmPw" type="password" placeholder="Re-enter new password" /></label>
        </div>
        <div id="editPwError" style="color:#ef4444;font-size:0.82rem;min-height:1.1em;margin-top:4px;"></div>
      </div>
    </div>
  `;

  rerenderEditChips();

  document.getElementById('cancelEditPage')?.addEventListener('click', () => initProfilePage());
  document.getElementById('saveEditPage')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveEditPage');
    const spinner = btn?.querySelector('.btn-spinner');
    const text = btn?.querySelector('.btn-text');
    const pwError = document.getElementById('editPwError');
    if (btn) { btn.disabled = true; if (spinner) spinner.classList.remove('hidden'); if (text) text.textContent = 'Saving...'; }

    const updates = {
      name: document.getElementById('editName')?.value || targetUser.name,
      email: (document.getElementById('editEmail')?.value || '').trim().toLowerCase(),
      phone: document.getElementById('editPhone')?.value || '',
      region: document.getElementById('editRegion')?.value || '',
      bio: document.getElementById('editBio')?.value || '',
      strongSubjects: [...currStrong],
      weakSubjects: [...currWeak],
      availabilityDays: [...currAvailDays],
      availabilityTime: [...currAvailTime],
      address: {
        doorNumber: document.getElementById('editDoor')?.value || '',
        street: document.getElementById('editStreet')?.value || '',
        city: document.getElementById('editCity')?.value || '',
        state: document.getElementById('editState')?.value || '',
        postalCode: document.getElementById('editPostal')?.value || ''
      }
    };

    const curPw = document.getElementById('editCurPw')?.value || '';
    const newPw = document.getElementById('editNewPw')?.value || '';
    const confirmPw = document.getElementById('editConfirmPw')?.value || '';

    if (curPw || newPw || confirmPw) {
      const storedHash = targetUser.password || '';
      const curHash = await hashPassword(curPw);
      if (curHash !== storedHash) {
        if (pwError) pwError.textContent = 'Current password is incorrect.';
        if (btn) { btn.disabled = false; if (spinner) spinner.classList.add('hidden'); if (text) text.textContent = 'Save Changes'; }
        return;
      }
      if (newPw.length < 6) {
        if (pwError) pwError.textContent = 'New password must be at least 6 characters.';
        if (btn) { btn.disabled = false; if (spinner) spinner.classList.add('hidden'); if (text) text.textContent = 'Save Changes'; }
        return;
      }
      if (newPw !== confirmPw) {
        if (pwError) pwError.textContent = 'New passwords do not match.';
        if (btn) { btn.disabled = false; if (spinner) spinner.classList.add('hidden'); if (text) text.textContent = 'Save Changes'; }
        return;
      }
      updates.password = await hashPassword(newPw);
    }

    try {
      await updateUser(targetUser.id, updates);
      const fresh = await getUserById(targetUser.id);
      if (fresh) {
        setCurrentUser(fresh);
        showToast('Profile updated successfully');
        initProfilePage();
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to update profile');
      if (btn) { btn.disabled = false; if (spinner) spinner.classList.add('hidden'); if (text) text.textContent = 'Save Changes'; }
    }
  });
}

async function initProfilePage() {
  const user = requireUserOrRedirect();
  if (!user) return;

  const viewId = localStorage.getItem('peerbridgeViewProfile');
  localStorage.removeItem('peerbridgeViewProfile');

  let userToShow = user;
  let isOwnProfile = true;
  if (viewId && viewId !== user.id) {
    const allUsers = await getAllUsers();
    const targetUser = allUsers.find((item) => item.id === viewId);
    if (targetUser) userToShow = targetUser;
    isOwnProfile = false;
  } else {
    const fresh = await getUserById(user.id);
    if (fresh) {
      userToShow = fresh;
      setCurrentUser(fresh);
    }
  }

  const profileContent = document.getElementById('profileContent');
  if (!profileContent) return;

  async function renderProfile(targetUser) {
    const strongTags = (targetUser.strongSubjects || []).map(s => `<span class="tag">${s}</span>`).join('');
    const weakTags = (targetUser.weakSubjects || []).map(s => `<span class="tag">${s}</span>`).join('');
    const availability = (targetUser.availabilityDays || []).map(d => `<span class="badge">${d}</span>`).join('') + ' ' + (targetUser.availabilityTime || []).map(t => `<span class="badge">${t}</span>`).join(' ');
    const address = targetUser.address || {};
    const addressText = `${address.doorNumber ? address.doorNumber + ', ' : ''}${address.street ? address.street + '<br/>' : ''}${address.city ? address.city + '<br/>' : ''}${address.state ? address.state + ' - ' : ''}${address.postalCode || ''}`;
    const starCount = ratingToStars(targetUser.rating != null ? targetUser.rating : 3);
    const starsHtml = '<span class="stars">' + '★'.repeat(starCount) + '</span>';
    const reviewsSummary = `<div class="meta">${starsHtml}<span class="review-count"> ${targetUser.totalRatings || 0} Reviews</span></div>`;
    const editBtn = isOwnProfile ? `<button id="editProfileBtn" class="btn" style="position:absolute;top:0;right:0;padding:6px 10px;font-size:0.8rem;">✎ Edit</button>` : '';

    let statsHtml = '';
    try {
      const allSessions = await getAllSessions();
      const userSessions = allSessions.filter(s => s.studentID === targetUser.id || s.tutorID === targetUser.id);
      const completedSessions = userSessions.filter(s => (s.status || '').toLowerCase() === 'completed');
      const offersSent = allSessions.filter(s => s.tutorID === targetUser.id && (s.status || '').toLowerCase() !== 'pending').length;
      const requestsReceived = allSessions.filter(s => s.studentID === targetUser.id).length;
      const sessionsCount = completedSessions.length;
      const avgRating = targetUser.rating != null ? ratingToStars(targetUser.rating) : 0;

      statsHtml = `
        <div class="profile-stats">
          <div class="profile-stat-card">
            <div class="profile-stat-number">${avgRating > 0 ? '★'.repeat(avgRating) : '—'}</div>
            <div class="profile-stat-label">Average Rating</div>
          </div>
          <div class="profile-stat-card">
            <div class="profile-stat-number">${offersSent}</div>
            <div class="profile-stat-label">Offers Sent</div>
          </div>
          <div class="profile-stat-card">
            <div class="profile-stat-number">${requestsReceived}</div>
            <div class="profile-stat-label">Requests Received</div>
          </div>
          <div class="profile-stat-card">
            <div class="profile-stat-number">${sessionsCount}</div>
            <div class="profile-stat-label">Sessions Completed</div>
          </div>
        </div>
      `;
    } catch (e) { console.warn('Profile stats load error', e); }

    const left = `<div style="position:relative;width:100%;">${editBtn}<div class="profile-left"><div class="profile-identity card"><div class="avatar-placeholder">${(targetUser.name||'?').slice(0,1)}</div><div><h3>${targetUser.name || 'Unknown'}</h3>${reviewsSummary}</div></div><div class="card"><div class="profile-label">Email</div><div class="profile-value">${targetUser.email || '-'}</div></div><div class="card"><div class="profile-label">Phone</div><div class="profile-value">${targetUser.phone || '-'}</div></div><div class="card"><div class="profile-label">Region / Locality</div><div class="profile-value">${targetUser.region || '-'}</div></div><div class="card"><div class="profile-label">About Me</div><div class="profile-value">${targetUser.bio || 'No bio added.'}</div></div></div></div>`;
    const middle = `<div class="profile-middle"><div class="card"><div class="profile-label">Address</div><div class="profile-value">${addressText || '-'}</div></div><div class="card"><div class="profile-label">Availability</div><div class="profile-value">${availability || '-'}</div></div><div class="card"><div class="profile-label">Strong Subjects</div><div class="profile-value">${strongTags || '-'}</div></div><div class="card"><div class="profile-label">Weak Subjects</div><div class="profile-value">${weakTags || '-'}</div></div></div>`;
    const right = `<div class="profile-right"><div id="profileReviews" class="card reviews-column"><div class="profile-label">Reviews</div><div class="profile-value">No reviews yet.</div></div></div>`;
    profileContent.innerHTML = `<div class="profile-page-shell">${statsHtml}<div class="profile-modal-grid">${left}${middle}${right}</div></div>`;

    if (isOwnProfile) {
      document.getElementById('editProfileBtn')?.addEventListener('click', () => openEditProfileModal(targetUser));
    }
  }

  await renderProfile(userToShow);
  (async () => {
    try {
      const reviews = await getReviewsForUser(userToShow.id);
      const container = document.getElementById('profileReviews');
      if (!container || !reviews.length) return;
      container.innerHTML = `<div class="profile-label">Reviews</div><div class="reviews-summary">${starsHtml}<div>${reviews.length} Reviews</div></div>`;
      const list = document.createElement('div');
      list.className = 'review-list';
      reviews.slice().reverse().forEach(r => {
        const stars = '★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating))));
        const feedbackText = r.feedback ? `"${r.feedback}"` : 'No written feedback.';
        const card = document.createElement('div'); card.className = 'card review-card';
        card.innerHTML = `<div class="stars">${stars}</div><div class="review-meta"><strong>${r.reviewerName || 'Reviewer'}</strong><span>${new Date(r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt || Date.now())).toLocaleDateString()}</span></div><div class="review-feedback">${feedbackText}</div>`;
        list.appendChild(card);
      });
      container.appendChild(list);
    } catch (err) { console.error('Failed to load reviews', err); }
  })();

  setupNotificationBell();
}

async function initSessionsPage() {
  const curr = requireUserOrRedirect();
  if (!curr) return;
  const allSessionsEl = document.getElementById('allSessions');
  if (!allSessionsEl) return;

  async function renderSessions(list) {
    const users = await getAllUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));
    const sessions = list || [];
    allSessionsEl.innerHTML = '';
    if (!sessions.length) { allSessionsEl.innerHTML = '<p>No sessions created yet.</p>'; return; }

    const active = sessions.filter(s => (s.status || '').toLowerCase() !== 'completed');
    const completed = sessions.filter(s => (s.status || '').toLowerCase() === 'completed');

    function getSessionDateMs(s) {
      if (!s.date) return 0;
      const parsed = new Date(s.date + 'T12:00:00');
      return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    }
    function sortActiveSessions(a, b) {
      const order = { 'accepted': 0, 'pending': 1, 'rejected': 2, 'declined': 2 };
      const aOrd = order[(a.status || '').toLowerCase()] ?? 3;
      const bOrd = order[(b.status || '').toLowerCase()] ?? 3;
      if (aOrd !== bOrd) return aOrd - bOrd;
      const aStatus = (a.status || '').toLowerCase();
      const bStatus = (b.status || '').toLowerCase();
      if (aStatus === 'accepted' && bStatus === 'accepted') {
        const aDateMs = getSessionDateMs(a);
        const bDateMs = getSessionDateMs(b);
        if (aDateMs && bDateMs) return aDateMs - bDateMs;
        if (aDateMs) return -1;
        if (bDateMs) return 1;
      }
      const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tb - ta;
    }
    active.sort(sortActiveSessions);

    function sortCompletedSessions(a, b) {
      const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tb - ta;
    }
    completed.sort(sortCompletedSessions);

    const sessionsLayout = document.createElement('div');
    sessionsLayout.className = 'sessions-layout';
    const activeColumn = document.createElement('section');
    activeColumn.className = 'sessions-column';
    const completedColumn = document.createElement('section');
    completedColumn.className = 'sessions-column';
    sessionsLayout.appendChild(activeColumn);
    sessionsLayout.appendChild(completedColumn);
    allSessionsEl.appendChild(sessionsLayout);

    const activeSection = document.createElement('div');
    activeSection.className = 'sessions-section';
    const activeHeader = document.createElement('h2'); activeHeader.textContent = 'Active Sessions'; activeSection.appendChild(activeHeader);
    if (!active.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'No active sessions yet.'; activeSection.appendChild(p); }
    active.forEach(s => {
      const el = document.createElement('div'); el.innerHTML = sessionCard(s, userMap);
      const card = el.firstElementChild;
      const otherId = curr.id === s.tutorID ? s.studentID : s.tutorID;
      const otherName = (userMap.get(otherId) || {}).name || 'Participant';

      const stLower = (s.status || '').toLowerCase();
      const statusEl = card.querySelector('.status');
      if (stLower === 'pending') {
        statusEl.textContent = (s.studentID === curr.id) ? 'Request Sent' : ((s.tutorID === curr.id) ? 'Offer Sent' : 'Pending');
        statusEl.className = 'status pending';
      } else if (stLower === 'accepted') { statusEl.textContent = 'Accepted'; statusEl.className = 'status accepted'; }
      else if (stLower === 'rejected' || stLower === 'declined') { statusEl.textContent = 'Declined'; statusEl.className = 'status declined'; }

      if (stLower === 'accepted') {
        const mark = document.createElement('button'); mark.className = 'btn'; mark.innerHTML = '<span class="btn-text">Mark Completed</span><span class="btn-spinner hidden" aria-hidden="true"></span>';
        mark.addEventListener('click', async () => {
          setButtonLoading(mark, 'Completing...', true);
          try { await completeSession(s.id); setButtonLoading(mark, '', false); showToast('Session marked as completed'); }
          catch (err) { console.error(err); setButtonLoading(mark, '', false); showToast('Failed to update session'); }
        });
        card.querySelector('.action-row')?.appendChild(mark);
      }

      activeSection.appendChild(card);
    });
    activeColumn.appendChild(activeSection);

    const completedSection = document.createElement('div');
    completedSection.className = 'sessions-section';
    const compHeader = document.createElement('h2'); compHeader.textContent = 'Completed Sessions'; completedSection.appendChild(compHeader);
    if (!completed.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'No completed sessions yet.'; completedSection.appendChild(p); }
    else {
      completed.forEach(s => {
        const el = document.createElement('div'); el.innerHTML = sessionCard(s, userMap); const card = el.firstElementChild;
        const statusEl = card.querySelector('.status'); statusEl.textContent = 'Completed'; statusEl.className = 'status completed';
        const otherId = curr.id === s.tutorID ? s.studentID : s.tutorID; const otherName = (userMap.get(otherId) || {}).name || 'Participant';
        const reviewedKey = `reviewed_${s.id}_${curr.id}`;
        const savedKey = `review_${s.id}_${curr.id}`;
        if (localStorage.getItem(reviewedKey)) {
          const saved = JSON.parse(localStorage.getItem(savedKey) || '{}');
          const savedHtml = document.createElement('div'); savedHtml.className = 'card rating-card';
          const starsCount = Math.max(1, Math.min(5, Math.round(saved.rating || 0)));
          const starsHtml = '★'.repeat(starsCount);
          const feedbackText = saved.feedback ? `"${saved.feedback}"` : '';
          const reviewerName = saved.reviewerName || 'You';
          const reviewDate = saved.date ? new Date(saved.date).toLocaleDateString() : '';
          savedHtml.innerHTML = `<div class="review-display"><div class="stars">${starsHtml}</div><div class="review-meta"><strong>${reviewerName}</strong><span>${reviewDate}</span></div>${feedbackText ? `<div class="review-feedback">${feedbackText}</div>` : ''}</div>`;
          card.appendChild(savedHtml);
        } else {
          const ratingContainer = document.createElement('div'); ratingContainer.className = 'card rating-card'; ratingContainer.innerHTML = `<div><strong>Rate ${otherName}</strong><div class="rating-stars" data-session="${s.id}"></div><textarea class="rating-feedback" placeholder="Optional feedback" rows="2"></textarea><div class="rating-actions"><button class="btn submit-rating"><span class="btn-text">Submit Rating</span><span class="btn-spinner hidden" aria-hidden="true"></span></button></div></div>`;
          card.appendChild(ratingContainer);
          const stars = ratingContainer.querySelector('.rating-stars');
          let selectedRating = 0;
          function highlightUpTo(value) {
            const nodes = Array.from(stars.querySelectorAll('button'));
            nodes.forEach((n, idx) => {
              if (idx < value) n.classList.add('hover-preview');
              else n.classList.remove('hover-preview');
            });
          }
          function clearPreview() {
            stars.querySelectorAll('.hover-preview').forEach(n => n.classList.remove('hover-preview'));
          }
          function applySelection(value) {
            const nodes = Array.from(stars.querySelectorAll('button'));
            nodes.forEach((n, idx) => {
              if (idx < value) n.classList.add('active');
              else n.classList.remove('active');
            });
          }
          for (let i=1;i<=5;i++) {
            const sEl = document.createElement('button');
            sEl.type='button'; sEl.className='star-btn'; sEl.textContent='★'; sEl.dataset.value=i;
            sEl.addEventListener('mouseenter', () => {
              const val = Number(sEl.dataset.value);
              highlightUpTo(val);
            });
            sEl.addEventListener('mouseleave', () => {
              clearPreview();
            });
            sEl.addEventListener('click', () => {
              selectedRating = Number(sEl.dataset.value);
              applySelection(selectedRating);
              clearPreview();
            });
            stars.appendChild(sEl);
          }
          stars.addEventListener('mouseleave', clearPreview);
          ratingContainer.querySelector('.submit-rating')?.addEventListener('click', async (ev) => {
            const btn = ev.currentTarget;
            if (!selectedRating) { showToast('Please select a rating'); return; }
            const feedback = ratingContainer.querySelector('.rating-feedback').value;
            setButtonLoading(btn, 'Submitting...', true);
            try {
              if (curr.id === s.studentID) await submitRating(s.id, selectedRating, null);
              else await submitRating(s.id, null, selectedRating);
              const reviewerName = curr.name || 'Someone';
              await addReview((curr.id === s.studentID) ? s.tutorID : s.studentID, curr.id, reviewerName, selectedRating, feedback);
              const savedData = { rating: selectedRating, feedback, reviewerName, date: new Date().toISOString() };
              localStorage.setItem(reviewedKey, '1');
              localStorage.setItem(savedKey, JSON.stringify(savedData));
              setButtonLoading(btn, '', false);
              console.log('Rating submitted for session', s.id, 'value', selectedRating);
              ratingContainer.innerHTML = `<div class="review-display"><div class="stars">${'★'.repeat(selectedRating)}</div><div class="review-meta"><strong>${reviewerName}</strong><span>Just now</span></div>${feedback ? `<div class="review-feedback">"${feedback}"</div>` : ''}</div>`;
              const reviewsPreview = document.getElementById('reviewsPreview');
              if (reviewsPreview) {
                try {
                  const reviews = await getReviewsForUser((curr.id === s.studentID) ? s.tutorID : s.studentID);
                  reviewsPreview.innerHTML = '';
                  const avg = Math.max(1, Math.min(5, Math.round((reviews.reduce((a,b)=>a+(b.rating||0),0))/(reviews.length||1))));
                  const avgHtml = `<div class="stars">${'★'.repeat(avg)}</div><div style="margin-top:6px;">(${reviews.length} Reviews)</div>`;
                  reviewsPreview.appendChild((() => { const d=document.createElement('div'); d.innerHTML = avgHtml; return d; })());
                  const list = document.createElement('div');
                  reviews.slice().reverse().slice(0,5).forEach(r => { const card = document.createElement('div'); card.className='card review-card'; const starsHtml = '★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating)))); const feedbackText = r.feedback ? `"${r.feedback}"` : 'No written feedback.'; card.innerHTML = `<div class="stars">${starsHtml}</div><div class="review-meta"><strong>${r.reviewerName || 'Reviewer'}</strong><span>${new Date(r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt || Date.now())).toLocaleDateString()}</span></div><div class="review-feedback">${feedbackText}</div>`; list.appendChild(card); });
                  reviewsPreview.appendChild(list);
                } catch (err) { console.error('Failed refresh reviews after rating', err); }
              }
            } catch (err) { console.error(err); setButtonLoading(btn, '', false); showToast('Failed to submit rating'); }
          });
        }
        completedSection.appendChild(card);
      });
    }
    completedColumn.appendChild(completedSection);
  }

  const unsub = subscribeSessionsForUser(curr.id, (list) => renderSessions(list));
  setupNotificationBell();
}

function logout() {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    clearCurrentUser();
  });
}

setActiveNav();
logout();

function initFAQ() {
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

function initStats() {
  const statsEl = document.getElementById('statsSection');
  if (!statsEl) return;

  async function loadStats() {
    try {
      const allUsers = await getAllUsers();
      const allSessions = await getAllSessions();
      const completed = allSessions.filter(s => (s.status || '').toLowerCase() === 'completed');

      const ratedUsers = allUsers.filter(u => (u.totalRatings || 0) > 0);
      let avgRating = 0;
      if (ratedUsers.length) {
        const totalR = ratedUsers.reduce((sum, u) => sum + (u.rating || 0), 0);
        avgRating = (totalR / ratedUsers.length).toFixed(1);
      }

      const uniquePairs = new Set();
      allSessions.forEach(s => {
        const pair = [s.studentID, s.tutorID].sort().join('_');
        uniquePairs.add(pair);
      });
      const allSubjectsSet = new Set();
      allUsers.forEach(u => {
        (u.strongSubjects || []).forEach(s => allSubjectsSet.add(s));
        (u.weakSubjects || []).forEach(s => allSubjectsSet.add(s));
      });

      const tutorIds = new Set();
      allSessions.forEach(s => {
        if (s.tutorID) tutorIds.add(s.tutorID);
      });
      const activeTutors = tutorIds.size;

      const targets = {
        statStudents: allUsers.length,
        statSessions: completed.length,
        statConnections: uniquePairs.size,
        statTutors: activeTutors
      };

      Object.entries(targets).forEach(([id, target]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const numTarget = parseFloat(target);
        if (isNaN(numTarget) || numTarget === 0) { el.textContent = target; return; }
        const isFloat = String(target).includes('.');
        const duration = 1200;
        const startTime = performance.now();

        function animate(now) {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = eased * numTarget;
          el.textContent = isFloat ? current.toFixed(1) : Math.round(current);
          if (progress < 1) requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
      });
    } catch (e) { console.warn('Stats load error', e); }
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        loadStats();
        observer.disconnect();
      }
    });
  }, { threshold: 0.2 });
  observer.observe(statsEl);
}

function initPageBackground() {
  if (page === 'home') return;
  const bg = document.createElement('div');
  bg.className = 'hero-bg';
  bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = '<div class="hero-particle-left" style="opacity:0.3;width:300px;height:300px;left:-80px;bottom:-60px;" aria-hidden="true"><svg viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="pg1" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#d5b893" stop-opacity="0.2"/><stop offset="100%" stop-color="#d5b893" stop-opacity="0"/></radialGradient><filter id="pgf"><feGaussianBlur stdDeviation="3"/></filter></defs><circle cx="250" cy="250" r="30" fill="url(#pg1)" filter="url(#pgf)"/><circle cx="180" cy="200" r="18" fill="url(#pg1)" filter="url(#pgf)"/><circle cx="320" cy="300" r="15" fill="url(#pg1)" filter="url(#pgf)"/><line x1="250" y1="250" x2="180" y2="200" stroke="rgba(213,184,147,0.08)" stroke-width="0.8"/><line x1="250" y1="250" x2="320" y2="300" stroke="rgba(213,184,147,0.06)" stroke-width="0.6"/><circle cx="250" cy="250" r="2" fill="#d5b893" opacity="0.2"/><circle cx="180" cy="200" r="1.5" fill="#d5b893" opacity="0.15"/></svg></div><div class="hero-tech-right" style="opacity:0.25;width:160px;height:160px;right:-40px;top:120px;" aria-hidden="true"><svg viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="tg2" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#d5b893" stop-opacity="0.1"/><stop offset="100%" stop-color="#d5b893" stop-opacity="0"/></radialGradient></defs><circle cx="140" cy="140" r="80" fill="url(#tg2)"/><circle cx="140" cy="140" r="60" stroke="rgba(213,184,147,0.08)" stroke-width="0.5" stroke-dasharray="5 7"/><circle cx="140" cy="140" r="40" stroke="rgba(96,165,250,0.06)" stroke-width="0.4"/><circle cx="140" cy="140" r="2" fill="#d5b893" opacity="0.15"/></svg></div>';
  document.body.insertBefore(bg, document.body.firstChild);
}

setActiveNav();
logout();

initFAQ();
initStats();
initPageBackground();
initMobileMenu();
initBioCounter();
initPhoneValidation();

if (page === 'home') initHomePage();
if (page === 'register') initRegisterPage();
if (page === 'student' || page === 'tutor') initDashboardPage();
if (page === 'profile') initProfilePage();
if (page === 'sessions') initSessionsPage();

function initMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const nav = document.getElementById('mainNav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    nav.classList.toggle('open');
  });
  nav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => nav.classList.remove('open'));
  });
  document.addEventListener('click', (e) => {
    if (!nav.contains(e.target) && !btn.contains(e.target)) {
      nav.classList.remove('open');
    }
  });
}

function initBioCounter() {
  const bioInput = document.getElementById('bioInput');
  const bioCounter = document.getElementById('bioCounter');
  if (!bioInput || !bioCounter) return;
  function update() {
    const len = (bioInput.value || '').length;
    bioCounter.textContent = `${len} / 300`;
    if (len >= 300) bioCounter.style.color = '#ef4444';
    else if (len >= 250) bioCounter.style.color = '#f59e0b';
    else bioCounter.style.color = 'rgba(226,232,240,0.7)';
  }
  bioInput.addEventListener('input', update);
  update();
}

function initPhoneValidation() {
  const phoneInput = document.querySelector('input[name="phone"]');
  const phoneError = document.getElementById('phoneError');
  if (!phoneInput) return;
  phoneInput.addEventListener('input', () => {
    phoneInput.value = phoneInput.value.replace(/[^0-9]/g, '').slice(0, 10);
    if (phoneError) {
      if (phoneInput.value.length > 0 && phoneInput.value.length !== 10) {
        phoneError.textContent = 'Phone must be exactly 10 digits.';
      } else {
        phoneError.textContent = '';
      }
    }
  });
}