import {
  registerUser,
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
  const val = Number(r || 0);
  if (val <= 2.4) return 2;
  if (val <= 3.4) return 3;
  if (val <= 4.4) return 4;
  return 5;
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
    const left = `<div class="profile-left"><div class="avatar-placeholder">${(target.name||'?').slice(0,1)}</div><div><h3>${target.name || 'Unknown'}</h3><div class="meta"><span class="stars">${'★'.repeat(ratingToStars(target.rating != null ? target.rating : 3))}</span></div></div></div>`;
  const middle = `<div class="profile-middle"><div class="card"><div class="profile-label">Email</div><div class="profile-value">${target.email || '-'}</div></div><div class="card"><div class="profile-label">Phone</div><div class="profile-value">${target.phone || '-'}</div></div><div class="card"><div class="profile-label">Region</div><div class="profile-value">${target.region || '-'}</div></div><div class="card"><div class="profile-label">Address</div><div class="profile-value">${address.doorNumber ? address.doorNumber + ', ' : ''}${address.street ? address.street + '<br/>' : ''}${address.city ? address.city + '<br/>' : ''}${address.state ? address.state + ' - ' : ''}${address.postalCode || ''}</div></div><div class="card"><div class="profile-label">Availability</div><div class="profile-value">${availability || '-'}</div></div></div>`;
  const right = `<div class="profile-right"><div class="card"><div class="profile-label">Subjects</div><div class="profile-value"><strong>Strong:</strong> ${strongTags || '-'}<br/><strong>Weak:</strong> ${weakTags || '-'}</div></div><div class="card"><div class="profile-label">About</div><div class="profile-value">${target.bio || 'No bio added.'}</div></div><div id="reviewsPreview" class="card"><div class="profile-label">Reviews</div><div class="profile-value">Loading...</div></div></div>`;
  const footer = `<div class="actions"><button id="closeModalBtn" class="btn secondary">Close</button> ${(contextType === 'tutor') ? `<button class="btn request-session" data-id="${userId}">Request Session</button>` : `<button class="btn offer-help" data-id="${userId}">Offer Help</button>`}</div>`;
  const gridHtml = `<div class="profile-modal-grid">${left}${middle}${right}</div>${footer}`;
  openModal(gridHtml);
  document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
  const modalContainer = getModalContainer();
  modalContainer?.querySelector('.request-session')?.addEventListener('click', (e) => { const id = e.target.dataset.id; openSessionModal(id, 'request'); });
  modalContainer?.querySelector('.offer-help')?.addEventListener('click', (e) => { const id = e.target.dataset.id; openSessionModal(id, 'offer'); });
  const modalEl = modalContainer?.querySelector('.modal');
  if (modalEl) {
    modalEl.classList.add('compact','solid');
    modalEl.style.maxWidth = '1100px';
    modalEl.style.width = 'min(1100px, 92vw)';
    modalEl.style.overflow = 'visible';
    const grid = modalEl.querySelector('.profile-modal-grid');
    if (grid) {
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = '1fr 1fr 1fr';
      grid.style.gap = '18px';
      grid.style.alignItems = 'start';
    }
  }
  (async () => {
    try {
      const reviews = await getReviewsForUser(target.id);
      const preview = document.getElementById('reviewsPreview');
      if (!preview) return;
      preview.innerHTML = '';
      if (!reviews.length) { preview.innerHTML = '<div class="profile-value">No reviews yet.</div>'; return; }
      const avg = target.rating != null ? ratingToStars(target.rating) : 3;
      const avgHtml = `<div class="stars">${'★'.repeat(avg)}</div><div style="margin-top:6px;">(${target.totalRatings || 0} Reviews)</div>`;
      const list = document.createElement('div');
      reviews.slice().reverse().slice(0,5).forEach(r => {
        const card = document.createElement('div'); card.className = 'card';
        const stars = '★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating))));
        const feedbackText = r.feedback ? `"${r.feedback}"` : '';
        card.innerHTML = `<div class="stars">${stars}</div><div style="margin-top:6px;"><strong>${r.reviewerName || 'Reviewer'}</strong> • ${new Date(r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt || Date.now())).toLocaleDateString()}</div><div style="margin-top:8px;">${feedbackText}</div>`;
        list.appendChild(card);
      });
      preview.appendChild((() => { const d=document.createElement('div'); d.innerHTML = avgHtml; return d; })());
      preview.appendChild(list);
    } catch (err) { console.error('Failed to load reviews', err); }
  })();
  try { window.openProfileModal = openProfileModal; } catch (e) { /* ignore in restricted contexts */ }
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
  const subjectOptions = common.map(s => `<option value="${s}">${s}</option>`).join('');
  const title = mode === 'request' ? 'Request a Learning Session' : 'Offer Learning Support';
  const body = `<div><h3>${title}</h3><div class="card"><label>Subject<select id="sessionSubject">${subjectOptions}</select></label><label>Session Date<input id="sessionDate" type="date" /></label><div id="timeSlots" style="margin-top:8px;"><button type="button" class="btn time-slot" data-slot="Morning">🌅 Morning</button><button type="button" class="btn time-slot" data-slot="Afternoon">☀️ Afternoon</button><button type="button" class="btn time-slot" data-slot="Evening">🌙 Evening</button></div></div><div class="actions"><button id="cancelSessionBtn" class="btn secondary">Cancel</button><button id="sendSessionBtn" class="btn"><span class="btn-text">Send ${mode==='request'?'Request':'Offer'}</span><span class="btn-spinner hidden" aria-hidden="true"></span></button></div></div>`;
  openModal(body);
  const modalEl2 = modalContainer.querySelector('.modal');
  if (modalEl2) {
    modalEl2.classList.add('solid');
    // slightly lighten background for readability
    modalEl2.style.backgroundColor = 'rgba(28,28,28,0.95)';
    modalEl2.style.color = 'inherit';
  }
  let selectedSlot = null;
  const sendBtn = modalContainer.querySelector('#sendSessionBtn');
  const sendBtnText = sendBtn?.querySelector('.btn-text');
  const sendBtnSpinner = sendBtn?.querySelector('.btn-spinner');
  // add a small label and make selected state visually obvious
  const timeSlotsEl = modalContainer.querySelector('#timeSlots');
  if (timeSlotsEl) {
    const labelEl = document.createElement('div'); labelEl.textContent = 'Select a Time Slot'; labelEl.style.marginTop = '8px'; labelEl.style.fontWeight = '600'; labelEl.style.marginBottom = '6px';
    timeSlotsEl.parentNode.insertBefore(labelEl, timeSlotsEl);
  }
  modalContainer.querySelectorAll('.time-slot').forEach(btn => btn.addEventListener('click', (e) => {
    modalContainer.querySelectorAll('.time-slot').forEach(b => {
      b.classList.remove('active');
      b.style.background = ''; b.style.color = ''; b.style.boxShadow = '';
    });
    const cur = e.currentTarget;
    cur.classList.add('active');
    cur.style.background = '#2a9d8f'; cur.style.color = '#fff'; cur.style.boxShadow = '0 6px 18px rgba(42,157,143,0.14)';
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
      if (sendBtn) { sendBtn.disabled = true; if (sendBtnSpinner) sendBtnSpinner.classList.remove('hidden'); if (sendBtnText) sendBtnText.textContent = 'Sending...'; }
      const docRef = (mode === 'request') ? await createSessionRequest(curr.id, targetUserId, subject, date, time) : await createSessionRequest(targetUserId, curr.id, subject, date, time);
      const notifPayload = {
        recipientID: tutorId,
        senderID: curr.id,
        senderName: curr.name || 'Someone',
        subject,
        date,
        time,
        requestID: docRef.id,
        status: 'pending'
      };
      await createNotification(notifPayload);
      if (sourceButton) {
        sourceButton.textContent = mode === 'request' ? 'Request Sent' : 'Offer Sent';
        sourceButton.disabled = true;
        sourceButton.style.opacity = '0.7';
        sourceButton.style.cursor = 'not-allowed';
      }
      closeModal();
      showToast('✅ Request sent successfully');
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

// Notification UI helpers (used on multiple pages)
async function setupNotificationBell() {
  const bell = document.getElementById('notifBell');
  const dot = document.getElementById('notifDot');
  if (!bell) return;
  const curr = getCurrentUser();
  if (!curr) return;
  // create panel
  let panel = document.querySelector('.notif-panel');
  if (!panel) {
    panel = document.createElement('div'); panel.className = 'notif-panel'; panel.innerHTML = '<h3>Notifications</h3><div id="notifList"></div>';
    document.body.appendChild(panel);
  }

  let unsub = null;
  function renderList(list) {
    const notifList = document.getElementById('notifList');
    if (!notifList) return;
    notifList.innerHTML = '';
    if (!list.length) {
      notifList.innerHTML = '<p class="hint">No notifications</p>';
      dot?.classList.add('hidden');
      return;
    }
    // sort by createdAt descending (newest first)
    list.sort((a, b) => {
      const ta = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const tb = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return tb - ta;
    });
    const unread = list.filter(n => n.unread).length;
    if (dot) dot.classList.toggle('hidden', unread === 0);
    list.forEach(n => {
      const card = document.createElement('div'); card.className = 'notif-card'; card.dataset.id = n.id;
      const title = document.createElement('p');
      if (n.message) {
        title.innerHTML = `<strong>${n.message}</strong>`;
      } else {
        title.innerHTML = `<strong>${n.senderName || 'Someone'}</strong> requested help in <strong>${n.subject}</strong>`;
      }
      const meta = document.createElement('p'); meta.className = 'meta'; meta.textContent = `${n.date || ''} • ${n.time || ''}`;
      card.appendChild(title); card.appendChild(meta);
      const actions = document.createElement('div'); actions.className = 'notif-actions';
      const view = document.createElement('button'); view.className = 'btn'; view.innerHTML = '<span class="btn-text">View Profile</span><span class="btn-spinner hidden" aria-hidden="true"></span>';
      view.addEventListener('click', async () => {
        console.log('Notif: View clicked', n.id, n.senderID);
        panel.classList.remove('open');
        if (window.openProfileModal) {
          const contextType = await getProfileContextType(n.senderID);
          window.openProfileModal(n.senderID, contextType);
        } else {
          console.warn('openProfileModal not available in this scope');
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
            // notify student
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
            // notify student
            await createNotification({ recipientID: n.senderID, senderID: curr.id, senderName: curr.name || 'Someone', subject: n.subject, date: n.date, time: n.time, requestID: n.requestID, status: 'declined', message: 'Your request has been declined.' });
            setButtonLoading(decline, '', false);
            const card = document.querySelector(`.notif-card[data-id="${n.id}"]`);
            if (card) { const actionsDiv = card.querySelector('.notif-actions'); if (actionsDiv) { actionsDiv.innerHTML = ''; const badge = document.createElement('span'); badge.className = 'badge-status badge-declined'; badge.textContent = 'Declined'; actionsDiv.appendChild(badge); } }
          } catch (err) { console.error('Failed decline', err); setButtonLoading(decline, '', false); showToast('Failed to decline request'); }
        });
        actions.appendChild(accept); actions.appendChild(decline);
      } else if (st === 'accepted') {
        const badge = document.createElement('span'); badge.className = 'badge-status badge-accepted'; badge.textContent = 'Accepted';
        // style to match app palette and typography
        badge.style.backgroundColor = '#2a9d8f'; badge.style.color = '#fff'; badge.style.padding = '6px 10px'; badge.style.borderRadius = '14px'; badge.style.fontWeight = '600'; badge.style.fontFamily = 'inherit'; actions.appendChild(badge);
      } else if (st === 'declined') {
        const badge = document.createElement('span'); badge.className = 'badge-status badge-declined'; badge.textContent = 'Declined';
        badge.style.backgroundColor = '#6c757d'; badge.style.color = '#fff'; badge.style.padding = '6px 10px'; badge.style.borderRadius = '14px'; badge.style.fontWeight = '600'; badge.style.fontFamily = 'inherit'; actions.appendChild(badge);
      }
      card.appendChild(actions);
      // visual unread marker (only for unread items)
      if (n.unread) {
        card.classList.add('notif-unread');
        card.style.borderLeft = '4px solid #2a9d8f';
      } else {
        card.classList.remove('notif-unread');
        card.style.borderLeft = '';
      }

      // timestamp footer (small, light)
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

  // subscribe to notifications
  if (unsub) unsub();
  unsub = subscribeNotificationsForUser(curr.id, (list) => renderList(list));

  // toggle panel
  bell.addEventListener('click', (e) => {
    e.preventDefault();
    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
      bell.setAttribute('aria-expanded', 'false');
    } else {
      panel.classList.add('open');
      bell.setAttribute('aria-expanded', 'true');
    }
  });
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

  // Toggle panel (preserve existing toggle behavior) and focus email when opened
  if (loginToggle) {
    loginToggle.addEventListener('click', () => {
      loginPanel.classList.toggle('hidden');
      // keep ARIA in sync
      loginPanel.setAttribute('aria-hidden', String(loginPanel.classList.contains('hidden')));
      if (!loginPanel.classList.contains('hidden')) {
        setTimeout(() => emailInput.focus(), 180);
      }
    });
  }

  // Email inline validation
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

  // Password show/hide toggle
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

  // Caps Lock detection and Enter key support in password field
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
      // trigger form submission
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

    // disable button, show spinner, update text
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
      // Redirect to unified dashboard
      location.href = 'student.html';
    } catch (err) {
      console.log('login attempt error', err);
      // restore button state
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

  function renderChips(container, selectedArray, oppositeArray, items = []) {
    if (!container) return;
    container.innerHTML = '';
    const subjectList = items.length ? items : SUBJECTS;

    subjectList.forEach((subject) => {
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
        renderChips(strongContainer, selectedStrong, selectedWeak, SUBJECTS);
        renderChips(weakContainer, selectedWeak, selectedStrong, SUBJECTS);
        renderChips(availabilityDaysContainer, selectedAvailabilityDays, null, AVAILABILITY_DAYS);
        renderChips(availabilityTimeContainer, selectedAvailabilityTime, null, AVAILABILITY_TIMES);
      });
      container.appendChild(chip);
    });
  }

  renderChips(strongContainer, selectedStrong, selectedWeak, SUBJECTS);
  renderChips(weakContainer, selectedWeak, selectedStrong, SUBJECTS);
  renderChips(availabilityDaysContainer, selectedAvailabilityDays, null, AVAILABILITY_DAYS);
  renderChips(availabilityTimeContainer, selectedAvailabilityTime, null, AVAILABILITY_TIMES);

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
      location.href = 'index.html';
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

  // make notifications available on dashboard
  setupNotificationBell();

  // subscribe sessions to update request buttons state (prevent duplicates)
  try {
    if (user && user.id) {
      subscribeSessionsForUser(user.id, (list) => {
        // for each session where current user is student or tutor, disable matching buttons
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

  // Modal + toast helpers
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
    // close on background click
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

  // Delegate actions
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

  // Profile modal: not defined inside dashboard; shared globally below.
}

async function initProfilePage() {
  const user = requireUserOrRedirect();
  if (!user) return;

  const viewId = localStorage.getItem('peerbridgeViewProfile');
  localStorage.removeItem('peerbridgeViewProfile');

  let userToShow = user;
  if (viewId && viewId !== user.id) {
    const allUsers = await getAllUsers();
    const targetUser = allUsers.find((item) => item.id === viewId);
    if (targetUser) userToShow = targetUser;
  } else {
    const fresh = await getUserById(user.id);
    if (fresh) {
      userToShow = fresh;
      setCurrentUser(fresh);
    }
  }

  const profileContent = document.getElementById('profileContent');
  if (!profileContent) return;
  // reuse modal style cards for profile page for consistent look
  const strongTags = (userToShow.strongSubjects || []).map(s => `<span class="tag">${s}</span>`).join('');
  const weakTags = (userToShow.weakSubjects || []).map(s => `<span class="tag">${s}</span>`).join('');
  const availability = (userToShow.availabilityDays || []).map(d => `<span class="badge">${d}</span>`).join('') + ' ' + (userToShow.availabilityTime || []).map(t => `<span class="badge">${t}</span>`).join(' ');
  const address = userToShow.address || {};
  const starCount = ratingToStars(userToShow.rating != null ? userToShow.rating : 3);
  const starsHtml = '<span class="stars">' + '★'.repeat(starCount) + '</span>';
  const reviewsSummary = `<div style="margin-top:8px;">${starsHtml} <span>(${userToShow.totalRatings || 0} Reviews)</span></div>`;
  profileContent.innerHTML = `<div class="modal"><div class="modal-header"><div class="avatar-placeholder">${(userToShow.name||'?').slice(0,1)}</div><div><h3>${userToShow.name || 'Unknown'}</h3>${reviewsSummary}</div></div><div class="card"><p>📧 ${userToShow.email || '-'}</p><p>📱 ${userToShow.phone || '-'}</p><p>📍 ${userToShow.region || '-'}</p></div><div class="card"><strong>Address</strong><div>${address.doorNumber ? address.doorNumber + ', ' : ''}${address.street ? address.street + ', ' : ''}${address.city ? address.city + ', ' : ''}${address.state ? address.state + ' - ' : ''}${address.postalCode || ''}</div></div><div class="card"><strong>Strong Subjects</strong><div>${strongTags || '-'}</div><strong>Weak Subjects</strong><div>${weakTags || '-'}</div></div><div class="card"><strong>Availability</strong><div>${availability || '-'}</div></div><div class="card"><strong>About Me</strong><div>${userToShow.bio || 'No bio added.'}</div></div></div>`;
  // load reviews area
  (async () => {
    try {
      const reviews = await getReviewsForUser(userToShow.id);
      if (!reviews.length) return;
      const container = document.createElement('div'); container.innerHTML = '<h4>Reviews</h4>';
      reviews.slice().reverse().forEach(r => {
        const stars = '★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating))));
        const feedbackText = r.feedback ? `"${r.feedback}"` : '';
        const card = document.createElement('div'); card.className = 'card';
        card.innerHTML = `<div class="stars">${stars}</div><div style="margin-top:6px;"><strong>${r.reviewerName || 'Reviewer'}</strong> • ${new Date(r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt || Date.now())).toLocaleDateString()}</div><div style="margin-top:8px;">${feedbackText}</div>`;
        container.appendChild(card);
      });
      profileContent.appendChild(container);
    } catch (err) { console.error('Failed to load reviews', err); }
  })();

  // ensure notification bell works on profile page
  setupNotificationBell();
}

async function initSessionsPage() {
  const curr = requireUserOrRedirect();
  if (!curr) return;
  const allSessionsEl = document.getElementById('allSessions');
  if (!allSessionsEl) return;

  // render helper
  async function renderSessions(list) {
    const users = await getAllUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));
    const sessions = list || [];
    allSessionsEl.innerHTML = '';
    if (!sessions.length) { allSessionsEl.innerHTML = '<p>No sessions created yet.</p>'; return; }

    const active = sessions.filter(s => (s.status || '').toLowerCase() !== 'completed');
    const completed = sessions.filter(s => (s.status || '').toLowerCase() === 'completed');

    const activeHeader = document.createElement('h2'); activeHeader.textContent = 'Active Sessions'; allSessionsEl.appendChild(activeHeader);
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

      if (stLower === 'accepted') {
        const mark = document.createElement('button'); mark.className = 'btn'; mark.innerHTML = '<span class="btn-text">Mark Completed</span><span class="btn-spinner hidden" aria-hidden="true"></span>';
        mark.addEventListener('click', async () => {
          setButtonLoading(mark, 'Completing...', true);
          try { await completeSession(s.id); setButtonLoading(mark, '', false); showToast('Session marked as completed'); }
          catch (err) { console.error(err); setButtonLoading(mark, '', false); showToast('Failed to update session'); }
        });
        card.querySelector('.action-row')?.appendChild(mark);
      }

      if (stLower === 'completed') {
        // handled in completed section
      }

      allSessionsEl.appendChild(card);
    });

    const compHeader = document.createElement('h2'); compHeader.textContent = 'Completed Sessions'; allSessionsEl.appendChild(compHeader);
    if (!completed.length) { const p = document.createElement('p'); p.textContent = 'No completed sessions yet.'; allSessionsEl.appendChild(p); }
    else {
      completed.forEach(s => {
        const el = document.createElement('div'); el.innerHTML = sessionCard(s, userMap); const card = el.firstElementChild;
        const statusEl = card.querySelector('.status'); statusEl.textContent = 'Completed'; statusEl.className = 'status completed';
        const otherId = curr.id === s.tutorID ? s.studentID : s.tutorID; const otherName = (userMap.get(otherId) || {}).name || 'Participant';
        // handle review display and submission; hide form if already reviewed locally
        const reviewedKey = `reviewed_${s.id}_${curr.id}`;
        const savedKey = `review_${s.id}_${curr.id}`;
        if (localStorage.getItem(reviewedKey)) {
          const saved = JSON.parse(localStorage.getItem(savedKey) || '{}');
          const savedHtml = document.createElement('div'); savedHtml.className = 'card';
          const starsHtml = '★'.repeat(Math.max(1, Math.min(5, Math.round(saved.rating || 0))));
          const feedbackText = saved.feedback ? `"${saved.feedback}"` : '';
          savedHtml.innerHTML = `<div class="stars">${starsHtml}</div><div style="margin-top:6px;"><p>${feedbackText}</p></div>`;
          card.appendChild(savedHtml);
        } else {
          const ratingContainer = document.createElement('div'); ratingContainer.className = 'card'; ratingContainer.innerHTML = `<div><strong>Rate ${otherName}</strong><div class="rating-stars" data-session="${s.id}"></div><textarea class="rating-feedback" placeholder="Optional feedback" rows="2" style="width:100%;margin-top:8px;border-radius:8px;padding:8px;background:rgba(0,0,0,0.05);color:#fff;border:1px solid rgba(255,255,255,0.06);"></textarea><div style="text-align:right;margin-top:8px;"><button class="btn submit-rating"><span class="btn-text">Submit Rating</span><span class="btn-spinner hidden" aria-hidden="true"></span></button></div></div>`;
          card.appendChild(ratingContainer);
          const stars = ratingContainer.querySelector('.rating-stars');
          for (let i=1;i<=5;i++) {
            const sEl = document.createElement('button');
            sEl.type='button'; sEl.className='star-btn'; sEl.textContent='★'; sEl.dataset.value=i;
            sEl.addEventListener('mouseenter', ()=>{ sEl.style.transform='translateY(-4px) scale(1.06)'; });
            sEl.addEventListener('mouseleave', ()=>{ sEl.style.transform=''; });
            sEl.addEventListener('click', ()=>{
              const nodes = Array.from(stars.querySelectorAll('button'));
              nodes.forEach((n, idx) => {
                if (idx <= i-1) n.classList.add('active'); else n.classList.remove('active');
              });
            });
            stars.appendChild(sEl);
          }
          ratingContainer.querySelector('.submit-rating')?.addEventListener('click', async (ev) => {
            const btn = ev.currentTarget; const selected = +stars.querySelector('button.active')?.dataset.value; const feedback = ratingContainer.querySelector('.rating-feedback').value;
            if (!selected) { showToast('Please select a rating'); return; }
            setButtonLoading(btn, 'Submitting...', true);
            try {
              if (curr.id === s.studentID) await submitRating(s.id, selected, null);
              else await submitRating(s.id, null, selected);
              const reviewerName = curr.name || 'Someone'; await addReview((curr.id === s.studentID) ? s.tutorID : s.studentID, curr.id, reviewerName, selected, feedback);
              // persist locally so the form stays hidden on future visits in this browser
              localStorage.setItem(reviewedKey, '1');
              localStorage.setItem(savedKey, JSON.stringify({ rating: selected, feedback }));
              setButtonLoading(btn, '', false);
              console.log('Rating submitted for session', s.id, 'value', selected);
              ratingContainer.innerHTML = '<div><div class="stars">' + '★'.repeat(selected) + '</div><p>Thank you for sharing your feedback.</p></div>';
              const reviewsPreview = document.getElementById('reviewsPreview');
              if (reviewsPreview) {
                try {
                  const reviews = await getReviewsForUser((curr.id === s.studentID) ? s.tutorID : s.studentID);
                  reviewsPreview.innerHTML = '';
                  const avg = Math.max(1, Math.min(5, Math.round((reviews.reduce((a,b)=>a+(b.rating||0),0))/(reviews.length||1))));
                  const avgHtml = `<div class="stars">${'★'.repeat(avg)}</div><div style="margin-top:6px;">(${reviews.length} Reviews)</div>`;
                  reviewsPreview.appendChild((() => { const d=document.createElement('div'); d.innerHTML = avgHtml; return d; })());
                  const list = document.createElement('div');
                  reviews.slice().reverse().slice(0,5).forEach(r => { const card = document.createElement('div'); card.className='card'; const starsHtml = '★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating)))); const feedbackText = r.feedback ? `"${r.feedback}"` : ''; card.innerHTML = `<div class="stars">${starsHtml}</div><div style="margin-top:6px;"><strong>${r.reviewerName || 'Reviewer'}</strong> • ${new Date(r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt || Date.now())).toLocaleDateString()}</div><div style="margin-top:8px;">${feedbackText}</div>`; list.appendChild(card); });
                  reviewsPreview.appendChild(list);
                } catch (err) { console.error('Failed refresh reviews after rating', err); }
              }
            } catch (err) { console.error(err); setButtonLoading(btn, '', false); showToast('Failed to submit rating'); }
          });
        }
        allSessionsEl.appendChild(card);
      });
    }
  }

  // subscribe for realtime updates
  const unsub = subscribeSessionsForUser(curr.id, (list) => renderSessions(list));

  // notifications on sessions page
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

if (page === 'home') initHomePage();
if (page === 'register') initRegisterPage();
if (page === 'student' || page === 'tutor') initDashboardPage();
if (page === 'profile') initProfilePage();
if (page === 'sessions') initSessionsPage();
