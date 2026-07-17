import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, onSnapshot, addDoc, setDoc, getDocs, deleteDoc, enableMultiTabIndexedDbPersistence, query as fsQuery, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
enableMultiTabIndexedDbPersistence(db).catch((err) => console.warn("Offline persistence error:", err.code));

const banner = document.getElementById('globalAnnouncementBanner');
const textEl = document.getElementById('globalAnnouncementText');
if (banner && textEl) {
    onSnapshot(doc(db, "settings", "announcements"), (docSnap) => {
        if (docSnap.exists() && docSnap.data().active && docSnap.data().text) {
            textEl.innerHTML = docSnap.data().text;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
    });
}

// Secondary Auth App for creating users without logging out
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

// DOM Elements
const adminLoginView = document.getElementById('adminLoginView');
const adminDashboardView = document.getElementById('adminDashboardView');
const adminNav = document.getElementById('adminNav');
const logoutBtn = document.getElementById('logoutBtn');

let allUsers = [];
let allInstitutions = [];

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function recordMatchesInstitution(record, institution) {
    if (!record || !institution) return false;
    return (record.campusId && record.campusId === institution.id) ||
        (record.campus && record.campus === institution.id) ||
        normalizeText(record.campus) === normalizeText(institution.name);
}

function getRecordCampusName(record) {
    if (!record) return 'None';
    const institution = allInstitutions.find(inst => recordMatchesInstitution(record, inst));
    return institution?.name || record.campus || record.campusId || 'None';
}

function isStudentApplication(record) {
    if (!record || (record.role && record.role !== 'student')) return false;
    const status = normalizeText(record.status);
    return Boolean(record.parentUid || record.campus || record.campusId || ['pending', 'admitted', 'rejected'].includes(status));
}

// Auth State
let adminDocUnsub = null;
onAuthStateChanged(auth, (user) => {
    const splash = document.getElementById("appSplashScreen");
    if (splash) splash.classList.add("hidden");

    if (adminDocUnsub) {
        adminDocUnsub();
        adminDocUnsub = null;
    }

    if (user) {
        adminDocUnsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.role !== 'admin') {
                    // Logged in but not an admin, sign out and show error
                    signOut(auth);
                    alert("Unauthorized. This account is not an administrator.");
                    window.location.href = "index.html";
                } else {
                    adminLoginView.classList.add('hidden');
                    adminDashboardView.classList.remove('hidden');
                    initAdminData();
                }
            } else {
                // User logged in but no profile doc yet
                signOut(auth);
                alert("Unauthorized. Profile record missing.");
                window.location.href = "index.html";
            }
        }, (error) => {
            console.error("Admin check failed:", error);
            signOut(auth);
            window.location.href = "index.html";
        });
    } else {
        // Not logged in
        adminDashboardView.classList.add('hidden');
        adminLoginView.classList.remove('hidden');
    }
});

// Admin Login Logic
const adminLoginForm = document.getElementById('adminLoginForm');
if(adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('adminAuthEmail').value.trim();
        const pass = document.getElementById('adminAuthPass').value;
        const err = document.getElementById('adminLoginError');
        const btn = document.getElementById('adminLoginBtn');
        
        err.style.display = 'none';
        btn.disabled = true;
        btn.innerText = "Authenticating...";
        
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            // onAuthStateChanged will handle the rest
        } catch (error) {
            err.innerText = error.message;
            err.style.display = 'block';
            btn.disabled = false;
            btn.innerText = "Authenticate";
        }
    });
}

if(logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));
if(document.getElementById('downloadGlobalStudentListBtn')) {
    document.getElementById('downloadGlobalStudentListBtn').addEventListener('click', () => {
        const students = allUsers.filter(isStudentApplication);
        if (students.length === 0) return alert("No students to download.");

        let csv = "Roll Number,Full Name,Phone,Campus,Batch,Status\n";
        students.forEach(s => {
            csv += `"${s.rollNumber || 'N/A'}","${s.fullName || 'Unnamed'}","${s.phone || 'N/A'}","${getRecordCampusName(s)}","${s.batch || 'N/A'}","${s.status || 'pending'}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `Global_Student_Directory_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
}

// UI Navigation
if(adminNav) {
    const navItems = adminNav.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            document.querySelectorAll('.admin-section').forEach(sec => sec.classList.add('hidden'));
            document.getElementById(targetId).classList.remove('hidden');
        });
    });
}

function initAdminData() {
    try {
        onSnapshot(collection(db, "users"), (snapshot) => {
            try {
                allUsers = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                // Legacy support: users without a role are considered students
                allUsers.forEach(u => {
                    if (!u.role) u.role = 'student';
                });
                updateStats();
                renderPendingFaculty();
                renderGlobalStudents();
                renderProgressOverview();
                renderActiveFaculties();
            } catch(e) { console.error("Error rendering users:", e); }
        });

        onSnapshot(collection(db, "institutions"), (snapshot) => {
            try {
                allInstitutions = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                if(document.getElementById('statTotInst')) document.getElementById('statTotInst').innerText = allInstitutions.length;
                renderInstitutions();
                renderProgressOverview();
                renderPendingFaculty(); 
                renderActiveFaculties();
            } catch(e) { console.error("Error rendering institutions:", e); }
        });
    } catch(e) { console.error("Error attaching listeners:", e); }
}

