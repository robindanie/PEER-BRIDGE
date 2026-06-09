import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAwfHIVoBrv85_7H1vI82aAPE1icKwSWgA',
  authDomain: 'peerbridge-1c9e8.firebaseapp.com',
  projectId: 'peerbridge-1c9e8',
  storageBucket: 'peerbridge-1c9e8.appspot.com',
  messagingSenderId: '864131366471',
  appId: '1:864131366471:web:b10a51c80155ff18f583b62'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const usersRef = collection(db, 'users');
const sessionsRef = collection(db, 'sessions');
const ratingsRef = collection(db, 'ratings');

export async function registerUser(payload) {
  const created = await addDoc(usersRef, {
    ...payload,
    rating: 2.5,
    totalRatings: 0,
    createdAt: serverTimestamp()
  });
  return created.id;
}

export async function getAllUsers() {
  const snapshots = await getDocs(usersRef);
  return snapshots.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function getUserByEmail(email) {
  const q = query(usersRef, where('email', '==', email));
  const result = await getDocs(q);
  if (result.empty) return null;
  const first = result.docs[0];
  return { id: first.id, ...first.data() };
}

export async function getUserById(userId) {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return null;
  return { id: userSnap.id, ...userSnap.data() };
}

export async function updateUser(userId, data) {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, data);
}

async function updateUserRating(userId, newScore) {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;

  const data = userSnap.data();
  const currentRating = Number(data.rating || 2.5);
  const totalRatings = Number(data.totalRatings || 0);

  const updatedTotal = totalRatings + 1;
  const updatedRating = (currentRating * totalRatings + newScore) / updatedTotal;

  await updateDoc(userRef, {
    rating: Number(updatedRating.toFixed(2)),
    totalRatings: updatedTotal
  });
}

export async function createSessionRequest(studentID, tutorID, subject, date, time) {
  return addDoc(sessionsRef, {
    studentID,
    tutorID,
    subject,
    date,
    time,
    status: 'pending',
    createdAt: serverTimestamp()
  });
}

export async function acceptSessionRequest(sessionID) {
  const sessionRef = doc(db, 'sessions', sessionID);
  await updateDoc(sessionRef, { status: 'accepted' });
}

export async function rejectSessionRequest(sessionID) {
  const sessionRef = doc(db, 'sessions', sessionID);
  await updateDoc(sessionRef, { status: 'rejected' });
}

export async function completeSession(sessionID) {
  const sessionRef = doc(db, 'sessions', sessionID);
  await updateDoc(sessionRef, { status: 'completed' });
}

export async function submitRating(sessionID, studentRating, tutorRating) {
  const sessionRef = doc(db, 'sessions', sessionID);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) return;

  const sessionData = sessionSnap.data();

  if (typeof tutorRating === 'number' && sessionData.studentID) {
    await updateUserRating(sessionData.studentID, tutorRating);
  }

  if (typeof studentRating === 'number' && sessionData.tutorID) {
    await updateUserRating(sessionData.tutorID, studentRating);
  }

  await addDoc(ratingsRef, {
    sessionID,
    studentRating,
    tutorRating,
    createdAt: serverTimestamp()
  });
}

export async function getSessionById(sessionID) {
  const sessionRef = doc(db, 'sessions', sessionID);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) return null;
  return { id: sessionSnap.id, ...sessionSnap.data() };
}

export async function getSessionsForUser(userId) {
  const byStudent = await getDocs(query(sessionsRef, where('studentID', '==', userId)));
  const byTutor = await getDocs(query(sessionsRef, where('tutorID', '==', userId)));
  const map = new Map();
  [...byStudent.docs, ...byTutor.docs].forEach((docSnap) => {
    map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
  });
  return [...map.values()];
}

export async function getAllSessions() {
  const snapshots = await getDocs(sessionsRef);
  return snapshots.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
