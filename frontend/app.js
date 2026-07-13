import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const form = document.getElementById('registration-form');
const message = document.getElementById('message');
const list = document.getElementById('registrations-list');

const registrationsRef = collection(db, 'registrations');
const registrationsQuery = query(registrationsRef, orderBy('createdAt', 'desc'), limit(10));

function setStatus(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? '#b91c1c' : '#0f766e';
}

function renderRegistrations(items) {
  list.innerHTML = '';

  if (!items.length) {
    list.innerHTML = '<li>No registrations yet.</li>';
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    const createdAt = item.createdAt?.toDate ? item.createdAt.toDate() : new Date();
    li.textContent = `${item.name} — ${item.email} (${createdAt.toLocaleString()})`;
    list.appendChild(li);
  });
}

onSnapshot(
  registrationsQuery,
  (snapshot) => {
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderRegistrations(items);
  },
  (error) => {
    console.error('Unable to load registrations:', error);
    list.innerHTML = '<li>Unable to load registrations.</li>';
  }
);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Saving...');

  const payload = {
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim()
  };

  if (!payload.name || !payload.email) {
    setStatus('Please enter your name and email.', true);
    return;
  }

  try {
    await addDoc(registrationsRef, {
      ...payload,
      createdAt: serverTimestamp()
    });

    setStatus('Saved successfully.');
    form.reset();
  } catch (error) {
    console.error('Unable to save registration:', error);
    setStatus('Unable to save registration.', true);
  }
});