// Render Active Faculties in the new Faculties section
function renderActiveFaculties() {
    const tbody = document.getElementById('activeFacTableBody');
    if(!tbody) return;
    const faculties = allUsers.filter(u => u.role === 'faculty');
    tbody.innerHTML = '';
    if(faculties.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No faculties found.</td></tr>';
        return;
    }
    faculties.forEach(f => {
        let statusBadge = `<span class="badge" style="background:rgba(255,255,255,0.1);">${f.status || 'unsubmitted'}</span>`;
        if (f.status === 'admitted') statusBadge = `<span class="badge" style="background:var(--success-glow); color:var(--success);">Active</span>`;
        if (f.status === 'pending') statusBadge = `<span class="badge" style="background:var(--primary-glow); color:var(--primary);">Pending Profile</span>`;

        tbody.innerHTML += `<tr>
            <td>${f.fullName || 'N/A'}</td>
            <td>${f.email || 'N/A'}</td>
            <td>${getRecordCampusName(f)}</td>
            <td>${statusBadge}</td>
            <td><button class="action-btn btn-reject" onclick="deleteRecord('users', '${f.id}')">Delete</button></td>
        </tr>`;
    });
}
// 1. STATS & OVERVIEW
function updateStats() {
    const students = allUsers.filter(isStudentApplication);
    const faculty = allUsers.filter(u => u.role === 'faculty' && u.status === 'admitted');
    
    document.getElementById('statTotStudents').innerText = students.length;
    document.getElementById('statTotFaculty').innerText = faculty.length;
    
    const sayyids = students.filter(s => s.isSayyid === 'yes').length;
    const hafizs = students.filter(s => s.isHafiz === 'yes').length;
    const orphans = students.filter(s => s.isOrphan === 'yes').length;

    if(document.getElementById('statSayyids')) document.getElementById('statSayyids').innerText = sayyids;
    if(document.getElementById('statHafizs')) document.getElementById('statHafizs').innerText = hafizs;
    if(document.getElementById('statOrphans')) document.getElementById('statOrphans').innerText = orphans;

    if (!window.chartInstances) window.chartInstances = {};

    Chart.defaults.color = '#a0a0b0';
    Chart.defaults.font.family = 'Inter, sans-serif';

    // 1. Demographics Breakdown (Pie Chart)
    const ctxDemographics = document.getElementById('chartDemographics');
    if (ctxDemographics) {
        if (window.chartInstances.demo) window.chartInstances.demo.destroy();
        const general = students.length - sayyids - hafizs - orphans;
        window.chartInstances.demo = new Chart(ctxDemographics, {
            type: 'pie',
            data: {
                labels: ['General', 'Sayyids', 'Hafizs', 'Orphans'],
                datasets: [{
                    data: [Math.max(0, general), sayyids, hafizs, orphans],
                    backgroundColor: ['rgba(255, 255, 255, 0.1)', 'rgba(216, 173, 74, 0.9)', 'rgba(54, 193, 144, 0.9)', 'rgba(235, 87, 87, 0.9)'],
                    borderWidth: 2,
                    borderColor: '#0a0a0f',
                    hoverOffset: 10
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#a0a0b0', padding: 20, font: { size: 12, family: 'Inter' } } },
                    tooltip: { backgroundColor: 'rgba(10, 10, 15, 0.9)', titleColor: '#d8ad4a', bodyColor: '#fff', padding: 12, cornerRadius: 8, borderColor: 'rgba(216, 173, 74, 0.3)', borderWidth: 1 }
                },
                animation: { animateScale: true, animateRotate: true, duration: 1500, easing: 'easeOutQuart' }
            }
        });
    }

    // 2. Institution Distribution (Doughnut Chart)
    const ctxInst = document.getElementById('chartInstitutions');
    if (ctxInst) {
        if (window.chartInstances.inst) window.chartInstances.inst.destroy();
        
        const instCounts = {};
        students.forEach(s => {
            const campus = getRecordCampusName(s);
            instCounts[campus] = (instCounts[campus] || 0) + 1;
        });

        window.chartInstances.inst = new Chart(ctxInst, {
            type: 'doughnut',
            data: {
                labels: Object.keys(instCounts),
                datasets: [{
                    data: Object.values(instCounts),
                    backgroundColor: ['#d8ad4a', '#36c190', '#eb5757', '#2f80ed', '#9b51e0', '#f2c94c'],
                    borderWidth: 2,
                    borderColor: '#0a0a0f',
                    hoverOffset: 10
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#a0a0b0', padding: 20, font: { size: 12, family: 'Inter' } } },
                    tooltip: { backgroundColor: 'rgba(10, 10, 15, 0.9)', titleColor: '#36c190', bodyColor: '#fff', padding: 12, cornerRadius: 8, borderColor: 'rgba(54, 193, 144, 0.3)', borderWidth: 1 }
                },
                animation: { animateScale: true, animateRotate: true, duration: 1500, easing: 'easeOutQuart' }
            }
        });
    }

    // 3. Registration Trends (Line Chart)
    const ctxTrends = document.getElementById('chartTrends');
    if (ctxTrends) {
        if (window.chartInstances.trends) window.chartInstances.trends.destroy();
        
        const trendData = {};
        students.forEach(s => {
            let dateStr = "Unknown";
            if (s.createdAt) {
                const date = s.createdAt.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
                if (!isNaN(date)) dateStr = date.toLocaleDateString();
            }
            trendData[dateStr] = (trendData[dateStr] || 0) + 1;
        });
        
        const sortedDates = Object.keys(trendData).sort((a,b) => new Date(a) - new Date(b));
        const sortedCounts = sortedDates.map(d => trendData[d]);

        let gradient = null;
        if(ctxTrends.getContext) {
            const ctx = ctxTrends.getContext('2d');
            gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(54, 193, 144, 0.6)');
            gradient.addColorStop(1, 'rgba(54, 193, 144, 0.05)');
        }

        window.chartInstances.trends = new Chart(ctxTrends, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: [{
                    label: 'Registrations',
                    data: sortedCounts,
                    borderColor: '#36c190',
                    backgroundColor: gradient || 'rgba(54, 193, 144, 0.2)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#121212',
                    pointBorderColor: '#36c190',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: 'rgba(10, 10, 15, 0.9)', titleColor: '#fff', bodyColor: '#36c190', padding: 12, cornerRadius: 8, borderColor: 'rgba(54, 193, 144, 0.3)', borderWidth: 1 }
                },
                scales: { 
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { color: '#a0a0b0' } }, 
                    x: { grid: { display: false }, ticks: { color: '#a0a0b0', maxRotation: 45, minRotation: 45 } } 
                },
                animation: { duration: 1500, easing: 'easeOutQuart' }
            }
        });
    }

    // 4. Faculty vs Students (Bar Chart)
    const ctxFS = document.getElementById('chartFacultyStudent');
    if (ctxFS) {
        if (window.chartInstances.fs) window.chartInstances.fs.destroy();
        
        const campuses = [...new Set(allInstitutions.map(i => i.name))];
        const studentData = campuses.map(c => students.filter(s => getRecordCampusName(s) === c).length);
        const facultyData = campuses.map(c => faculty.filter(f => getRecordCampusName(f) === c).length);

        window.chartInstances.fs = new Chart(ctxFS, {
            type: 'bar',
            data: {
                labels: campuses,
                datasets: [
                    { label: 'Students', data: studentData, backgroundColor: '#d8ad4a', borderRadius: 6 },
                    { label: 'Faculty', data: facultyData, backgroundColor: '#36c190', borderRadius: 6 }
                ]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { color: '#a0a0b0', padding: 15, font: { size: 12, family: 'Inter' } } },
                    tooltip: { backgroundColor: 'rgba(10, 10, 15, 0.9)', padding: 12, cornerRadius: 8, borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1 }
                },
                scales: { 
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, ticks: { color: '#a0a0b0' } }, 
                    x: { grid: { display: false }, ticks: { color: '#a0a0b0', maxRotation: 45, minRotation: 45 } } 
                },
                animation: { duration: 1500, easing: 'easeOutQuart' }
            }
        });
    }

    // 5. Global Academic Performance
    renderAcademicChart(students, allInstitutions);
}

async function renderAcademicChart(students, allInstitutions) {
    const ctxPerf = document.getElementById('chartAcademicPerf');
    if (!ctxPerf) return;
    if (window.chartInstances.perf) window.chartInstances.perf.destroy();

    // To prevent blocking, we'll map campuses to data but doing it efficiently
    // For a real large app, you'd aggregate this on the backend via Cloud Functions
    // Here we do a lightweight aggregation if possible or just mock/partial data
    
    // As fetching all marks for all students might be heavy, we will fetch for the first 50 students as a sample
    const sampleStudents = students.slice(0, 50);
    const campusData = {};
    allInstitutions.forEach(inst => {
        campusData[inst.name] = { totalMarks: 0, marksCount: 0, totalAtt: 0, attCount: 0 };
    });

    try {
        for (let s of sampleStudents) {
            const campus = getRecordCampusName(s);
            if (!campusData[campus]) campusData[campus] = { totalMarks: 0, marksCount: 0, totalAtt: 0, attCount: 0 };
            
            // Marks
            const marksSnap = await getDocs(limit(collection(db, `users/${s.id}/marks`), 5));
            marksSnap.forEach(m => {
                campusData[campus].totalMarks += parseFloat(m.data().percentage || 0);
                campusData[campus].marksCount++;
            });
            
            // Attendance
            const attSnap = await getDocs(limit(collection(db, `users/${s.id}/attendance`), 20));
            attSnap.forEach(a => {
                if(a.data().status === 'present') campusData[campus].totalAtt++;
                campusData[campus].attCount++;
            });
        }

        const labels = [];
        const marksAvg = [];
        const attAvg = [];

        Object.keys(campusData).forEach(c => {
            const data = campusData[c];
            if (data.marksCount > 0 || data.attCount > 0) {
                labels.push(c);
                marksAvg.push(data.marksCount > 0 ? (data.totalMarks / data.marksCount) : 0);
                attAvg.push(data.attCount > 0 ? ((data.totalAtt / data.attCount) * 100) : 0);
            }
        });

        window.chartInstances.perf = new Chart(ctxPerf, {
            type: 'radar',
            data: {
                labels: labels.length ? labels : ['Sample Inst A', 'Sample Inst B'],
                datasets: [
                    {
                        label: 'Average Marks (%)',
                        data: marksAvg.length ? marksAvg : [0, 0],
                        backgroundColor: 'rgba(54, 193, 144, 0.2)',
                        borderColor: '#36c190',
                        pointBackgroundColor: '#36c190',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#36c190'
                    },
                    {
                        label: 'Attendance (%)',
                        data: attAvg.length ? attAvg : [0, 0],
                        backgroundColor: 'rgba(216, 173, 74, 0.2)',
                        borderColor: '#d8ad4a',
                        pointBackgroundColor: '#d8ad4a',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#d8ad4a'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255,255,255,0.1)' },
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        pointLabels: { color: '#a0a0b0', font: { family: 'Inter', size: 12 } },
                        ticks: { color: '#a0a0b0', backdropColor: 'transparent', min: 0, max: 100 }
                    }
                },
                plugins: {
                    legend: { position: 'top', labels: { color: '#a0a0b0', font: { family: 'Inter' } } },
                    tooltip: { backgroundColor: 'rgba(10, 10, 15, 0.9)', titleColor: '#fff', bodyColor: '#fff', padding: 12, cornerRadius: 8, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }
                }
            }
        });
    } catch(e) {
        console.warn("Chart Error:", e);
    }
}

