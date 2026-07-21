import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
enableMultiTabIndexedDbPersistence(db).catch((err) => console.warn("Offline persistence notice:", err.code));

// Get campus name from URL parameter
const urlParams = new URLSearchParams(window.location.search);
let targetCampus = urlParams.get('name') || urlParams.get('id') || 'MSA UKKUDA';
targetCampus = decodeURIComponent(targetCampus).trim();

// Normalize for text matching
function normalize(str) {
    return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Update DOM Hero Info
const campusTitle = document.getElementById('campusTitle');
const campusBadge = document.getElementById('campusBadge');
const campusDescription = document.getElementById('campusDescription');

if (campusTitle) campusTitle.innerText = targetCampus;
if (campusBadge) {
    if (targetCampus.toLowerCase().includes('ukkuda')) {
        campusBadge.innerHTML = '🏛️ HEADQUARTERS &amp; MAIN CAMPUS';
    } else {
        campusBadge.innerHTML = `🏛️ OFFICIAL CAMPUS - ${targetCampus.toUpperCase()}`;
    }
}
if (campusDescription) {
    campusDescription.innerText = `Official portal section for ${targetCampus}. Explore assigned Mudarriseen, enrolled students, honours, and campus life media.`;
}

// ----------------------------------------------------
// Tab Switcher Logic
// ----------------------------------------------------
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const activePane = document.getElementById(targetTab);
        if (activePane) activePane.classList.add('active');
    });
});

// ----------------------------------------------------
// 1. Fetch Assigned Mudarriseen (Faculty) & Students
// ----------------------------------------------------
const facultyGrid = document.getElementById('facultyGrid');
const studentsTableBody = document.getElementById('studentsTableBody');
const statMudarriseen = document.getElementById('statMudarriseen');
const statStudents = document.getElementById('statStudents');

onSnapshot(collection(db, "users"), (snapshot) => {
    const allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Target Campus Matcher
    const matchesTargetCampus = (user) => {
        const c1 = normalize(user.campus);
        const c2 = normalize(user.campusId);
        const target = normalize(targetCampus);
        return c1.includes(target) || target.includes(c1) || c2.includes(target) || target.includes(c2);
    };

    // Filter Faculty
    const facultyList = allUsers.filter(u => u.role === 'faculty' && matchesTargetCampus(u));
    if (statMudarriseen) statMudarriseen.innerText = facultyList.length;

    if (facultyGrid) {
        if (facultyList.length === 0) {
            facultyGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: var(--surface); border-radius: 16px; border: 1px solid var(--border);">
                    <p style="font-size: 1.1rem; color: var(--text-dim);">No Mudarriseen assigned to ${targetCampus} yet.</p>
                    <p style="font-size: 0.85rem; color: var(--text-dim); margin-top: 0.5rem;">The Admin can assign faculty members in the Admin Portal.</p>
                </div>
            `;
        } else {
            facultyGrid.innerHTML = '';
            facultyList.forEach(f => {
                const initial = (f.fullName || 'M')[0].toUpperCase();
                facultyGrid.innerHTML += `
                    <div class="faculty-card">
                        <div class="faculty-avatar">${initial}</div>
                        <div class="faculty-info">
                            <h4>${f.fullName || 'Mudarris'}</h4>
                            <p>${f.email || 'Email not listed'}</p>
                            <p>${f.phone ? '📞 ' + f.phone : 'Faculty Member'}</p>
                            <span class="badge-role">Mudarris / Faculty</span>
                        </div>
                    </div>
                `;
            });
        }
    }

    // Filter Students (ONLY show admitted and accepted students)
    const isAdmittedOrAccepted = (status) => {
        const s = String(status || '').toLowerCase().trim();
        return s === 'admitted' || s === 'accepted' || s === 'approved';
    };

    const studentList = allUsers.filter(u => 
        (u.role === 'student' || u.rollNumber) && 
        isAdmittedOrAccepted(u.status) && 
        matchesTargetCampus(u)
    );

    // Sort by Roll Number (numerical & alphabetical)
    studentList.sort((a, b) => {
        const rollA = (a.rollNumber || '').toString().trim();
        const rollB = (b.rollNumber || '').toString().trim();
        return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });

    if (statStudents) statStudents.innerText = studentList.length;

    if (studentsTableBody) {
        if (studentList.length === 0) {
            studentsTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 2rem;">No enrolled students registered under ${targetCampus} yet.</td></tr>`;
        } else {
            studentsTableBody.innerHTML = '';
            studentList.forEach(s => {
                const statBadge = `<span style="color:var(--success); font-weight:bold; text-transform:uppercase; font-size:0.8rem;">Admitted</span>`;

                studentsTableBody.innerHTML += `
                    <tr>
                        <td><strong>${s.rollNumber || 'N/A'}</strong></td>
                        <td>${s.fullName || 'Unnamed Student'}</td>
                        <td>${s.batch || 'General Batch'}</td>
                        <td>${statBadge}</td>
                    </tr>
                `;
            });
        }
    }
});

