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
  getAllSessions
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
    alert('Please log in first.');
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

async function hashPassword(rawPassword) {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawPassword);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function personCard(person, actions = '') {
  const strong = (person.strongSubjects || []).join(', ') || '-';
  const weak = (person.weakSubjects || []).join(', ') || '-';
  const rating = person.rating != null ? person.rating : 'N/A';
  const total = person.totalRatings != null ? person.totalRatings : 0;
  const region = person.region || '-';
  const availability = (person.availabilityDays || []).join(', ') + ' | ' + (person.availabilityTime || []).join(', ');

  return '<article class="person-card">' +
    '<h3>' + (person.name || 'Unknown') + '</h3>' +
    '<p class="meta"><strong>Strong subjects:</strong> ' + strong + '</p>' +
    '<p class="meta"><strong>Weak subjects:</strong> ' + weak + '</p>' +
    '<p class="meta"><strong>Rating:</strong> ' + rating + ' (' + total + ' ratings)</p>' +
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
    .filter((candidate) => candidate.role === 'tutor' || (candidate.weakSubjects || []).length === 0)
    .filter((candidate) => intersects(candidate.strongSubjects, student.weakSubjects))
    .filter((candidate) => intersects(candidate.availabilityDays, student.availabilityDays))
    .filter((candidate) => intersects(candidate.availabilityTime, student.availabilityTime));

  return sortByRegionPriority(matches, student.region);
}

async function loadStudentsForTutor(tutor) {
  const allUsers = await getAllUsers();
  const matches = allUsers
    .filter((candidate) => candidate.id !== tutor.id)
    .filter((candidate) => candidate.role === 'student' || (candidate.weakSubjects || []).length > 0)
    .filter((candidate) => intersects(tutor.strongSubjects, candidate.weakSubjects))
    .filter((candidate) => intersects(candidate.availabilityDays, tutor.availabilityDays))
    .filter((candidate) => intersects(candidate.availabilityTime, tutor.availabilityTime));

  return sortByRegionPriority(matches, tutor.region);
}