function renderProgressOverview() {
    const tbody = document.getElementById('progressTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    if (allInstitutions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-dim);">No institutions added yet.</td></tr>';
        return;
    }
    allInstitutions.forEach(inst => {
        const enrolled = allUsers.filter(u => isStudentApplication(u) && recordMatchesInstitution(u, inst)).length;
        const assignedFacs = allUsers.filter(u => u.role === 'faculty' && recordMatchesInstitution(u, inst)).map(f => f.fullName || 'Unknown').join(', ');
        tbody.innerHTML += `<tr>
            <td><strong style="cursor:pointer; color:var(--primary); transition:opacity 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1" onclick="window.viewInstitutionDetails('${inst.id}')">${inst.name}</strong></td>
            <td>${enrolled}</td>
            <td style="font-size:0.8rem; color:var(--text-dim);">${assignedFacs || 'None'}</td>
        </tr>`;
    });
}

// 2. MANAGE INSTITUTIONS
function renderInstitutions() {
    const tbody = document.getElementById('instTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    if (allInstitutions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-dim);">No institutions added yet.</td></tr>';
        return;
    }
    allInstitutions.forEach(inst => {
        const assignedFacs = allUsers.filter(u => u.role === 'faculty' && recordMatchesInstitution(u, inst)).length;
        tbody.innerHTML += `<tr>
            <td>${inst.regNumber || 'N/A'}</td>
            <td><strong style="cursor:pointer; color:var(--primary); transition:opacity 0.2s;" onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1" onclick="window.viewInstitutionDetails('${inst.id}')">${inst.name}</strong></td>
            <td>${assignedFacs} Faculty</td>
            <td><button class="action-btn btn-reject" onclick="deleteRecord('institutions', '${inst.id}')">Delete</button></td>
        </tr>`;
    });
}

document.getElementById('addInstBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('instName').value.trim();
    const regNum = document.getElementById('instRegNum').value.trim();
    if(!name || !regNum) return alert("Fill all fields");
    try {
        await addDoc(collection(db, "institutions"), { name, regNumber: regNum });
        document.getElementById('instName').value = '';
        document.getElementById('instRegNum').value = '';
    } catch (e) { alert(e.message); }
});

window.viewInstitutionDetails = async (instId) => {
    const inst = allInstitutions.find(i => i.id === instId);
    if(!inst) return;

    document.getElementById('detailInstName').innerText = inst.name;
    document.getElementById('detailInstReg').innerText = inst.regNumber || 'N/A';

    const instStudents = allUsers.filter(u => isStudentApplication(u) && recordMatchesInstitution(u, inst));
    const instFaculty = allUsers.filter(u => u.role === 'faculty' && recordMatchesInstitution(u, inst));

    document.getElementById('detailInstTotalStudents').innerText = instStudents.length;
    document.getElementById('detailInstTotalFaculty').innerText = instFaculty.length;

    const pendingCount = instStudents.filter(s => s.status === 'pending').length;
    document.getElementById('detailInstPending').innerText = pendingCount;

    const sayyids = instStudents.filter(s => s.isSayyid === 'yes').length;
    const hafizs = instStudents.filter(s => s.isHafiz === 'yes').length;
    const orphans = instStudents.filter(s => s.isOrphan === 'yes').length;
    const specialCount = sayyids + hafizs + orphans;
    document.getElementById('detailInstSpecial').innerText = specialCount;

    // Populate Students
    const studentTbody = document.getElementById('detailInstStudentTableBody');
    studentTbody.innerHTML = '';
    
    // Sort students by roll number
    instStudents.sort((a, b) => {
        return (a.rollNumber || '').toString().localeCompare((b.rollNumber || '').toString(), undefined, { numeric: true });
    });

    if(instStudents.length === 0) {
        studentTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-dim);">No students enrolled here yet.</td></tr>';
    } else {
        instStudents.forEach(s => {
            const contact = s.email || s.parentPhone || 'N/A';
            const statusLabel = s.status === 'admitted' ? '<span class="status-badge" style="background:var(--success-dim); color:var(--success);">Admitted</span>' :
                              s.status === 'rejected' ? '<span class="status-badge" style="background:var(--danger-dim); color:var(--danger);">Rejected</span>' :
                              '<span class="status-badge" style="background:var(--warning-dim); color:var(--warning);">Pending</span>';
            
            let badges = '';
            if (s.isSayyid === 'yes') badges += '<span style="font-size:0.7rem; background:#d8ad4a; color:#121212; padding:2px 6px; border-radius:4px; margin-right:4px;">Sayyid</span>';
            if (s.isHafiz === 'yes') badges += '<span style="font-size:0.7rem; background:#36c190; color:#121212; padding:2px 6px; border-radius:4px; margin-right:4px;">Hafiz</span>';
            if (s.isOrphan === 'yes') badges += '<span style="font-size:0.7rem; background:#eb5757; color:#fff; padding:2px 6px; border-radius:4px; margin-right:4px;">Orphan</span>';

            studentTbody.innerHTML += `<tr>
                <td>${s.rollNumber || 'N/A'}</td>
                <td>
                    <strong>${s.fullName || 'Unknown'}</strong><br>
                    <span style="font-size:0.8rem; color:var(--text-dim);">${contact}</span><br>
                    <div style="margin-top:4px;">${badges}</div>
                </td>
                <td style="vertical-align:top;">${statusLabel}</td>
                <td style="vertical-align:top;">
                    <button class="action-btn btn-action" onclick="adminViewStudent('${s.id}')">View</button>
                </td>
            </tr>`;
        });
    }

    // Populate Faculty
    const facultyTbody = document.getElementById('detailInstFacultyTableBody');
    facultyTbody.innerHTML = '';

    if(instFaculty.length === 0) {
        facultyTbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:var(--text-dim);">No faculty assigned yet.</td></tr>';
    } else {
        instFaculty.forEach(f => {
            const contact = f.email || f.phone || 'N/A';
            const statusLabel = f.status === 'admitted' || f.status === 'active' ? '<span class="status-badge" style="background:var(--success-dim); color:var(--success);">Active</span>' :
                              '<span class="status-badge" style="background:var(--warning-dim); color:var(--warning);">Pending</span>';
            facultyTbody.innerHTML += `<tr>
                <td>
                    <strong>${f.fullName || 'Unknown'}</strong><br>
                    <span style="font-size:0.8rem; color:var(--text-dim);">${contact}</span>
                </td>
                <td style="vertical-align:top;">${statusLabel}</td>
                <td style="vertical-align:top;">
                    <button class="action-btn btn-action" onclick="adminViewFaculty('${f.id}')">View</button>
                </td>
            </tr>`;
        });
    }

    document.querySelectorAll('.admin-section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById('viewInstitutionDetail').classList.remove('hidden');
    document.querySelectorAll('#adminNav .nav-item').forEach(n => n.classList.remove('active'));
    const instNavItem = document.querySelector('#adminNav .nav-item[data-target="viewInstitutions"]');
    if (instNavItem) instNavItem.classList.add('active');
};





// 3. FACULTY MANAGEMENT
function renderPendingFaculty() {
    const pending = allUsers.filter(u => u.role === 'faculty' && u.status === 'pending');
    const tbody = document.getElementById('pendingFacTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    if(pending.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No pending faculty.</td></tr>'; return; }
    


    let instOptions = '<option value="" disabled selected>Select Campus to Assign</option>';
    allInstitutions.forEach(i => instOptions += `<option value="${i.id}">${i.name}</option>`);

    pending.forEach(f => {
        tbody.innerHTML += `<tr>
            <td>${f.fullName}</td>
            <td>${f.email}</td>
            <td>${f.phone}</td>
            <td style="display:flex; gap:0.5rem; align-items:center;">
                <select id="facCampus_${f.id}" class="input" style="padding:0.4rem; font-size:0.8rem; width:150px;">${instOptions}</select>
                <button class="action-btn btn-approve" onclick="approveFaculty('${f.id}')">Approve</button>
            </td>
        </tr>`;
    });
}

window.approveFaculty = async (uid) => {
    const campusId = document.getElementById(`facCampus_${uid}`).value;
    const campusName = allInstitutions.find(i => i.id === campusId)?.name;
    if(!campusId || !campusName) return alert("Please assign a campus first.");
    await setDoc(doc(db, "users", uid), { 
        status: 'admitted', 
        campus: campusName,
        campusId: campusId 
    }, { merge: true });
};