// ----------------------------------------------------
// 2. Fetch Campus Achievements & Honors
// ----------------------------------------------------
const achievementsGrid = document.getElementById('achievementsGrid');
const statAchievements = document.getElementById('statAchievements');

onSnapshot(collection(db, "achievements"), (snapshot) => {
    const allAchievements = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const campusAchievements = allAchievements.filter(ach => {
        if (!ach.campus) return true; // Show general achievements
        const target = normalize(targetCampus);
        const achCamp = normalize(ach.campus);
        return achCamp.includes(target) || target.includes(achCamp);
    });

    if (statAchievements) statAchievements.innerText = campusAchievements.length;

    if (achievementsGrid) {
        if (campusAchievements.length === 0) {
            achievementsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: var(--surface); border-radius: 16px; border: 1px solid var(--border);">
                    <p style="font-size: 1.1rem; color: var(--text-dim);">No honours/achievements published for ${targetCampus} yet.</p>
                </div>
            `;
        } else {
            achievementsGrid.innerHTML = '';
            campusAchievements.forEach(ach => {
                achievementsGrid.innerHTML += `
                    <div class="achievement-card">
                        ${ach.photoUrl ? `<img src="${ach.photoUrl}" alt="${ach.title || 'Achievement'}">` : ''}
                        <div class="achievement-card-body">
                            <span style="font-size: 0.75rem; color: var(--primary); font-weight: 700;">🏆 HONOUR</span>
                            <h4>${ach.title || 'Student Achievement'}</h4>
                            <p style="font-size: 0.85rem; color: var(--text-dim);">${ach.studentName ? 'Awarded to: ' + ach.studentName : ''}</p>
                            ${ach.description ? `<p style="font-size: 0.85rem; margin-top: 0.5rem; color: var(--text-main);">${ach.description}</p>` : ''}
                        </div>
                    </div>
                `;
            });
        }
    }
});

// ----------------------------------------------------
// 3. Fetch Campus Gallery & Media
// ----------------------------------------------------
const galleryGrid = document.getElementById('galleryGrid');

onSnapshot(collection(db, "gallery"), (snapshot) => {
    const allPhotos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const campusPhotos = allPhotos.filter(img => {
        if (!img.campus) return true;
        const target = normalize(targetCampus);
        const imgCamp = normalize(img.campus);
        return imgCamp.includes(target) || target.includes(imgCamp);
    });

    if (galleryGrid) {
        if (campusPhotos.length === 0) {
            galleryGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: var(--surface); border-radius: 16px; border: 1px solid var(--border);">
                    <p style="font-size: 1.1rem; color: var(--text-dim);">No photo media uploaded for ${targetCampus} yet.</p>
                </div>
            `;
        } else {
            galleryGrid.innerHTML = '';
            campusPhotos.forEach(img => {
                galleryGrid.innerHTML += `
                    <div class="achievement-card">
                        <img src="${img.url}" alt="${img.title || 'Campus Photo'}" loading="lazy">
                        <div class="achievement-card-body" style="padding: 1rem;">
                            <h4 style="font-size: 0.95rem; margin: 0;">${img.title || 'Campus Memory'}</h4>
                            <span style="font-size: 0.75rem; color: var(--text-dim);">${img.category || 'Campus Life'}</span>
                        </div>
                    </div>
                `;
            });
        }
    }
});