async function initHomePage() {
  const loginToggle = document.getElementById('openLogin');
  const loginPanel = document.getElementById('loginPanel');
  const loginForm = document.getElementById('loginForm');
  const loginMessage = document.getElementById('loginMessage');

  if (!loginToggle || !loginPanel || !loginForm || !loginMessage) return;

  console.log('initHomePage elements:', { loginToggle, loginPanel, loginForm, loginMessage });

  loginToggle.addEventListener('click', () => {
    console.log('openLogin clicked');
    loginPanel.classList.toggle('hidden');
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = (loginForm.elements.email.value || '').trim();

    if (!email) {
      loginMessage.textContent = 'Please enter a valid email.';
      return;
    }

    const password = (loginForm.elements.password.value || '').trim();
    if (!password) {
      loginMessage.textContent = 'Invalid email or password.';
      return;
    }

    const user = await getUserByEmail(email.toLowerCase());
    if (!user) {
      loginMessage.textContent = 'Invalid email or password.';
      console.log('login failed: user not found for', email);
      return;
    }

    const passwordHash = await hashPassword(password);
    if (!user.password || user.password !== passwordHash) {
      loginMessage.textContent = 'Invalid email or password.';
      console.log('login failed: wrong password for', email);
      return;
    }

    setCurrentUser(user);
    loginMessage.textContent = 'Logged in successfully! Redirecting to dashboard...';
    console.log('login success for', email, 'role=', user.role);

    setTimeout(() => {
      const role = user.role || (user.weakSubjects?.length ? 'student' : 'tutor');
      if (role === 'student') {
        location.href = 'student.html';
      } else {
        location.href = 'tutor.html';
      }
    }, 900);
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

    if (!password || password.length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match.');
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
      role: selectedWeak.length > 0 ? 'student' : 'tutor',
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

async function initStudentPage() {
  const user = requireUserOrRedirect();
  if (!user) return;

  const tutors = await loadTutorsForStudent(user);
  const tutorsList = document.getElementById('tutorsList');

  if (tutorsList) {
    tutorsList.innerHTML = tutors.length
      ? tutors
          .map((tutor) =>
            personCard(
              tutor,
              '<button class="btn secondary view-profile" data-id="' + tutor.id + '">View Profile</button>' +
                '<button class="btn request-session" data-id="' + tutor.id + '">Request Session</button>'
            )
          )
          .join('')
      : '<p>No matching tutors found right now.</p>';
  }

  const users = await getAllUsers();
  const userMap = new Map(users.map((u) => [u.id, u]));
  const sessions = (await getSessionsForUser(user.id)).filter((s) => s.studentID === user.id);

  const pendingEl = document.getElementById('studentPendingSessions');
  const completedEl = document.getElementById('studentCompletedSessions');

  if (pendingEl) {
    const pendingSessions = sessions.filter((s) => s.status !== 'completed');
    pendingEl.innerHTML = pendingSessions.length
      ? pendingSessions
          .map((s) =>
            sessionCard(
              s,
              userMap,
              s.status === 'accepted' ? '<button class="btn complete-btn" data-id="' + s.id + '">Mark Completed</button>' : ''
            )
          )
          .join('')
      : '<p>No active sessions.</p>';
  }

  if (completedEl) {
    const completedSessions = sessions.filter((s) => s.status === 'completed');
    completedEl.innerHTML = completedSessions.length
      ? completedSessions
          .map((s) =>
            sessionCard(s, userMap, '<button class="btn rate-btn" data-id="' + s.id + '">Rate Tutor</button>')
          )
          .join('')
      : '<p>No completed sessions yet.</p>';
  }

  const tutorsContainer = document.getElementById('tutorsList');
  if (tutorsContainer) {
    tutorsContainer.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;

      const tutorID = target.dataset.id;

      if (target.classList.contains('view-profile')) {
        localStorage.setItem('peerbridgeViewProfile', tutorID);
        location.href = 'profile.html';
        return;
      }

      if (target.classList.contains('request-session')) {
        const tutor = tutors.find((t) => t.id === tutorID);
        const subject = prompt('Enter subject to request (e.g. ' + (tutor?.strongSubjects?.[0] || 'Mathematics') + '):');
        if (!subject) return;
        const date = prompt('Enter session date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
        if (!date) return;
        const time = prompt('Enter session time slot (Morning 6-10 AM, Afternoon 12-4 PM, Evening 5-9 PM):', 'Evening 5-9 PM');
        if (!time) return;

        await createSessionRequest(user.id, tutorID, subject, date, time);
        alert('Session request sent.');
        location.reload();
      }
    });
  }

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    if (target.classList.contains('complete-btn')) {
      await completeSession(target.dataset.id);
      location.reload();
    }

    if (target.classList.contains('rate-btn')) {
      const tutorRating = Number(prompt('Rate tutor (1-5):', '5'));
      if (!tutorRating || tutorRating < 1 || tutorRating > 5) return;
      await submitRating(target.dataset.id, null, tutorRating);
      alert('Rating submitted.');
      location.reload();
    }
  });
}

async function initTutorPage() {
  const user = requireUserOrRedirect();
  if (!user) return;

  const matchedStudents = await loadStudentsForTutor(user);
  const studentRequests = document.getElementById('studentRequests');

  if (studentRequests) {
    studentRequests.innerHTML = matchedStudents.length
      ? matchedStudents
          .map((student) =>
            personCard(
              student,
              '<button class="btn secondary view-profile" data-id="' + student.id + '">View Profile</button>'
            )
          )
          .join('')
      : '<p>No matching students found right now.</p>';
  }

  const allUsers = await getAllUsers();
  const userMap = new Map(allUsers.map((u) => [u.id, u]));
  const sessions = (await getSessionsForUser(user.id)).filter((s) => s.tutorID === user.id);

  const teachingEl = document.getElementById('teachingSessions');
  const completedEl = document.getElementById('tutorCompletedSessions');

  if (teachingEl) {
    const teachingSessions = sessions.filter((s) => s.status === 'pending' || s.status === 'accepted');
    teachingEl.innerHTML = teachingSessions.length
      ? teachingSessions
          .map((s) =>
            sessionCard(
              s,
              userMap,
              s.status === 'pending'
                ? '<button class="btn accept-session" data-id="' + s.id + '">Accept</button><button class="btn secondary reject-session" data-id="' + s.id + '">Reject</button>'
                : ''
            )
          )
          .join('')
      : '<p>No teaching sessions.</p>';
  }

  if (completedEl) {
    const completedSessions = sessions.filter((s) => s.status === 'completed');
    completedEl.innerHTML = completedSessions.length
      ? completedSessions
          .map((s) => sessionCard(s, userMap, '<button class="btn rate-student" data-id="' + s.id + '">Rate Student</button>'))
          .join('')
      : '<p>No completed sessions yet.</p>';
  }

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    if (target.classList.contains('view-profile')) {
      localStorage.setItem('peerbridgeViewProfile', target.dataset.id);
      location.href = 'profile.html';
      return;
    }

    if (target.classList.contains('accept-session')) {
      await acceptSessionRequest(target.dataset.id);
      location.reload();
      return;
    }

    if (target.classList.contains('reject-session')) {
      await rejectSessionRequest(target.dataset.id);
      location.reload();
      return;
    }

    if (target.classList.contains('rate-student')) {
      const studentRating = Number(prompt('Rate student (1-5):', '5'));
      if (!studentRating || studentRating < 1 || studentRating > 5) return;
      await submitRating(target.dataset.id, studentRating, null);
      alert('Rating submitted.');
      location.reload();
      return;
    }
  });
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

  profileContent.innerHTML =
    '<div class="person-card">' +
    '<h3>' + (userToShow.name || 'Unknown') + '</h3>' +
    '<p class="meta"><strong>Email:</strong> ' + (userToShow.email || '-') + '</p>' +
    '<p class="meta"><strong>Phone:</strong> ' + (userToShow.phone || '-') + '</p>' +
    '<p class="meta"><strong>Region:</strong> ' + (userToShow.region || '-') + '</p>' +
    '<p class="meta"><strong>Address:</strong> ' + (userToShow.address?.doorNumber || '') + ', ' + (userToShow.address?.street || '') + ', ' + (userToShow.address?.city || '') + ', ' + (userToShow.address?.state || '') + ' - ' + (userToShow.address?.postalCode || '') + '</p>' +
    '<p class="meta"><strong>Strong Subjects:</strong> ' + ((userToShow.strongSubjects || []).join(', ') || '-') + '</p>' +
    '<p class="meta"><strong>Weak Subjects:</strong> ' + ((userToShow.weakSubjects || []).join(', ') || '-') + '</p>' +
    '<p class="meta"><strong>Availability:</strong> ' + ((userToShow.availabilityDays || []).join(', ') || '-') + ' | ' + ((userToShow.availabilityTime || []).join(', ') || '-') + '</p>' +
    '<p class="meta"><strong>Bio:</strong> ' + (userToShow.bio || 'No bio added.') + '</p>' +
    '<p class="meta"><strong>Rating:</strong> ' + (userToShow.rating != null ? userToShow.rating : 'N/A') + ' (' + (userToShow.totalRatings != null ? userToShow.totalRatings : 0) + ' ratings)</p>' +
    '</div>';
}

async function initSessionsPage() {
  requireUserOrRedirect();

  const sessions = await getAllSessions();
  const users = await getAllUsers();
  const userMap = new Map(users.map((u) => [u.id, u]));

  const allSessionsEl = document.getElementById('allSessions');
  if (allSessionsEl) {
    allSessionsEl.innerHTML = sessions.length
      ? sessions.map((s) => sessionCard(s, userMap)).join('')
      : '<p>No sessions created yet.</p>';
  }
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
if (page === 'student') initStudentPage();
if (page === 'tutor') initTutorPage();
if (page === 'profile') initProfilePage();
if (page === 'sessions') initSessionsPage();