document.getElementById('directAddFacBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('newFacName').value;
    const email = document.getElementById('newFacEmail').value;
    const pass = document.getElementById('newFacPass').value;
    if(!name || !email || !pass) return alert("Fill all fields");
    
    try {
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
        await setDoc(doc(db, "users", userCred.user.uid), {
            uid: userCred.user.uid,
            email: email,
            fullName: name,
            role: 'faculty',
            status: 'unsubmitted'
        });
        signOut(secondaryAuth);
        alert("Faculty account created! They can now log in.");
        document.getElementById('newFacName').value = '';
        document.getElementById('newFacEmail').value = '';
        document.getElementById('newFacPass').value = '';
    } catch(e) { alert(e.message); }
});

// 4. GLOBAL STUDENTS
function renderGlobalStudents() {
    const students = allUsers.filter(isStudentApplication).sort((a, b) => {
        return (a.rollNumber || '').toString().localeCompare((b.rollNumber || '').toString(), undefined, { numeric: true });
    });
    const tbody = document.getElementById('globalStuTableBody');
    if(!tbody) return;
    
    const renderRows = (data) => {
        tbody.innerHTML = '';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No student applications found.</td></tr>';
            return;
        }
        data.forEach(s => {
            const statColor = s.status === 'admitted' ? 'color:var(--success)' : 'color:var(--accent)';
            tbody.innerHTML += `<tr>
                <td>${s.rollNumber || 'N/A'}</td>
                <td><strong>${s.fullName}</strong><br><span style="font-size:0.7rem;">${s.phone || ''}</span></td>
                <td>${getRecordCampusName(s)}</td>
                <td style="${statColor}; text-transform:uppercase; font-size:0.8rem; font-weight:bold;">${s.status || 'unsubmitted'}</td>
                <td style="display:flex; gap:0.5rem;">
                    <button class="action-btn btn-action" onclick="adminViewStudent('${s.id}')">View</button>
                    <button class="action-btn btn-reject" onclick="deleteRecord('users', '${s.id}')">Delete</button>
                </td>
            </tr>`;
        });
    };

    renderRows(students);

    const searchInput = document.getElementById('stuSearchInput');
    if(searchInput) searchInput.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        const filtered = students.filter(s => 
            (s.fullName && s.fullName.toLowerCase().includes(val)) || 
            (s.rollNumber && s.rollNumber.toLowerCase().includes(val)) ||
            (s.phone && s.phone.includes(val)) ||
            normalizeText(getRecordCampusName(s)).includes(val)
        );
        renderRows(filtered);
    };
}

window.adminViewStudent = async (uid) => {
    const s = allUsers.find(x => x.id === uid);
    if(!s) return;
    
    const modal = document.getElementById('adminStudentModal');
    const body = document.getElementById('adminModalBody');
    
    // Fetch marks and attendance inline for admin view
    let marksHtml = '';
    let attHtml = '';
    
    const mSnap = await getDocs(collection(db, `users/${uid}/marks`));
    let totalMarksPct = 0;
    let marksCount = 0;
    mSnap.forEach(d => { 
        const m = d.data(); 
        marksHtml += `<li>${m.subject}: ${m.percentage}% (${m.date})</li>`; 
        totalMarksPct += parseFloat(m.percentage || 0);
        marksCount++;
    });
    if(marksHtml === '') marksHtml = '<li style="color:var(--text-dim);">No marks recorded</li>';
    const marksAvg = marksCount > 0 ? Math.round(totalMarksPct / marksCount) : 0;

    const aSnap = await getDocs(collection(db, `users/${uid}/attendance`));
    let present=0, totalAtt=0;
    aSnap.forEach(d => { 
        totalAtt++;
        if(d.data().status==='present') present++; 
    });
    const attPct = totalAtt > 0 ? Math.round((present / totalAtt) * 100) : 0;

    body.innerHTML = `
        <div style="grid-column: span 2; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
            <div class="card" style="text-align: center; padding: 1.5rem; border: 1px solid var(--border); background: var(--glass-heavy);">
                <h4 style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-dim); margin-bottom: 0.5rem;">Attendance Record</h4>
                <div style="font-size: 2rem; font-weight: 800; color: var(--success);">${attPct}%</div>
                <p style="font-size: 0.8rem; margin-top: 0.5rem;">${present}/${totalAtt} sessions</p>
            </div>
            <div class="card" style="text-align: center; padding: 1.5rem; border: 1px solid var(--border); background: var(--glass-heavy);">
                <h4 style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-dim); margin-bottom: 0.5rem;">Marks Average</h4>
                <div style="font-size: 2rem; font-weight: 800; color: var(--primary);">${marksAvg}%</div>
                <p style="font-size: 0.8rem; margin-top: 0.5rem;">${marksCount} exams recorded</p>
            </div>
        </div>

        <div>
            <h3 style="color:var(--primary); margin-bottom:1rem;">Personal Profile</h3>
            <div style="display:flex; flex-direction:column; align-items:center; gap:1rem; margin-bottom:1.5rem;">
                <img src="${s.photoUrl || ''}" style="width:120px; height:120px; object-fit:cover; border-radius:1rem; background:var(--glass-heavy); border: 1px solid var(--border);" alt="Student Photo">
                <span class="status-badge" style="background: ${s.status === 'admitted' ? 'var(--success-dim)' : 'var(--warning-dim)'}; color: ${s.status === 'admitted' ? 'var(--success)' : 'var(--warning)'}; font-size: 0.85rem; padding: 0.3rem 1rem;">
                    ${(s.status || 'pending').toUpperCase()}
                </span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.95rem;">
                <div style="grid-column: span 2;"><strong style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px;">Full Name</strong><br><span style="font-size:1.05rem; color:var(--text-main);">${s.fullName || 'N/A'}</span></div>
                <div><strong style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px;">Phone</strong><br><span style="color:var(--text-main);">${s.phone || 'N/A'}</span></div>
                <div><strong style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px;">Date of Birth</strong><br><span style="color:var(--text-main);">${s.dob || 'N/A'}</span></div>
                <div><strong style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px;">Aadhar No.</strong><br><span style="color:var(--text-main);">${s.aadhar || 'N/A'}</span></div>
                <div style="grid-column: span 2;"><strong style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px;">Father's Details</strong><br><span style="color:var(--text-main);">${s.fatherName || 'N/A'} <span style="color:var(--text-dim);">(${s.fatherPhone || 'N/A'})</span></span></div>
                <div style="grid-column: span 2;"><strong style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.5px;">Address</strong><br><span style="color:var(--text-main);">${s.address || 'N/A'}</span></div>
            </div>
        </div>

        <div>
            <h3 style="color:var(--primary); margin-bottom:1rem;">Academic Info</h3>
            <p><strong>Roll Number:</strong> <span style="color:var(--accent); font-weight:bold;">${s.rollNumber || 'Pending'}</span></p>
            <p><strong>Campus:</strong> ${getRecordCampusName(s)}</p>
            <p><strong>Batch:</strong> ${s.batch || 'None'}</p>
            <p><strong>Schooling:</strong> ${s.schoolInfo?.level || 'N/A'}</p>
            
            <div class="form-section" style="padding:1rem; margin-top:2rem;">
                <h4 style="margin-bottom:0.5rem;">Exam Details</h4>
                <ul style="padding-left:1.5rem; font-size:0.9rem; max-height:150px; overflow-y:auto;">${marksHtml}</ul>
            </div>
        </div>
    `;

    const actions = document.getElementById('adminModalActions');
    if (actions) {
        let admitBtnHtml = s.status === 'pending' ? `<button class="btn btn-main" onclick="adminQuickAdmit('${s.id}')">Approve / Admit Student</button>` : '';
        actions.innerHTML = `
            <button class="btn btn-ghost" style="border:1px solid var(--primary); color:var(--primary);" onclick="openAdminEditStudent('${s.id}')">Edit Profile</button>
            ${admitBtnHtml}
        `;
    }

    modal.classList.add('active');
};

