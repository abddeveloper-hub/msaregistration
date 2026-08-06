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

// Update DOM Hero & Overview Info
const campusTitle = document.getElementById('campusTitle');
const campusBadge = document.getElementById('campusBadge');
const campusDescription = document.getElementById('campusDescription');
const campusSelectDropdown = document.getElementById('campusSelectDropdown');
const overviewName = document.getElementById('overviewName');
const overviewLocation = document.getElementById('overviewLocation');
const overviewType = document.getElementById('overviewType');

function updateCampusHeroInfo(name) {
    if (campusTitle) campusTitle.innerText = name;
    if (overviewName) overviewName.innerText = name;

    const isHQ = name.toLowerCase().includes('ukkuda');
    if (campusBadge) {
        campusBadge.innerHTML = isHQ ? '🏛️ HEADQUARTERS &amp; MAIN CAMPUS' : `🏛️ OFFICIAL CAMPUS - ${name.toUpperCase()}`;
    }
    if (campusDescription) {
        campusDescription.innerText = `Official portal section for ${name}. Explore campus details, enrolled students, honours, and media gallery.`;
    }

    if (overviewType) {
        overviewType.innerText = isHQ ? 'Headquarters & Central Seat' : 'Regional Branch Campus';
    }

    if (overviewLocation) {
        if (name.includes('UKKUDA') || name.includes('BAJAL')) {
            overviewLocation.innerText = 'Mangalore Region, Dakshina Kannada';
        } else if (name.includes('UJIRE')) {
            overviewLocation.innerText = 'Belthangady / Ujire Region, Dakshina Kannada';
        } else if (name.includes('GOLIYANGADI') || name.includes('RENJA') || name.includes('KULIYOORPADAVU') || name.includes('SHEKMALE') || name.includes('KOPPA')) {
            overviewLocation.innerText = 'Puttur / Sullia Region, Dakshina Kannada';
        } else {
            overviewLocation.innerText = 'Bantwal Region, Dakshina Kannada';
        }
    }
}

updateCampusHeroInfo(targetCampus);

// Sync Dropdown Selection
if (campusSelectDropdown) {
    for (let opt of campusSelectDropdown.options) {
        if (normalize(opt.value) === normalize(targetCampus)) {
            opt.selected = true;
            break;
        }
    }

    campusSelectDropdown.addEventListener('change', (e) => {
        const newCampus = e.target.value;
        window.location.href = `campus.html?name=${encodeURIComponent(newCampus)}`;
    });
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

// Grab DOM references
const studentsTableBody = document.getElementById('studentsTableBody');
const statStudents = document.getElementById('statStudents');
const studentSearchInput = document.getElementById('studentSearch');
const batchFilterSelect = document.getElementById('batchFilter');
const resultsCountEl = document.getElementById('resultsCount');

// Store full student list for client-side filtering
let allStudentData = [];

// Highlight matched text
function highlight(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(text).replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

// Render the filtered student table
function renderStudents() {
    const query = (studentSearchInput?.value || '').toLowerCase().trim();
    const batchFilter = (batchFilterSelect?.value || '').toLowerCase().trim();

    const filtered = allStudentData.filter(s => {
        const name = (s.fullName || '').toLowerCase();
        const roll = (s.rollNumber || '').toString().toLowerCase();
        const batch = (s.batch || '').toLowerCase();

        const matchesSearch = !query || name.includes(query) || roll.includes(query);
        const matchesBatch = !batchFilter || batch === batchFilter;
        return matchesSearch && matchesBatch;
    });

    if (resultsCountEl) {
        if (query || batchFilter) {
            resultsCountEl.innerHTML = `<strong>${filtered.length}</strong> of ${allStudentData.length} students`;
        } else {
            resultsCountEl.innerHTML = '';
        }
    }

    if (!studentsTableBody) return;

    if (filtered.length === 0) {
        studentsTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-dim); padding:2rem;">
            ${query || batchFilter ? `No students match your search.` : `No enrolled students registered under ${targetCampus} yet.`}
        </td></tr>`;
        return;
    }

    studentsTableBody.innerHTML = '';
    filtered.forEach(s => {
        const roll = s.rollNumber || 'N/A';
        const name = s.fullName || 'Unnamed Student';
        const batch = s.batch || 'General Batch';
        const statBadge = `<span style="color:var(--success); font-weight:bold; text-transform:uppercase; font-size:0.8rem;">Admitted</span>`;
        studentsTableBody.innerHTML += `
            <tr>
                <td><strong>${highlight(roll, query)}</strong></td>
                <td>${highlight(name, query)}</td>
                <td>${batch}</td>
                <td>${statBadge}</td>
            </tr>
        `;
    });
}

// Attach live event listeners
if (studentSearchInput) studentSearchInput.addEventListener('input', renderStudents);
if (batchFilterSelect) batchFilterSelect.addEventListener('change', renderStudents);

onSnapshot(collection(db, "users"), (snapshot) => {
    const allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // Target Campus Matcher
    const matchesTargetCampus = (user) => {
        const c1 = normalize(user.campus);
        const c2 = normalize(user.campusId);
        const target = normalize(targetCampus);
        return c1.includes(target) || target.includes(c1) || c2.includes(target) || target.includes(c2);
    };

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

    // Sort by Roll Number
    studentList.sort((a, b) => {
        const rollA = (a.rollNumber || '').toString().trim();
        const rollB = (b.rollNumber || '').toString().trim();
        return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });

    if (statStudents) statStudents.innerText = studentList.length;

    // Store data globally for filtering
    allStudentData = studentList;

    // Populate batch dropdown (unique batches)
    if (batchFilterSelect) {
        const batches = [...new Set(studentList.map(s => s.batch).filter(Boolean))].sort();
        const currentVal = batchFilterSelect.value;
        batchFilterSelect.innerHTML = '<option value="">All Batches</option>';
        batches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.toLowerCase();
            opt.textContent = b;
            if (b.toLowerCase() === currentVal) opt.selected = true;
            batchFilterSelect.appendChild(opt);
        });
    }

    // Render the table
    renderStudents();
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
