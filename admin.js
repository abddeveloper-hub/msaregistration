import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, collection, onSnapshot, addDoc, setDoc, getDocs, deleteDoc, enableMultiTabIndexedDbPersistence, query as fsQuery, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
enableMultiTabIndexedDbPersistence(db).catch((err) => console.warn("Offline persistence error:", err.code));

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
                    backgroundColor: ['rgba(255, 255, 255, 0.1)', 'rgba(216, 173, 74, 0.8)', 'rgba(54, 193, 144, 0.8)', 'rgba(235, 87, 87, 0.8)'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
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
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
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

        window.chartInstances.trends = new Chart(ctxTrends, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: [{
                    label: 'Registrations',
                    data: sortedCounts,
                    borderColor: '#36c190',
                    backgroundColor: 'rgba(54, 193, 144, 0.2)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } }
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
                    { label: 'Students', data: studentData, backgroundColor: '#d8ad4a' },
                    { label: 'Faculty', data: facultyData, backgroundColor: '#36c190' }
                ]
            },
            options: { 
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } }
            }
        });
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

    document.getElementById('modalInstName').innerText = inst.name;
    document.getElementById('modalInstReg').innerText = inst.regNumber || 'N/A';

    const instStudents = allUsers.filter(u => isStudentApplication(u) && recordMatchesInstitution(u, inst));
    const instFaculty = allUsers.filter(u => u.role === 'faculty' && recordMatchesInstitution(u, inst));

    document.getElementById('modalInstTotalStudents').innerText = instStudents.length;
    document.getElementById('modalInstTotalFaculty').innerText = instFaculty.length;

    const tbody = document.getElementById('modalInstStudentTableBody');
    tbody.innerHTML = '';
    
    if(instStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-dim);">No students enrolled here yet.</td></tr>';
    } else {
        instStudents.forEach(s => {
            const contact = s.email || s.parentPhone || 'N/A';
            const statusLabel = s.status === 'admitted' ? '<span class="status-badge" style="background:var(--success-dim); color:var(--success);">Admitted</span>' :
                              s.status === 'rejected' ? '<span class="status-badge" style="background:var(--danger-dim); color:var(--danger);">Rejected</span>' :
                              '<span class="status-badge" style="background:var(--warning-dim); color:var(--warning);">Pending</span>';
            tbody.innerHTML += `<tr>
                <td><strong>${s.fullName || 'Unknown'}</strong></td>
                <td>${contact}</td>
                <td>${statusLabel}</td>
            </tr>`;
        });
    }

    document.getElementById('adminInstitutionModal').classList.add('active');
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
            <img src="${s.photoUrl || ''}" style="width:120px; height:120px; object-fit:cover; border-radius:1rem; margin-bottom:1rem; background:#333;">
            <p><strong>Name:</strong> ${s.fullName}</p>
            <p><strong>Phone:</strong> ${s.phone}</p>
            <p><strong>DOB:</strong> ${s.dob}</p>
            <p><strong>Father:</strong> ${s.fatherName} (${s.fatherPhone})</p>
            <p><strong>Address:</strong> ${s.address}</p>
            <p><strong>Aadhar:</strong> ${s.aadhar}</p>
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
    if(!confirm(`Are you sure you want to permanently delete this ${col === 'users' ? 'user' : 'institution'} record? This cannot be undone.`)) return;
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