window.adminViewFaculty = async (uid) => {
    const f = allUsers.find(x => x.id === uid);
    if(!f) return;
    
    const modal = document.getElementById('adminStudentModal');
    const body = document.getElementById('adminModalBody');
    
    // Change modal title temporarily
    const titleEl = modal.querySelector('.view-title');
    if(titleEl) titleEl.innerText = "Faculty Full Report";

    body.innerHTML = `
        <div style="grid-column: span 2;">
            <h3 style="color:var(--primary); margin-bottom:1rem;">Faculty Profile</h3>
            <div style="display: flex; gap: 2rem; align-items: flex-start;">
                <img src="${f.photoUrl || ''}" style="width:120px; height:120px; object-fit:cover; border-radius:1rem; background:#333;" alt="No Photo">
                <div>
                    <p><strong>Name:</strong> ${f.fullName || 'N/A'}</p>
                    <p><strong>Email:</strong> ${f.email || 'N/A'}</p>
                    <p><strong>Phone:</strong> ${f.phone || 'N/A'}</p>
                    <p><strong>Status:</strong> <span style="text-transform:uppercase; font-weight:bold; color:var(--success);">${f.status || 'N/A'}</span></p>
                    <p><strong>Assigned Campus:</strong> ${getRecordCampusName(f)}</p>
                </div>
            </div>
        </div>
    `;

    const actions = document.getElementById('adminModalActions');
    if (actions) {
        actions.innerHTML = `
            <button class="action-btn btn-reject" onclick="deleteRecord('users', '${f.id}')" style="padding: 0.5rem 1rem;">Delete Faculty</button>
        `;
    }

    modal.classList.add('active');
    
    // Reset title when closed
    const closeBtn = modal.querySelector('.btn-ghost');
    if (closeBtn) {
        const oldOnClick = closeBtn.onclick;
        closeBtn.onclick = function(e) {
            if(titleEl) titleEl.innerText = "Student Full Report";
            if(oldOnClick) oldOnClick(e);
        };
    }
};

window.deleteEvent = async (id, title) => {
    if(confirm(`Are you sure you want to delete the event: ${title}?`)) {
        try {
            await deleteDoc(doc(db, 'calendarEvents', id));
            if(window.showToast) window.showToast("Event deleted");
        } catch(e) {
            console.error(e);
        }
    }
};

// ==========================================
// SECURITY LOGS LOGIC
// ==========================================
const securityLogsQuery = fsQuery(collection(db, 'securityLogs'), orderBy('timestamp', 'desc'), limit(50));
onSnapshot(securityLogsQuery, (snapshot) => {
    const tbody = document.getElementById('securityLogsBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    if(snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state-card"><div class="icon">🛡️</div><h3>No Logs Found</h3><p>Security audit logs will appear here when users log in.</p></div></td></tr>';
        return;
    }
    
    snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const dateStr = new Date(d.timestamp).toLocaleString();
        
        let deviceStr = d.userAgent || '';
        if(deviceStr.includes('iPhone')) deviceStr = '📱 iPhone';
        else if(deviceStr.includes('Android')) deviceStr = '📱 Android';
        else if(deviceStr.includes('Mac OS')) deviceStr = '💻 Mac';
        else if(deviceStr.includes('Windows')) deviceStr = '💻 Windows PC';
        else deviceStr = 'Unknown Device';
        
        tbody.innerHTML += `
            <tr>
                <td style="font-size:0.85rem; color:var(--text-dim);">${dateStr}</td>
                <td><strong>${escapeHtml(d.email || '')}</strong></td>
                <td><span style="text-transform:capitalize; color:var(--primary); font-weight:600;">${escapeHtml(d.role || '')}</span></td>
                <td><span style="font-family:monospace; background:var(--glass-heavy); padding:0.2rem 0.5rem; border-radius:4px; font-size:0.8rem;">${escapeHtml(d.ip || 'N/A')}</span></td>
                <td style="color:var(--text-dim); font-size:0.9rem;">${deviceStr}</td>
            </tr>
        `;
    });
});

window.adminQuickAdmit = async (uid) => {
    if(!confirm("Are you sure you want to admit this student?")) return;
    try {
        await updateDoc(doc(db, "users", uid), { status: 'admitted' });
        alert("Student admitted successfully!");
        document.getElementById('adminStudentModal').classList.remove('active');
    } catch(e) {
        alert("Error: " + e.message);
    }
};

window.openAdminEditStudent = (uid) => {
    const s = allUsers.find(x => x.id === uid);
    if(!s) return;
    
    // Populate campus options
    const campusSelect = document.getElementById('editStuCampus');
    campusSelect.innerHTML = '<option value="" disabled selected>Select Campus</option>';
    allInstitutions.forEach(i => {
        campusSelect.innerHTML += `<option value="${i.id}">${i.name}</option>`;
    });

    // Pre-fill form
    document.getElementById('editStuId').value = s.id;
    document.getElementById('editStuName').value = s.fullName || '';
    document.getElementById('editStuPhone').value = s.phone || '';
    document.getElementById('editStuDob').value = s.dob || '';
    document.getElementById('editStuStatus').value = s.status || 'pending';
    document.getElementById('editStuBatch').value = s.batch || '';
    
    // Select campus properly (handling legacy name or ID)
    const matchedInst = allInstitutions.find(inst => recordMatchesInstitution(s, inst));
    if (matchedInst) {
        campusSelect.value = matchedInst.id;
    }

    document.getElementById('adminStudentModal').classList.remove('active');
    document.getElementById('adminEditStudentModal').classList.add('active');
};

document.getElementById('adminEditStudentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = document.getElementById('editStuId').value;
    const campusSelect = document.getElementById('editStuCampus');
    const selectedCampusId = campusSelect.value;
    const selectedCampusName = campusSelect.options[campusSelect.selectedIndex]?.text || '';

    try {
        await updateDoc(doc(db, "users", uid), {
            fullName: document.getElementById('editStuName').value,
            phone: document.getElementById('editStuPhone').value,
            dob: document.getElementById('editStuDob').value,
            status: document.getElementById('editStuStatus').value,
            batch: document.getElementById('editStuBatch').value,
            campus: selectedCampusName,
            campusId: selectedCampusId
        });
        alert("Student profile updated successfully!");
        document.getElementById('adminEditStudentModal').classList.remove('active');
    } catch(err) {
        alert("Error updating profile: " + err.message);
    }
});

// 5. MANAGE ADMINS
document.getElementById('addAdminBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('newAdminEmail').value;
    const pass = document.getElementById('newAdminPass').value;
    if(!email || !pass) return alert("Fill all fields");
    
    try {
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
        await setDoc(doc(db, "users", userCred.user.uid), {
            uid: userCred.user.uid,
            email: email,
            role: 'admin'
        });
        signOut(secondaryAuth);
        alert("Admin account created!");
        document.getElementById('newAdminEmail').value = '';
        document.getElementById('newAdminPass').value = '';
    } catch(e) { alert(e.message); }
});

// 6. GLOBAL DELETE HANDLER
window.deleteRecord = async (col, id) => {
    let typeName = col;
    if(col === 'users') typeName = 'user';
    else if(col === 'institutions') typeName = 'institution';
    else if(col === 'gallery') typeName = 'photo';
    else if(col === 'videos') typeName = 'video program';
    if(!confirm(`Are you sure you want to permanently delete this ${typeName} record? This cannot be undone.`)) return;
    try {
        if (col === 'users') {
            // Delete associated subcollections to prevent orphaned data
            const subcollections = ['marks', 'attendance', 'remarks'];
            for (const sub of subcollections) {
                const subSnap = await getDocs(collection(db, `users/${id}/${sub}`));
                const deletePromises = subSnap.docs.map(d => deleteDoc(d.ref));
                await Promise.all(deletePromises);
            }
        }
        
        // Delete the main document
        await deleteDoc(doc(db, col, id));
        alert("Record and all associated data deleted successfully.");
    } catch(e) { 
        alert("Error deleting: " + e.message); 
        console.error("Delete Error:", e);
    }
};

// 7. ANNOUNCEMENTS MANAGER
const saveAnnouncementBtn = document.getElementById('saveAnnouncementBtn');
if (saveAnnouncementBtn) {
    // Load initial
    onSnapshot(doc(db, "settings", "announcements"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('adminAnnouncementText').value = data.text || '';
            document.getElementById('adminAnnouncementActive').checked = data.active || false;
        }
    });

    saveAnnouncementBtn.addEventListener('click', async () => {
        const text = document.getElementById('adminAnnouncementText').value;
        const active = document.getElementById('adminAnnouncementActive').checked;
        try {
            await setDoc(doc(db, "settings", "announcements"), { 
                text, 
                active,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            alert("Announcement saved successfully!");
        } catch(e) {
            alert("Error saving announcement: " + e.message);
        }
    });
}

const sendPushNotifBtn = document.getElementById('sendPushNotifBtn');
if (sendPushNotifBtn) {
    sendPushNotifBtn.addEventListener('click', async () => {
        const title = document.getElementById('pushNotifTitle').value.trim();
        const body = document.getElementById('pushNotifBody').value.trim();
        const msgEl = document.getElementById('pushNotifMsg');
        
        if (!title || !body) {
            msgEl.textContent = "Please provide both a title and body.";
            msgEl.style.color = "var(--error)";
            return;
        }

        sendPushNotifBtn.disabled = true;
        sendPushNotifBtn.textContent = "Sending...";

        try {
            await addDoc(collection(db, "notifications"), {
                title: title,
                body: body,
                timestamp: new Date().toISOString(),
                sentBy: auth.currentUser ? auth.currentUser.uid : 'admin'
            });
            msgEl.textContent = "Notification sent successfully!";
            msgEl.style.color = "var(--success)";
            document.getElementById('pushNotifTitle').value = '';
            document.getElementById('pushNotifBody').value = '';
        } catch(e) {
            msgEl.textContent = "Failed to send: " + e.message;
            msgEl.style.color = "var(--error)";
        } finally {
            sendPushNotifBtn.disabled = false;
            sendPushNotifBtn.textContent = "Send Notification";
        }
    });
}

// 8. GALLERY MANAGER
const galleryAdminGrid = document.getElementById('galleryAdminGrid');
if (galleryAdminGrid) {
    // Render Admin Gallery Grid
    onSnapshot(collection(db, "gallery"), (snap) => {
        galleryAdminGrid.innerHTML = '';
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const id = docSnap.id;
            const item = document.createElement('div');
            item.className = 'portal-card';
            item.style.padding = '0.5rem';
            item.innerHTML = `
                <img src="${data.image || data.imgUrl}" alt="${data.title}" style="width:100%; height:120px; object-fit:cover; border-radius:var(--radius-sm);">
                <div style="padding: 0.5rem 0;">
                    <h4 style="font-size:0.9rem;">${data.title}</h4>
                    <p style="font-size:0.75rem; color:var(--text-dim); margin-bottom:0.5rem;">${data.desc || ''}</p>
                    <div style="display:flex; justify-content:space-between;">
                        <button class="btn btn-ghost" style="color:var(--error); padding:0.5rem;" onclick="deleteRecord('gallery', '${id}')">Delete</button>
                    </div>
                </div>
            `;
            galleryAdminGrid.appendChild(item);
        });
    });

    const videoAdminGrid = document.getElementById('videoAdminGrid');
    if (videoAdminGrid) {
        onSnapshot(collection(db, "videos"), (snap) => {
            videoAdminGrid.innerHTML = '';
            snap.forEach(docSnap => {
                const data = docSnap.data();
                const id = docSnap.id;
                const item = document.createElement('div');
                item.className = 'portal-card';
                item.style.padding = '0.5rem';
                
                let mediaPreview = '';
                if (data.videoType === 'file' && data.fileUrl) {
                    mediaPreview = `<video src="${data.fileUrl}" style="width:100%; height:120px; object-fit:cover; border-radius:var(--radius-sm);" controls preload="metadata"></video>`;
                } else {
                    mediaPreview = `<img src="${data.thumbnail}" alt="${data.title}" style="width:100%; height:120px; object-fit:cover; border-radius:var(--radius-sm);">`;
                }

                item.innerHTML = `
                    ${mediaPreview}
                    <div style="padding: 0.5rem 0;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h4 style="font-size:0.9rem; margin:0;">${data.title}</h4>
                            <span class="badge" style="font-size:0.6rem; padding:0.1rem 0.3rem; background:var(--glass-border);">${data.category || 'N/A'}</span>
                        </div>
                        <p style="font-size:0.75rem; color:var(--text-dim); margin:0.3rem 0;">${data.speaker ? '🎤 ' + data.speaker : ''}</p>
                        <p style="font-size:0.75rem; color:var(--text-dim); margin:0 0 0.5rem 0;">${data.date ? '📅 ' + data.date : ''}</p>
                        <div style="display:flex; justify-content:space-between; margin-top:0.5rem;">
                            <button class="btn btn-ghost" style="color:var(--error); padding:0.5rem;" onclick="deleteRecord('videos', '${id}')">Delete</button>
                        </div>
                    </div>
                `;
                videoAdminGrid.appendChild(item);
            });
        });
    }
}

// Gallery Photo Upload Logic
const galleryUploadForm = document.getElementById('galleryUploadForm');
const galleryPhotoInput = document.getElementById('galleryPhotoInput');
const galleryPhotoPreview = document.getElementById('galleryPhotoPreview');
const galleryPhotoPreviewContainer = document.getElementById('galleryPhotoPreviewContainer');
const galleryUploadBtn = document.getElementById('galleryUploadBtn');
const galleryUploadMsg = document.getElementById('galleryUploadMsg');
const galleryPhotoTitle = document.getElementById('galleryPhotoTitle');
const galleryPhotoDesc = document.getElementById('galleryPhotoDesc');

let currentBase64Image = null;

if (galleryPhotoInput) {
    galleryPhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1200;
                    const MAX_HEIGHT = 1200;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const base64Str = canvas.toDataURL('image/jpeg', 0.8);
                    currentBase64Image = base64Str;
                    galleryPhotoPreview.src = base64Str;
                    galleryPhotoPreviewContainer.style.display = 'block';
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

if (galleryUploadForm) {
    galleryUploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentBase64Image) {
            galleryUploadMsg.textContent = "Please select a valid image.";
            galleryUploadMsg.style.color = "var(--error)";
            return;
        }
        
        const title = galleryPhotoTitle.value.trim();
        if (!title) return;
        
        const description = galleryPhotoDesc ? galleryPhotoDesc.value.trim() : "";
        const category = document.getElementById('galleryPhotoCategory') ? document.getElementById('galleryPhotoCategory').value : "Events";
        
        galleryUploadBtn.disabled = true;
        galleryUploadBtn.textContent = "Uploading...";
        galleryUploadMsg.textContent = "";
        
        try {
            await addDoc(collection(db, "gallery"), {
                title: title,
                description: description,
                category: category,
                url: currentBase64Image,
                uploadedBy: auth.currentUser ? auth.currentUser.uid : "admin",
                createdAt: new Date().toISOString()
            });
            
            galleryUploadMsg.textContent = "Photo uploaded successfully!";
            galleryUploadMsg.style.color = "var(--success)";
            galleryUploadForm.reset();
            galleryPhotoPreviewContainer.style.display = 'none';
            currentBase64Image = null;
            
            setTimeout(() => {
                galleryUploadMsg.textContent = "";
            }, 3000);
        } catch (error) {
            console.error("Gallery Upload Error:", error);
            galleryUploadMsg.textContent = "Failed to upload photo: " + error.message;
            galleryUploadMsg.style.color = "var(--error)";
        } finally {
            galleryUploadBtn.disabled = false;
            galleryUploadBtn.textContent = "Upload to Gallery";
        }
    });
}

// YouTube Video Upload Logic
const videoUploadForm = document.getElementById('videoUploadForm');
const videoTitle = document.getElementById('videoTitle');
const videoUrlInput = document.getElementById('videoUrlInput');
const videoFileInput = document.getElementById('videoFileInput');
const videoPreviewContainer = document.getElementById('videoPreviewContainer');
const videoThumbnailPreview = document.getElementById('videoThumbnailPreview');
const videoFilePreview = document.getElementById('videoFilePreview');
const videoUploadBtn = document.getElementById('videoUploadBtn');
const videoUploadMsg = document.getElementById('videoUploadMsg');

const videoSourceRadios = document.querySelectorAll('input[name="videoSource"]');
const youtubeInputGroup = document.getElementById('youtubeInputGroup');
const fileInputGroup = document.getElementById('fileInputGroup');
const driveInputGroup = document.getElementById('driveInputGroup');
const driveUrlInput = document.getElementById('driveUrlInput');

let currentVideoId = null;
let currentVideoSource = 'youtube';

if (videoSourceRadios.length > 0) {
    videoSourceRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentVideoSource = e.target.value;
            if (currentVideoSource === 'youtube') {
                youtubeInputGroup.style.display = 'block';
                fileInputGroup.style.display = 'none';
                driveInputGroup.style.display = 'none';
                if (currentVideoId) {
                    videoThumbnailPreview.style.display = 'block';
                    videoFilePreview.style.display = 'none';
                    videoPreviewContainer.style.display = 'block';
                } else {
                    videoPreviewContainer.style.display = 'none';
                }
            } else if (currentVideoSource === 'drive') {
                youtubeInputGroup.style.display = 'none';
                fileInputGroup.style.display = 'none';
                driveInputGroup.style.display = 'block';
                videoPreviewContainer.style.display = 'none';
            } else {
                youtubeInputGroup.style.display = 'none';
                fileInputGroup.style.display = 'block';
                driveInputGroup.style.display = 'none';
                if (videoFileInput.files.length > 0) {
                    videoFilePreview.style.display = 'block';
                    videoThumbnailPreview.style.display = 'none';
                    videoPreviewContainer.style.display = 'block';
                } else {
                    videoPreviewContainer.style.display = 'none';
                }
            }
        });
    });
}

function extractYouTubeID(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

if (videoUrlInput) {
    videoUrlInput.addEventListener('input', () => {
        if (currentVideoSource !== 'youtube') return;
        const url = videoUrlInput.value.trim();
        const videoId = extractYouTubeID(url);
        
        if (videoId) {
            currentVideoId = videoId;
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            videoThumbnailPreview.src = thumbnailUrl;
            videoThumbnailPreview.style.display = 'block';
            videoFilePreview.style.display = 'none';
            videoPreviewContainer.style.display = 'block';
        } else {
            currentVideoId = null;
            videoPreviewContainer.style.display = 'none';
        }
    });
}

if (videoFileInput) {
    videoFileInput.addEventListener('change', () => {
        if (currentVideoSource !== 'file') return;
        const file = videoFileInput.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            videoFilePreview.src = url;
            videoFilePreview.style.display = 'block';
            videoThumbnailPreview.style.display = 'none';
            videoPreviewContainer.style.display = 'block';
        } else {
            videoPreviewContainer.style.display = 'none';
        }
    });
}

if (videoUploadForm) {
    videoUploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = videoTitle.value.trim();
        const date = document.getElementById('videoDate').value;
        const category = document.getElementById('videoCategory').value;
        const speaker = document.getElementById('videoSpeaker').value.trim();
        const desc = document.getElementById('videoDesc').value.trim();
        
        if (!title) return;

        let videoData = {
            title: title,
            date: date,
            category: category,
            speaker: speaker,
            description: desc,
            uploadedBy: auth.currentUser ? auth.currentUser.uid : "admin",
            createdAt: new Date().toISOString()
        };
        
        videoUploadBtn.disabled = true;
        videoUploadBtn.textContent = "Uploading...";
        videoUploadMsg.textContent = "";
        
        try {
            if (currentVideoSource === 'youtube') {
                if (!currentVideoId) {
                    videoUploadMsg.textContent = "Please enter a valid YouTube link.";
                    videoUploadMsg.style.color = "var(--error)";
                    videoUploadBtn.disabled = false;
                    videoUploadBtn.textContent = "Add Video Program";
                    return;
                }
                const thumbnailUrl = `https://img.youtube.com/vi/${currentVideoId}/hqdefault.jpg`;
                videoData.videoType = "youtube";
                videoData.videoId = currentVideoId;
                videoData.thumbnail = thumbnailUrl;
                
                await addDoc(collection(db, "videos"), videoData);
                finishUpload();
            } else if (currentVideoSource === 'drive') {
                const driveUrl = driveUrlInput ? driveUrlInput.value.trim() : "";
                if (!driveUrl) {
                    videoUploadMsg.textContent = "Please enter a valid Google Drive link.";
                    videoUploadMsg.style.color = "var(--error)";
                    videoUploadBtn.disabled = false;
                    videoUploadBtn.textContent = "Add Video Program";
                    return;
                }
                // Extract file ID from google drive link: e.g. https://drive.google.com/file/d/1a2b3c4d5e/view
                const driveRegex = /\/d\/([a-zA-Z0-9_-]+)/;
                const match = driveUrl.match(driveRegex);
                const driveId = match ? match[1] : null;
                
                if (!driveId) {
                    videoUploadMsg.textContent = "Could not extract Google Drive File ID. Make sure it's a valid link.";
                    videoUploadMsg.style.color = "var(--error)";
                    videoUploadBtn.disabled = false;
                    videoUploadBtn.textContent = "Add Video Program";
                    return;
                }

                videoData.videoType = "drive";
                videoData.driveId = driveId;
                // No thumbnail for drive by default unless we use a placeholder icon
                videoData.thumbnail = "logo.png?v=2"; 

                await addDoc(collection(db, "videos"), videoData);
                finishUpload();
            } else if (currentVideoSource === 'file') {
                const file = videoFileInput.files[0];
                if (!file) {
                    videoUploadMsg.textContent = "Please select a video file.";
                    videoUploadMsg.style.color = "var(--error)";
                    videoUploadBtn.disabled = false;
                    videoUploadBtn.textContent = "Add Video Program";
                    return;
                }
                
                const timestamp = Date.now();
                const storageRef = ref(storage, `videos/${timestamp}_${file.name}`);
                
                const uploadTask = uploadBytesResumable(storageRef, file);
                uploadTask.on('state_changed', 
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        videoUploadBtn.textContent = `Uploading... ${Math.round(progress)}%`;
                    }, 
                    (error) => {
                        console.error("Firebase Storage Upload Error:", error);
                        videoUploadMsg.textContent = "Upload failed: " + error.message;
                        videoUploadMsg.style.color = "var(--error)";
                        videoUploadBtn.disabled = false;
                        videoUploadBtn.textContent = "Add Video Program";
                    },
                    async () => {
                        videoData.videoType = "file";
                        videoData.fileUrl = downloadURL;
                        await addDoc(collection(db, "videos"), videoData);
                        finishUpload();
                    }
                );
            }
            
            function finishUpload() {
                videoUploadMsg.textContent = "Program added successfully!";
                videoUploadMsg.style.color = "var(--success)";
                videoUploadForm.reset();
                videoPreviewContainer.style.display = 'none';
                currentVideoId = null;
                if (videoFilePreview) videoFilePreview.src = "";
                videoUploadBtn.disabled = false;
                videoUploadBtn.textContent = "Add Video Program";
                
                setTimeout(() => {
                    videoUploadMsg.textContent = "";
                }, 3000);
            }
        } catch (error) {
            console.error("Video Upload Error:", error);
            videoUploadMsg.textContent = "Failed to add program: " + error.message;
            videoUploadMsg.style.color = "var(--error)";
            videoUploadBtn.disabled = false;
            videoUploadBtn.textContent = "Add Video Program";
        }
    });
}


// ==========================================
// FEATURE 8: LIBRARY MANAGEMENT
// ==========================================
const libraryUploadForm = document.getElementById('libraryUploadForm');
const libraryTableBody = document.getElementById('libraryTableBody');
if (libraryUploadForm) {
    libraryUploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('libSubmitBtn');
        const msg = document.getElementById('libMsg');
        btn.disabled = true;
        btn.textContent = 'Uploading...';
        msg.textContent = '';
        
        try {
            const title = document.getElementById('libTitle').value;
            const type = document.getElementById('libType').value;
            const link = document.getElementById('libLink').value;
            const fileInput = document.getElementById('libFile');
            let finalUrl = link;
            
            if (type !== 'link' && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const storageRef = ref(storage, `library/${Date.now()}_${file.name}`);
                const uploadTask = await uploadBytesResumable(storageRef, file);
                finalUrl = await getDownloadURL(uploadTask.ref);
            }
            
            await addDoc(collection(db, 'library_resources'), {
                title,
                type,
                url: finalUrl,
                createdAt: new Date().toISOString()
            });
            
            msg.textContent = 'Resource added successfully!';
            msg.style.color = 'var(--success)';
            libraryUploadForm.reset();
        } catch (error) {
            msg.textContent = 'Error: ' + error.message;
            msg.style.color = 'var(--error)';
        }
        btn.disabled = false;
        btn.textContent = 'Upload Resource';
    });

    onSnapshot(collection(db, "library_resources"), (snapshot) => {
        if (!libraryTableBody) return;
        libraryTableBody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data.title}</td>
                <td style="text-transform: capitalize;">${data.type}</td>
                <td>${new Date(data.createdAt).toLocaleDateString()}</td>
                <td>
                    <a href="${data.url}" target="_blank" class="btn btn-outline btn-sm">View</a>
                    <button class="btn btn-outline btn-sm" onclick="deleteLibraryResource('${docSnap.id}')" style="color:var(--error); border-color:var(--error);">Delete</button>
                </td>
            `;
            libraryTableBody.appendChild(tr);
        });
    });
}
window.deleteLibraryResource = async (id) => {
    if(confirm('Delete this resource?')) {
        await deleteDoc(doc(db, 'library_resources', id));
    }
};

// ==========================================
// FEATURE 13: LIVE STREAMING
// ==========================================
const liveStreamForm = document.getElementById('liveStreamForm');
if (liveStreamForm) {
    const liveToggle = document.getElementById('liveToggle');
    const liveTitle = document.getElementById('liveTitle');
    const liveUrl = document.getElementById('liveUrl');
    
    onSnapshot(doc(db, 'settings', 'liveStream'), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            liveToggle.checked = data.isLive || false;
            liveTitle.value = data.title || '';
            liveUrl.value = data.url || '';
        }
    });

    liveStreamForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('liveSaveBtn');
        const msg = document.getElementById('liveMsg');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        
        try {
            await setDoc(doc(db, 'settings', 'liveStream'), {
                isLive: liveToggle.checked,
                title: liveTitle.value,
                url: liveUrl.value,
                updatedAt: new Date().toISOString()
            });
            msg.textContent = 'Settings saved!';
            msg.style.color = 'var(--success)';
        } catch(error) {
            msg.textContent = 'Error: ' + error.message;
            msg.style.color = 'var(--error)';
        }
        btn.disabled = false;
        btn.textContent = 'Save Settings';
        setTimeout(() => msg.textContent = '', 3000);
    });
}

// ==========================================
// FEATURE 14: CUSTOM FORM BUILDER
// ==========================================
const addFieldBtn = document.getElementById('addFieldBtn');
const formFieldsContainer = document.getElementById('formFieldsContainer');
const saveFormBtn = document.getElementById('saveFormBtn');
const publishedFormsList = document.getElementById('publishedFormsList');

if (addFieldBtn && formFieldsContainer && saveFormBtn) {
    let fieldCount = 0;
    
    addFieldBtn.addEventListener('click', () => {
        fieldCount++;
        const div = document.createElement('div');
        div.style = 'display:flex; gap:1rem; align-items:center; background:var(--bg); padding:1rem; border-radius:8px; border:1px solid var(--border);';
        div.className = 'form-field-item';
        div.innerHTML = `
            <input type="text" class="input field-label" placeholder="Field Label (e.g. Phone Number)" style="flex:2;" required>
            <select class="input field-type" style="flex:1;" required>
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="number">Number</option>
                <option value="textarea">Long Text</option>
            </select>
            <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem;"><input type="checkbox" class="field-required"> Req</label>
            <button type="button" class="btn btn-ghost" onclick="this.parentElement.remove()" style="color:var(--error); padding:0.5rem;">X</button>
        `;
        formFieldsContainer.appendChild(div);
    });

    saveFormBtn.addEventListener('click', async () => {
        const name = document.getElementById('formName').value;
        if (!name) return alert('Form Name is required');
        
        const items = formFieldsContainer.querySelectorAll('.form-field-item');
        if (items.length === 0) return alert('Add at least one field');
        
        const fields = Array.from(items).map(item => ({
            label: item.querySelector('.field-label').value,
            type: item.querySelector('.field-type').value,
            required: item.querySelector('.field-required').checked
        }));

        saveFormBtn.disabled = true;
        saveFormBtn.textContent = 'Publishing...';
        
        try {
            await addDoc(collection(db, 'custom_forms'), {
                name,
                fields,
                createdAt: new Date().toISOString()
            });
            document.getElementById('formName').value = '';
            formFieldsContainer.innerHTML = '';
            document.getElementById('formBuilderMsg').textContent = 'Form published!';
            document.getElementById('formBuilderMsg').style.color = 'var(--success)';
        } catch(error) {
            alert('Error: ' + error.message);
        }
        saveFormBtn.disabled = false;
        saveFormBtn.textContent = 'Publish Form';
    });

    onSnapshot(collection(db, 'custom_forms'), (snapshot) => {
        if(!publishedFormsList) return;
        publishedFormsList.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const div = document.createElement('div');
            div.style = 'padding:1rem; border:1px solid var(--border); border-radius:8px; display:flex; justify-content:space-between; align-items:center;';
            div.innerHTML = `
                <div>
                    <strong style="display:block; margin-bottom:0.25rem;">${data.name}</strong>
                    <span style="font-size:0.85rem; color:var(--text-dim);">${data.fields.length} Fields</span>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <a href="form-view.html?id=${docSnap.id}" target="_blank" class="btn btn-outline btn-sm">View Form</a>
                    <button class="btn btn-outline btn-sm" onclick="deleteCustomForm('${docSnap.id}')" style="color:var(--error); border-color:var(--error);">Delete</button>
                </div>
            `;
            publishedFormsList.appendChild(div);
        });
    });
}
window.deleteCustomForm = async (id) => {
    if(confirm('Delete this form?')) {
        await deleteDoc(doc(db, 'custom_forms', id));
    }
};


// ==========================================
// ACADEMIC CALENDAR LOGIC
// ==========================================
const saveEventBtn = document.getElementById('saveEventBtn');
const calendarGrid = document.getElementById('calendarGrid');
const adminCalendarEventModal = document.getElementById('adminCalendarEventModal');

if (saveEventBtn) {
    saveEventBtn.addEventListener('click', async () => {
        const title = document.getElementById('newEventTitle').value;
        const date = document.getElementById('newEventDate').value;
        const type = document.getElementById('newEventType').value;
        
        if (!title || !date || !type) {
            alert('Please fill in all fields');
            return;
        }
        
        saveEventBtn.disabled = true;
        saveEventBtn.textContent = 'Saving...';
        
        try {
            await addDoc(collection(db, 'calendarEvents'), {
                title,
                date,
                type,
                createdAt: new Date().toISOString()
            });
            alert('Event added successfully!');
            document.getElementById('newEventTitle').value = '';
            document.getElementById('newEventDate').value = '';
            if(adminCalendarEventModal) adminCalendarEventModal.classList.remove('active');
        } catch (error) {
            alert('Error adding event: ' + error.message);
        }
        
        saveEventBtn.disabled = false;
        saveEventBtn.textContent = 'Save Event';
    });
}

if (calendarGrid) {
    onSnapshot(collection(db, 'calendarEvents'), (snapshot) => {
        // Clear grid
        calendarGrid.innerHTML = '';
        
        // Group by month/date or just show upcoming events in a list since calendar grids require complex date logic
        // But the HTML uses a grid. Let's just create simple blocks for each event for now, sorted by date.
        const events = [];
        snapshot.forEach(docSnap => events.push({ id: docSnap.id, ...docSnap.data() }));
        events.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (events.length === 0) {
            calendarGrid.innerHTML = '<div style="padding: 1rem; color: var(--text-dim); grid-column: 1/-1; text-align: center;">No events scheduled.</div>';
            return;
        }
        
        events.forEach(ev => {
            const div = document.createElement('div');
            div.className = 'portal-card';
            div.style.padding = '1rem';
            
            let color = 'var(--primary)';
            if(ev.type === 'exam') color = 'var(--gold-base)';
            if(ev.type === 'holiday') color = 'var(--error)';
            
            div.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 0.5rem; color: ${color};">${ev.title}</div>
                <div style="font-size: 0.9rem; color: var(--text-dim); margin-bottom: 1rem;">${new Date(ev.date).toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'})}</div>
                <button class="btn btn-outline btn-sm" onclick="deleteCalendarEvent('${ev.id}')" style="color:var(--error); border-color:var(--error);">Delete</button>
            `;
            calendarGrid.appendChild(div);
        });
    });
}

window.deleteCalendarEvent = async (id) => {
    if(confirm('Delete this event?')) {
        try {
            await deleteDoc(doc(db, 'calendarEvents', id));
        } catch(error) {
            alert('Error deleting event: ' + error.message);
        }
    }
};
