import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, where, addDoc, runTransaction, getDocs, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";



const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM
const viewRegistration = document.getElementById('viewRegistration');
const viewPending = document.getElementById('viewPending');
const viewDashboard = document.getElementById('viewDashboard');
const facultyNav = document.getElementById('facultyNav');
const logoutBtn = document.getElementById('logoutBtn');

// Set default date to today for attendance
const attDateInput = document.getElementById('attDate');
if (attDateInput) {
    const today = new Date().toISOString().split('T')[0];
    attDateInput.value = today;
}

let currentFacData = null;
let campusStudents = [];
let teacherInstitutions = [];
let campusSubjects = [];
let allUsersSnapUnsub = null;
let institutionsSnapUnsub = null;
let subjectsSnapUnsub = null;
let campusQueryUnsubs = [];
let activeCampusScope = null;
let fallbackQueriesStarted = false;
let latestUsers = [];

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function isStudentRecord(user) {
    return user?.role === 'student' || !user?.role;
}

function isStudentApplication(user) {
    if (!isStudentRecord(user)) return false;
    const status = normalizeText(user?.status);
    return Boolean(user?.parentUid || user?.campus || user?.campusId || ['pending', 'admitted', 'rejected'].includes(status));
}

function isStatus(user, status) {
    return normalizeText(user?.status || 'pending') === status;
}

function institutionNameForId(campusId) {
    return teacherInstitutions.find(inst => inst.id === campusId)?.name || '';
}

function getScopeTokens(scope) {
    const tokens = [scope?.campusId, scope?.campusName, institutionNameForId(scope?.campusId)];
    return tokens.map(token => String(token || '').trim()).filter(Boolean);
}

function recordMatchesCampusScope(user, scope) {
    if (scope?.role === 'admin') return true;

    const scopeTokens = getScopeTokens(scope);
    if (scopeTokens.length === 0) return false;

    const recordTokens = [user?.campusId, user?.campus].map(token => String(token || '').trim()).filter(Boolean);
    return recordTokens.some(recordToken => scopeTokens.some(scopeToken => {
        return recordToken === scopeToken || normalizeText(recordToken) === normalizeText(scopeToken);
    }));
}

function setQueueStatus(message, isError = false) {
    const status = document.getElementById('queueStatus');
    if (!status) return;
    status.innerText = message;
    status.style.color = isError ? 'var(--error)' : 'var(--text-dim)';
}

// Auth State
let userProfileUnsub = null;
onAuthStateChanged(auth, (user) => {
    if (userProfileUnsub) {
        userProfileUnsub();
        userProfileUnsub = null;
    }

    if (user) {
        userProfileUnsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Allow faculty OR admin to view this page
                if (data.role !== 'faculty' && data.role !== 'admin') {
                    console.error("Access denied: Not a faculty member.");
                    return window.location.href = "index.html";
                }
                currentFacData = data;
                renderView(data);
            }
        });
    } else {
        window.location.href = "index.html";
    }
});

if(logoutBtn) logoutBtn.addEventListener('click', () => {
    if (userProfileUnsub) userProfileUnsub();
    stopCampusListeners();
    signOut(auth);
});

// UI Navigation (Desktop & Mobile)
const allNavItems = document.querySelectorAll('.nav-item, .m-nav-item');
allNavItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetId = item.getAttribute('data-target');
        if(!targetId) return;

        // Update all nav UI
        allNavItems.forEach(n => {
            n.classList.toggle('active', n.getAttribute('data-target') === targetId);
        });

        // Toggle sections
        document.querySelectorAll('.dashboard-section').forEach(sec => sec.classList.add('hidden'));
        const targetSec = document.getElementById(targetId);
        if(targetSec) targetSec.classList.remove('hidden');
    });
});

const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
if(mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', () => {
    if (userProfileUnsub) userProfileUnsub();
    stopCampusListeners();
    signOut(auth);
});

document.getElementById('downloadStudentListBtn')?.addEventListener('click', () => {
    const admitted = campusStudents.filter(s => normalizeText(s.status) === 'admitted');
    if (admitted.length === 0) return alert("No admitted students to download.");

    let csv = "ID Number,Full Name,Phone,Batch,Campus\n";
    admitted.forEach(s => {
        csv += `"${s.rollNumber || 'N/A'}","${s.fullName || 'Unnamed'}","${s.phone || 'N/A'}","${s.batch || 'N/A'}","${s.campus || 'N/A'}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `Student_List_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

function renderView(data) {
    viewRegistration.classList.add('hidden');
    viewPending.classList.add('hidden');
    viewDashboard.classList.add('hidden');
    facultyNav.classList.add('hidden');

    if (data.role !== 'admin' && (data.status === 'unsubmitted' || !data.status)) {
        viewRegistration.classList.remove('hidden');
    } else if (data.role !== 'admin' && data.status === 'pending') {
        viewPending.classList.remove('hidden');
    } else if (data.role === 'admin' || data.status === 'admitted') {
        viewDashboard.classList.remove('hidden');
        facultyNav.classList.remove('hidden');
        document.getElementById('facWelcomeTitle').innerText = `Welcome, ${data.fullName}`;
        document.getElementById('facAssignedCampus').innerText = data.role === 'admin' ? 'All Campuses' : (data.campus || "Unassigned");
        
        initCampusData({ role: data.role, campusId: data.campusId, campusName: data.campus });
    }
}

// Registration Submit
const regForm = document.getElementById('regForm');
if(regForm) {
    regForm.addEventListener('submit', async(e) => {
        e.preventDefault();
        const btn = document.getElementById('submitRegBtn');
        btn.disabled = true;
        btn.innerText = "Submitting...";
        try {
            await setDoc(doc(db, "users", auth.currentUser.uid), {
                fullName: document.getElementById('facName').value,
                phone: document.getElementById('facPhone').value,
                aadhar: document.getElementById('facAadhar').value,
                dob: document.getElementById('facDob').value,
                bachelorsWhere: document.getElementById('facBachelors').value,
                mastersWhere: document.getElementById('facMasters').value,
                mudarrisWhere: document.getElementById('facMudarrisWhere').value,
                status: 'pending',
                role: 'faculty',
                updatedAt: new Date().toISOString()
            }, { merge: true });
        } catch (error) {
            alert(error.message);
            btn.disabled = false;
            btn.innerText = "Submit for Admin Approval";
        }
    });
}

// Data Fetching for Assigned Campus
function stopCampusListeners() {
    if (allUsersSnapUnsub) { allUsersSnapUnsub(); allUsersSnapUnsub = null; }
    if (institutionsSnapUnsub) { institutionsSnapUnsub(); institutionsSnapUnsub = null; }
    if (subjectsSnapUnsub) { subjectsSnapUnsub(); subjectsSnapUnsub = null; }
    campusQueryUnsubs.forEach(unsub => unsub());
    campusQueryUnsubs = [];
    fallbackQueriesStarted = false;
}

function renderCampusStudentsFrom(users) {
    campusStudents = users
        .filter(isStudentApplication)
        .filter(user => recordMatchesCampusScope(user, activeCampusScope));

    campusStudents.sort((a, b) => {
        const rollA = String(a.rollNumber || '').toLowerCase();
        const rollB = String(b.rollNumber || '').toLowerCase();
        return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });

    renderQueue();
    renderMyStudents();
    updateSelects();
    updateBatchDropdown();

    const pendingCount = campusStudents.filter(s => isStatus(s, 'pending')).length;
    const admittedCount = campusStudents.filter(s => isStatus(s, 'admitted')).length;

    if (activeCampusScope?.role !== 'admin' && getScopeTokens(activeCampusScope).length === 0) {
        setQueueStatus('No campus is assigned to this faculty account. Ask admin to assign a campus.', true);
    } else if (campusStudents.length === 0) {
        setQueueStatus(activeCampusScope?.role === 'admin'
            ? 'No student applications found in the system.'
            : 'No student applications found for this assigned campus.');
    } else {
        setQueueStatus(`${pendingCount} pending application(s), ${admittedCount} admitted student(s) loaded.`);
    }
}

function startFallbackCampusQueries(scope) {
    if (fallbackQueriesStarted || scope?.role === 'admin') return;
    fallbackQueriesStarted = true;

    const queryResults = new Map();
    const addCampusQuery = (field, value) => {
        const cleanValue = String(value || '').trim();
        if (!cleanValue) return;

        const key = `${field}:${cleanValue}`;
        const q = query(collection(db, "users"), where(field, "==", cleanValue));
        const unsub = onSnapshot(q, (snapshot) => {
            queryResults.set(key, snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            const merged = new Map();
            Array.from(queryResults.values()).flat().forEach(record => merged.set(record.id, record));
            latestUsers = Array.from(merged.values());
            renderCampusStudentsFrom(latestUsers);
        }, (error) => {
            console.error(`Campus query failed for ${key}:`, error);
            setQueueStatus(`Unable to load student queue: ${error.message}`, true);
        });

        campusQueryUnsubs.push(unsub);
    };

    addCampusQuery('campusId', scope?.campusId);
    addCampusQuery('campus', scope?.campusName);
    addCampusQuery('campus', scope?.campusId);

    if (campusQueryUnsubs.length === 0) {
        renderCampusStudentsFrom([]);
    }
}

function initCampusData(scope) {
    stopCampusListeners();
    activeCampusScope = scope;
    campusStudents = [];
    latestUsers = [];
    setQueueStatus('Loading student applications...');
    renderQueue();
    renderMyStudents();
    updateSelects();
    updateBatchDropdown();

    institutionsSnapUnsub = onSnapshot(collection(db, "institutions"), (snapshot) => {
        teacherInstitutions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCampusStudentsFrom(latestUsers);
    }, (error) => {
        console.warn("Unable to load institutions for campus matching:", error);
    });

    allUsersSnapUnsub = onSnapshot(collection(db, "users"), (snapshot) => {
        latestUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCampusStudentsFrom(latestUsers);
    }, (error) => {
        console.warn("Unable to load all users, trying scoped campus queries:", error);
        setQueueStatus('Trying campus-specific student lookup...');
        startFallbackCampusQueries(scope);
    });

    // Listen for subjects in the institution document itself
    const cid = scope.campusId || (currentFacData?.role === 'admin' ? 'global_config' : null);
    if (cid) {
        subjectsSnapUnsub = onSnapshot(doc(db, "institutions", cid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                campusSubjects = (data.subjectsList || []).map(item => {
                    if (typeof item === 'string') return { name: item, batch: 'All' };
                    return { name: item.name || 'Unnamed', batch: item.batch || 'All' };
                });
            } else {
                campusSubjects = [];
            }
            renderSubjects();
            updateSelects();
        }, (error) => {
            console.error("Subject listener error:", error);
        });
    }
}

// Subjects Management
function renderSubjects() {
    const list = document.getElementById('subjectsList');
    if (!list) return;
    list.innerHTML = '';
    if (campusSubjects.length === 0) {
        list.innerHTML = '<p style="color:var(--text-dim);">No subjects configured yet. Add the first subject above.</p>';
        return;
    }
    campusSubjects.forEach(sub => {
        const sName = typeof sub === 'string' ? sub : sub.name;
        const sBatch = typeof sub === 'string' ? 'All' : (sub.batch || 'All');
        
        const el = document.createElement('div');
        el.className = 'badge';
        el.style.padding = '0.5rem 1rem';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.gap = '0.5rem';
        el.style.background = 'var(--glass-heavy)';
        el.innerHTML = `
            <span dir="auto"><strong>${escapeHtml(sName)}</strong> <small style="opacity:0.7" dir="ltr">(${sBatch})</small></span>
            <span style="cursor:pointer; color:var(--error); font-weight:bold;" onclick="deleteSubject('${escapeHtml(sName)}', '${escapeHtml(sBatch)}')">×</span>
        `;
        list.appendChild(el);
    });
}

document.getElementById('addSubjectBtn')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('newSubName');
    const batchInput = document.getElementById('newSubBatch');
    const name = nameInput.value.trim();
    const batch = batchInput.value;
    
    if (!name) return alert("Please enter a subject name.");
    
    const cid = activeCampusScope?.campusId || (currentFacData?.role === 'admin' ? 'global_config' : null);
    if (!cid) return alert("Account error: No campus assigned.");
    
    try {
        const docRef = doc(db, "institutions", cid);
        const subObj = { name, batch };
        await setDoc(docRef, {
            subjectsList: arrayUnion(subObj)
        }, { merge: true });
        nameInput.value = '';
    } catch(err) { 
        console.error("Subject Add Error:", err);
        alert("Permission Error: Your account may not have permission to modify institution settings."); 
    }
});

window.deleteSubject = async (name, batch) => {
    if (!confirm(`Delete subject "${name}" for ${batch}?`)) return;
    const cid = activeCampusScope?.campusId || (currentFacData?.role === 'admin' ? 'global_config' : null);
    if (!cid) return;

    try {
        const docRef = doc(db, "institutions", cid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const list = docSnap.data().subjectsList || [];
            // Find the item that matches the name and batch
            const itemToRemove = list.find(item => {
                const sName = typeof item === 'string' ? item : item.name;
                const sBatch = typeof item === 'string' ? 'All' : (item.batch || 'All');
                return sName === name && sBatch === batch;
            });

            if (itemToRemove) {
                await updateDoc(docRef, {
                    subjectsList: arrayRemove(itemToRemove)
                });
            }
        }
    } catch(err) { alert("Delete failed: " + err.message); }
};

// Add a clear all option for admins
window.clearAllSubjects = async () => {
    if (!confirm("Are you sure you want to delete ALL subjects for this campus? This cannot be undone.")) return;
    const cid = activeCampusScope?.campusId || (currentFacData?.role === 'admin' ? 'global_config' : null);
    if (!cid) return;
    try {
        await updateDoc(doc(db, "institutions", cid), {
            subjectsList: []
        });
        alert("All subjects cleared.");
    } catch(err) { alert(err.message); }
};


// Shortcut to subjects view from dropdowns
[document.getElementById('markSubject'), document.getElementById('attSession')].forEach(el => {
    el?.addEventListener('change', (e) => {
        if (e.target.value === '__ADD_NEW__') {
            e.target.value = ''; // Reset select
            document.querySelector('[data-target="viewSubjects"]')?.click();
        }
    });
});

// Queue
function renderQueue() {
    const pendingStudents = campusStudents.filter(s => isStatus(s, 'pending'));
    const tbody = document.getElementById('queueTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    if(pendingStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-dim);">No pending students.</td></tr>';
        return;
    }
    
    pendingStudents.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(s.fullName || 'Unnamed')}</td>
            <td>${escapeHtml(s.phone || 'N/A')}</td>
            <td>${escapeHtml(s.batch || 'N/A')}</td>
            <td>
                <button class="action-btn btn-action" onclick="viewStudentDetails('${s.id}')">View</button>
                <button class="action-btn btn-approve" onclick="approveStudent('${s.id}')">Approve</button>
                <button class="action-btn btn-reject" onclick="rejectStudent('${s.id}')">Reject</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.viewStudentDetails = async (uid) => {
    const s = campusStudents.find(x => x.id === uid);
    if(!s) return;
    const body = document.getElementById('modalBody');
    body.innerHTML = '<p>Loading statistics...</p>';
    document.getElementById('studentModal').classList.add('active');

    const editBtn = document.getElementById('editStudentModalBtn');
    if (editBtn) {
        editBtn.onclick = () => {
            document.getElementById('studentModal').classList.remove('active');
            window.openEditStudent(uid);
        };
    }

    // Fetch Stats for Modal
    let attPct = 0;
    let marksAvg = 0;
    let totalP = 0, totalA = 0, totalL = 0;
    const sessionStats = {}; // key: sessionName, value: { total: 0, present: 0, absent: 0, leave: 0 }

    try {
        const attSnap = await getDocs(collection(db, `users/${uid}/attendance`));
        const total = attSnap.size;

        attSnap.forEach(docSnap => {
            const data = docSnap.data();
            const sName = data.sessionName || 'Default Session';
            if (!sessionStats[sName]) {
                sessionStats[sName] = { total: 0, present: 0, absent: 0, leave: 0 };
            }
            sessionStats[sName].total++;
            if (data.status === 'present') {
                sessionStats[sName].present++;
                totalP++;
            } else if (data.status === 'absent') {
                sessionStats[sName].absent++;
                totalA++;
            } else if (data.status === 'absent_reason' || data.status === 'leave') {
                sessionStats[sName].leave++;
                totalL++;
            }
        });

        attPct = total > 0 ? Math.round((totalP/total)*100) : 0;

        const marksSnap = await getDocs(collection(db, `users/${uid}/marks`));
        const mCount = marksSnap.size;
        const totalM = marksSnap.docs.reduce((acc, d) => acc + parseFloat(d.data().percentage || 0), 0);
        marksAvg = mCount > 0 ? Math.round(totalM / mCount) : 0;
    } catch(e) { console.error("Stats fetch error:", e); }

    let breakdownHtml = '';
    if (Object.keys(sessionStats).length === 0) {
        breakdownHtml = '<p style="color:var(--text-dim); font-size:0.85rem; margin:0; text-align:center;">No attendance records found.</p>';
    } else {
        Object.entries(sessionStats).forEach(([sName, stat]) => {
            const sPct = stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0;
            breakdownHtml += `
                <div style="display:flex; flex-direction:column; gap:0.25rem; font-size:0.8rem; margin-bottom:0.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:600; color:var(--text);">${escapeHtml(sName)}</span>
                        <span style="font-weight:700; color:${sPct >= 75 ? 'var(--success)' : 'var(--error)'};">
                            ${sPct}% <span style="font-weight:normal; color:var(--text-dim); font-size:0.7rem;">(P:${stat.present} A:${stat.absent} L:${stat.leave})</span>
                        </span>
                    </div>
                    <div style="width:100%; height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden; border:1px solid rgba(255,255,255,0.05);">
                        <div style="width:${sPct}%; height:100%; background: ${sPct >= 75 ? 'var(--success)' : 'var(--error)'}; border-radius:3px;"></div>
                    </div>
                </div>
            `;
        });
    }

    body.innerHTML = `
        <div style="display:flex; gap:1rem; margin-bottom:1.5rem; align-items:center;">
            <img src="${escapeHtml(s.photoUrl || '')}" style="width:80px; height:80px; object-fit:cover; border-radius:0.5rem; background:#333;">
            <div>
                <h3 style="margin:0; color:var(--primary);">${escapeHtml(s.fullName || 'N/A')}</h3>
                <p style="margin:0; font-size:0.9rem; color:var(--text-dim);">${escapeHtml(s.rollNumber || 'Pending Roll No')}</p>
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:1rem; margin-bottom:1.5rem;">
            <div style="padding:1rem; background:var(--glass); border-radius:0.5rem; border:1px solid var(--border); display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
                <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; margin-bottom:0.25rem;">Overall Attendance</div>
                <div style="font-size:1.6rem; font-weight:800; color:var(--success);">${attPct}%</div>
                <div style="font-size:0.75rem; color:var(--text-dim); margin-top:0.25rem; display:flex; gap:0.5rem;">
                    <span style="color:var(--success);">P: ${totalP}</span>
                    <span style="color:var(--error);">A: ${totalA}</span>
                    <span style="color:var(--warning);">L: ${totalL}</span>
                </div>
            </div>
            <div style="text-align:center; padding:1rem; background:var(--glass); border-radius:0.5rem; border:1px solid var(--border); display:flex; flex-direction:column; justify-content:center; align-items:center;">
                <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; margin-bottom:0.25rem;">Avg. Marks</div>
                <div style="font-size:1.6rem; font-weight:800; color:var(--primary);">${marksAvg}%</div>
            </div>
        </div>

        <div style="margin-bottom:1.5rem; background:var(--glass); border-radius:0.5rem; padding:1rem; border:1px solid var(--border);">
            <div style="font-size:0.8rem; font-weight:700; color:var(--primary); text-transform:uppercase; margin-bottom:0.75rem; border-bottom:1px solid var(--border); padding-bottom:0.5rem;">Attendance Breakdown</div>
            <div style="max-height:180px; overflow-y:auto; padding-right:0.25rem;">
                ${breakdownHtml}
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; font-size:0.9rem;">
            <p><strong>Father:</strong> ${escapeHtml(s.fatherName || 'N/A')}</p>
            <p><strong>Batch:</strong> ${escapeHtml(s.batch || 'N/A')}</p>
            <p><strong>Phone:</strong> ${escapeHtml(s.phone || 'N/A')}</p>
            <p><strong>DOB:</strong> ${escapeHtml(s.dob || 'N/A')}</p>
        </div>
        <hr style="border-color:var(--border); margin:1rem 0;">
        <p style="font-size:0.9rem;"><strong>Education:</strong> ${escapeHtml(s.schoolInfo?.level || 'N/A')} (Dars: ${escapeHtml(s.darsType || 'N/A')})</p>
        <p style="font-size:0.9rem;"><strong>Address:</strong> ${escapeHtml(s.address || 'N/A')}</p>
    `;
};

window.approveStudent = async (uid) => {
    if(!uid) return;
    if(!confirm("Are you sure you want to approve this student?")) return;
    
    try {
        const student = campusStudents.find(s => s.id === uid);
        if (!student) throw new Error("Student record not found in local cache.");

        const campusLabel = student.campus || currentFacData?.campus || 'MSA UKKUDA';
        const campusId = student.campusId || currentFacData?.campusId || 'generic';
        const shortCampus = (campusLabel.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'MSA UKKUDA');
        
        const counterDocRef = doc(db, "metadata", `campus_${campusId}_counter`);
        let nextSequence = null;

        try {
            // Attempt Atomic ID Generation via Transaction
            await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterDocRef);
                let seq = 1001;
                if (counterDoc.exists()) {
                    const val = counterDoc.data().currentValue;
                    if (typeof val === 'number') seq = val + 1;
                }
                nextSequence = seq;
                transaction.set(counterDocRef, { currentValue: seq }, { merge: true });
                
                transaction.update(doc(db, "users", uid), {
                    status: 'admitted',
                    rollNumber: student.rollNumber || `${seq}`,
                    campus: campusLabel,
                    campusId: campusId,
                    admittedBy: auth.currentUser?.uid || 'system',
                    admittedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            });
            alert(`Student approved successfully! ID: MSA UKKUDA-${shortCampus}-${nextSequence}`);
        } catch (transError) {
            console.warn("ID Counter Transaction failed (Permissions?), falling back to simple approval...", transError);
            
            // FALLBACK: Simple approval without ID generation if counter doc is locked
            await updateDoc(doc(db, "users", uid), {
                status: 'admitted',
                rollNumber: student.rollNumber || `PENDING`,
                campus: campusLabel,
                campusId: campusId,
                admittedBy: auth.currentUser?.uid || 'system',
                admittedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            alert("Student admitted successfully! (ID counter was unavailable, assigned PENDING status).");
        }
    } catch (error) {
        console.error("Approval Error:", error);
        alert("Critical Error: " + error.message);
    }
};

window.rejectStudent = async (uid) => {
    if(!confirm("Are you sure you want to reject this student?")) return;
    await updateDoc(doc(db, "users", uid), { 
        status: 'rejected',
        updatedAt: new Date().toISOString()
    });
};

// Edit Student Logic
let editingStudentId = null;

window.openEditStudent = (uid) => {
    const s = campusStudents.find(x => x.id === uid);
    if(!s) return;
    editingStudentId = uid;
    
    document.getElementById('viewEditStudent').classList.remove('hidden');
    
    document.getElementById('editStuRollNumber').value = s.rollNumber || '';
    
    document.getElementById('editStuName').value = s.fullName || '';
    document.getElementById('editStuDob').value = s.dob || '';
    document.getElementById('editStuBlood').value = s.bloodGroup || '';
    document.getElementById('editStuPhone').value = s.phone || '';
    document.getElementById('editStuAadhar').value = s.aadhar || '';
    
    document.getElementById('editStuFatherName').value = s.fatherName || '';
    document.getElementById('editStuFatherPhone').value = s.fatherPhone || '';
    document.getElementById('editStuAddress').value = s.address || '';
    
    document.getElementById('editStuSayyid').value = s.isSayyid || 'no';
    document.getElementById('editStuHafiz').value = s.isHafiz || 'no';
    document.getElementById('editStuOrphan').value = s.isOrphan || 'no';
    
    document.getElementById('editStuCampus').value = s.campus || '';
    document.getElementById('editStuBatch').value = s.batch || '';
};

window.closeEditStudent = () => {
    document.getElementById('viewEditStudent').classList.add('hidden');
    editingStudentId = null;
};

const editStudentForm = document.getElementById('editStudentForm');
if (editStudentForm) {
    editStudentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!editingStudentId) return;
        
        const btn = document.getElementById('saveEditBtn');
        btn.disabled = true;
        btn.innerText = "Saving...";
        
        try {
            await updateDoc(doc(db, "users", editingStudentId), {
                rollNumber: document.getElementById('editStuRollNumber').value,
                fullName: document.getElementById('editStuName').value,
                dob: document.getElementById('editStuDob').value,
                bloodGroup: document.getElementById('editStuBlood').value,
                phone: document.getElementById('editStuPhone').value,
                aadhar: document.getElementById('editStuAadhar').value,
                fatherName: document.getElementById('editStuFatherName').value,
                fatherPhone: document.getElementById('editStuFatherPhone').value,
                address: document.getElementById('editStuAddress').value,
                isSayyid: document.getElementById('editStuSayyid').value,
                isHafiz: document.getElementById('editStuHafiz').value,
                isOrphan: document.getElementById('editStuOrphan').value,
                batch: document.getElementById('editStuBatch').value,
                updatedAt: new Date().toISOString()
            });
            alert("Student profile updated successfully!");
            window.closeEditStudent();
        } catch (error) {
            console.error("Edit Error:", error);
            alert("Failed to update student: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerText = "Save Changes";
        }
    });
}


// My Students
function renderMyStudents() {
    const admitted = campusStudents.filter(s => isStatus(s, 'admitted'));
    const tbody = document.getElementById('studentsTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    if(admitted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-dim);">No admitted students yet.</td></tr>';
        return;
    }
    
    admitted.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color:var(--primary); font-weight:bold;">${escapeHtml(s.rollNumber || 'N/A')}</td>
            <td>${escapeHtml(s.fullName || 'Unnamed')}</td>
            <td>${escapeHtml(s.batch || 'N/A')}</td>
            <td><button class="action-btn btn-action" onclick="viewStudentDetails('${s.id}')">View</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSelects() {
    const admitted = campusStudents.filter(s => isStatus(s, 'admitted'));
    
    // 1. Students dropdown
    let stuOpts = '<option value="" disabled selected>Select Student...</option>';
    admitted.forEach(s => stuOpts += `<option value="${s.id}">${escapeHtml(s.fullName || 'Unnamed')} (${escapeHtml(s.rollNumber || 'No Roll No')})</option>`);
    
    const sm = document.getElementById('markStudent');
    const rm = document.getElementById('remStudent');
    if(sm) sm.innerHTML = stuOpts;
    if(rm) rm.innerHTML = stuOpts;

    // 2. Subjects dropdown (Dynamic Filtering)
    const renderSubjectOpts = (targetEl, filterBatch = 'All') => {
        if (!targetEl) return;
        const prevVal = targetEl.value;
        let subOpts = '<option value="" disabled selected>Select Subject...</option>';
        subOpts += '<option value="1st Dars">1st Dars</option>';
        subOpts += '<option value="2nd Dars">2nd Dars</option>';
        
        campusSubjects.forEach(sub => {
            const sName = typeof sub === 'string' ? sub : sub.name;
            const sBatch = sub.batch || 'All';
            
            // Show if it's a legacy string subject, or if batch matches, or if it's 'All'
            if (sName !== '1st Dars' && sName !== '2nd Dars') {
                if (filterBatch === 'all' || filterBatch === 'All' || sBatch === 'All' || sBatch === filterBatch) {
                    subOpts += `<option value="${escapeHtml(sName)}" dir="auto">${escapeHtml(sName)} ${sBatch !== 'All' ? `(${sBatch})` : ''}</option>`;
                }
            }
        });
        subOpts += '<option value="__ADD_NEW__">+ Add New Subject...</option>';
        targetEl.innerHTML = subOpts;

        if (prevVal && [...targetEl.options].some(opt => opt.value === prevVal)) {
            targetEl.value = prevVal;
        }
    };

    const marksSub = document.getElementById('markSubject');
    const attSub = document.getElementById('attSession');
    const attBatch = document.getElementById('attBatch')?.value || 'All';
    
    renderSubjectOpts(marksSub, 'All'); // Marks shows all by default
    renderSubjectOpts(attSub, attBatch); // Attendance filters by selected batch

    // Fetch and display marked dates for this batch & session
    fetchMarkedDates();
}

// Fetch and display already marked dates for selected Batch and Subject
async function fetchMarkedDates() {
    const batch = document.getElementById('attBatch')?.value;
    const session = document.getElementById('attSession')?.value;
    const container = document.getElementById('markedDatesContainer');
    const listEl = document.getElementById('markedDatesList');
    const statusMsg = document.getElementById('attStatusMessage');

    if (!container || !listEl) return;

    // Reset status message and list
    statusMsg.style.display = 'none';
    statusMsg.innerHTML = '';

    if (!batch || !session || session === '__ADD_NEW__') {
        container.style.display = 'none';
        return;
    }

    const admitted = campusStudents.filter(s => isStatus(s, 'admitted'));
    const batchStudents = batch === 'all' ? admitted : admitted.filter(s => s.batch === batch);

    if (batchStudents.length === 0) {
        container.style.display = 'none';
        return;
    }

    // Take the first student in the batch to check marked dates
    const student = batchStudents[0];
    
    try {
        const attSnap = await getDocs(collection(db, `users/${student.id}/attendance`));
        const dates = [];
        attSnap.forEach(docSnap => {
            const data = docSnap.data();
            // Match the selected session
            if (data.sessionName === session && data.date) {
                dates.push(data.date);
            }
        });

        // Deduplicate and sort dates descending (latest first)
        const uniqueDates = [...new Set(dates)].sort((a, b) => new Date(b) - new Date(a));

        if (uniqueDates.length > 0) {
            container.style.display = 'block';
            listEl.innerHTML = uniqueDates.map(d => `
                <span class="badge" style="background:var(--glass-heavy); border:1px solid var(--primary); padding:0.25rem 0.5rem; font-size:0.75rem; border-radius:0.25rem;">
                    ${escapeHtml(d)}
                </span>
            `).join('');
        } else {
            container.style.display = 'block';
            listEl.innerHTML = '<span style="color:var(--text-dim);">No attendance records found.</span>';
        }

        // Save list of marked dates globally to check in date input change listener
        window.currentMarkedDates = uniqueDates;

        // Check if currently selected date is already marked
        checkSelectedDateMarkedStatus();

    } catch (err) {
        console.error("Error fetching marked dates:", err);
    }
}

// Check if currently selected date is in the list of marked dates
function checkSelectedDateMarkedStatus() {
    const dateInput = document.getElementById('attDate');
    const statusMsg = document.getElementById('attStatusMessage');
    if (!dateInput || !statusMsg) return;

    const selectedDate = dateInput.value;
    if (!selectedDate || !window.currentMarkedDates) {
        statusMsg.style.display = 'none';
        return;
    }

    if (window.currentMarkedDates.includes(selectedDate)) {
        statusMsg.style.background = 'rgba(231, 76, 60, 0.15)';
        statusMsg.style.border = '1px solid var(--error)';
        statusMsg.style.color = 'var(--error)';
        statusMsg.style.padding = '0.75rem';
        statusMsg.style.borderRadius = '0.375rem';
        statusMsg.style.display = 'block';
        statusMsg.innerHTML = `⚠️ <strong>Warning:</strong> Attendance has already been submitted for this Date, Batch, and Subject!`;
    } else {
        statusMsg.style.background = 'rgba(46, 204, 113, 0.1)';
        statusMsg.style.border = '1px solid var(--success)';
        statusMsg.style.color = 'var(--success)';
        statusMsg.style.padding = '0.75rem';
        statusMsg.style.borderRadius = '0.375rem';
        statusMsg.style.display = 'block';
        statusMsg.innerHTML = `✅ <strong>Ready:</strong> No attendance recorded for this date.`;
    }
}

// Auto-sync Batch when Subject is selected in Attendance
document.getElementById('attSession')?.addEventListener('change', (e) => {
    const selectedName = e.target.value;
    if (!selectedName || selectedName === '__ADD_NEW__') return;

    const batchDropdown = document.getElementById('attBatch');
    if (!batchDropdown) return;

    // Default Dars sessions match 'All Batches'
    if (selectedName === '1st Dars' || selectedName === '2nd Dars') {
        batchDropdown.value = 'all';
        updateSelects();
        return;
    }

    // Find the subject in our list
    const sub = campusSubjects.find(s => s.name === selectedName);
    if (sub && sub.batch) {
        const batchVal = sub.batch === 'All' ? 'all' : sub.batch;
        batchDropdown.value = batchVal;
        updateSelects(); 
    }
});

function updateBatchDropdown() {
    const admitted = campusStudents.filter(s => isStatus(s, 'admitted'));
    // Hardcode 1-10 as requested, plus any existing legacy batches
    const foundBatches = [...new Set(admitted.map(s => s.batch).filter(Boolean))];
    const batches = [...new Set([
        'Batch 1', 'Batch 2', 'Batch 3', 'Batch 4', 'Batch 5', 
        'Batch 6', 'Batch 7', 'Batch 8', 'Batch 9', 'Batch 10',
        ...foundBatches
    ])].sort((a,b) => {
        const numA = parseInt(a.match(/\d+/));
        const numB = parseInt(b.match(/\d+/));
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
    });
    
    const bSel = document.getElementById('attBatch');
    const subBatchSel = document.getElementById('newSubBatch');
    const viewMarksBatchSel = document.getElementById('viewMarksBatch');

    if(bSel) {
        const current = bSel.value;
        bSel.innerHTML = '<option value="all">All Batches</option>';
        batches.forEach(b => bSel.innerHTML += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`);
        if (current) bSel.value = current;
    }

    if(subBatchSel) {
        subBatchSel.innerHTML = '<option value="All">All Batches</option>';
        batches.forEach(b => subBatchSel.innerHTML += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`);
    }

    if (viewMarksBatchSel) {
        const current = viewMarksBatchSel.value;
        viewMarksBatchSel.innerHTML = '<option value="all">All Batches</option>';
        batches.forEach(b => viewMarksBatchSel.innerHTML += `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`);
        if (current) viewMarksBatchSel.value = current;
    }
}

// Refresh subjects when attendance batch changes
document.getElementById('attBatch')?.addEventListener('change', updateSelects);

// Check marked status when date changes
document.getElementById('attDate')?.addEventListener('change', () => {
    if (typeof checkSelectedDateMarkedStatus === 'function') {
        checkSelectedDateMarkedStatus();
    }
});

// Marks
document.getElementById('saveMarkBtn')?.addEventListener('click', async () => {
    const stuId = document.getElementById('markStudent').value;
    const sub = document.getElementById('markSubject').value;
    const obt = parseFloat(document.getElementById('markObtained').value);
    const tot = parseFloat(document.getElementById('markTotal').value);
    const stat = document.getElementById('markStatus');
    
    if(!stuId || !sub || isNaN(obt) || isNaN(tot)) return alert("Fill all fields");
    
    const pct = ((obt/tot)*100).toFixed(2);
    
    try {
        await addDoc(collection(db, `users/${stuId}/marks`), {
            subject: sub,
            marksObtained: obt,
            totalMarks: tot,
            percentage: pct,
            date: new Date().toLocaleDateString(),
            teacherId: auth.currentUser.uid
        });
        stat.innerText = "Marks saved successfully!";
        setTimeout(()=> stat.innerText='', 3000);
        document.getElementById('markObtained').value = '';
        document.getElementById('markTotal').value = '';
    } catch (err) { alert(err.message); }
});

const loadMarksBtn = document.getElementById('loadPastMarksBtn');
if (loadMarksBtn) {
    loadMarksBtn.addEventListener('click', async () => {
        const batch = document.getElementById('viewMarksBatch').value;
        const sub = document.getElementById('markSubject').value;
        
        if (!batch || !sub) return alert("Select a batch and subject first.");
        
        loadMarksBtn.disabled = true;
        loadMarksBtn.innerText = "Loading...";

        try {
            const admitted = campusStudents.filter(s => isStatus(s, 'admitted'));
            const students = batch === 'all' ? admitted : admitted.filter(s => s.batch === batch);
            const tbody = document.getElementById('pastMarksBody');
            tbody.innerHTML = '';
            
            let marksFound = 0;

            for (const s of students) {
                const q = query(
                    collection(db, `users/${s.id}/marks`),
                    where("subject", "==", sub)
                );
                const snaps = await getDocs(q);
                
                snaps.forEach(docSnap => {
                    const data = docSnap.data();
                    marksFound++;
                    tbody.innerHTML += `
                        <tr id="mark-row-${docSnap.id}">
                            <td style="color:var(--text-dim); font-weight:bold;">${escapeHtml(s.rollNumber || '-')}</td>
                            <td>${escapeHtml(s.fullName || 'Unnamed')}</td>
                            <td>${escapeHtml(data.subject)}</td>
                            <td>
                                <strong>${data.marksObtained}</strong> / ${data.totalMarks} <span style="font-size:0.8rem; color:var(--text-dim);">(${data.percentage}%)</span>
                            </td>
                            <td>
                                <button class="btn btn-ghost" style="color:var(--error); padding: 0.25rem 0.5rem; border: 1px solid var(--error);" onclick="deleteMark('${s.id}', '${docSnap.id}')">Delete</button>
                            </td>
                        </tr>
                    `;
                });
            }

            if (marksFound === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No marks found for this batch & subject.</td></tr>';
            }

            document.getElementById('pastMarksTable').classList.remove('hidden');
        } catch (err) {
            alert(err.message);
        }
        
        loadMarksBtn.disabled = false;
        loadMarksBtn.innerText = "Load Marks";
    });
}

window.deleteMark = async (stuId, docId) => {
    if(!confirm("Are you sure you want to delete this mark?")) return;
    try {
        await deleteDoc(doc(db, `users/${stuId}/marks`, docId));
        const row = document.getElementById(`mark-row-${docId}`);
        if(row) row.remove();
        alert("Mark deleted successfully.");
    } catch(err) {
        alert(err.message);
    }
};

// Remarks
document.getElementById('saveRemarkBtn')?.addEventListener('click', async () => {
    const stuId = document.getElementById('remStudent').value;
    const txt = document.getElementById('remText').value;
    if(!stuId || !txt) return alert("Fill all fields");
    
    try {
        await addDoc(collection(db, `users/${stuId}/remarks`), {
            text: txt,
            author: currentFacData.fullName,
            date: new Date().toLocaleDateString()
        });
        document.getElementById('remText').value = '';
        alert("Remark added!");
    } catch(err) { alert(err.message); }
});

// Attendance Grid
const loadAttBtn = document.getElementById('loadAttendanceGridBtn');
const editAttBtn = document.getElementById('editPastAttendanceBtn');
const saveAttBtn = document.getElementById('saveAttendanceBtn');
const delAttBtn = document.getElementById('deleteAttendanceBtn');
const downloadAttPdfBtn = document.getElementById('downloadAttPdfBtn');
const downloadMonthlyAttPdfBtn = document.getElementById('downloadMonthlyAttPdfBtn');
let currentAttStudents = [];
let editingAttendanceMode = false;

function buildAttGrid(students, existingData = {}) {
    if(students.length === 0) {
        alert("No students found.");
        return;
    }
    
    students.sort((a, b) => {
        const rA = parseInt(a.rollNumber) || 99999;
        const rB = parseInt(b.rollNumber) || 99999;
        return rA - rB;
    });
    
    const tbody = document.getElementById('attendanceGridBody');
    tbody.innerHTML = '';
    students.forEach(s => {
        const existing = existingData[s.id] || { status: 'present', docId: null };
        const isP = existing.status === 'present' ? 'active' : '';
        const isA = existing.status === 'absent' ? 'active' : '';
        const isL = existing.status === 'absent_reason' || existing.status === 'leave' ? 'active' : '';
        const defaultStatus = existing.status || 'present';

        tbody.innerHTML += `
            <tr data-sid="${s.id}">
                <td style="color:var(--text-dim); font-weight:bold;">${escapeHtml(s.rollNumber || '-')}</td>
                <td>${escapeHtml(s.fullName || 'Unnamed')}</td>
                <td>${escapeHtml(s.batch || 'N/A')}</td>
                <td class="att-actions">
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn-att btn-p ${isP}" onclick="setAttRow(this, 'present')">P</button>
                        <button class="btn-att btn-a ${isA}" onclick="setAttRow(this, 'absent')">A</button>
                        <button class="btn-att btn-l ${isL}" onclick="setAttRow(this, 'absent_reason')">L</button>
                    </div>
                    <input type="hidden" class="att-status-val" value="${escapeHtml(defaultStatus)}">
                    <input type="hidden" class="att-doc-id" value="${escapeHtml(existing.docId || '')}">
                </td>
            </tr>
        `;
    });
    
    document.getElementById('attendanceGridTable').classList.remove('hidden');
    saveAttBtn.classList.remove('hidden');
    if (downloadAttPdfBtn) downloadAttPdfBtn.classList.remove('hidden');
    if (editingAttendanceMode && delAttBtn) {
        delAttBtn.classList.remove('hidden');
    } else if (delAttBtn) {
        delAttBtn.classList.add('hidden');
    }
}

if (loadAttBtn) {
    loadAttBtn.addEventListener('click', () => {
        editingAttendanceMode = false;
        const batch = document.getElementById('attBatch').value;
        const admitted = campusStudents.filter(s => isStatus(s, 'admitted'));
        currentAttStudents = batch === 'all' ? admitted : admitted.filter(s => s.batch === batch);
        buildAttGrid(currentAttStudents);
    });
}

if (editAttBtn) {
    editAttBtn.addEventListener('click', async () => {
        const date = document.getElementById('attDate').value;
        const session = document.getElementById('attSession').value;
        const batch = document.getElementById('attBatch').value;

        if(!date || !session || session === '__ADD_NEW__') return alert("Select a Date and Subject/Session to edit.");

        editAttBtn.disabled = true;
        editAttBtn.innerText = "Loading...";

        try {
            const admitted = campusStudents.filter(s => isStatus(s, 'admitted'));
            currentAttStudents = batch === 'all' ? admitted : admitted.filter(s => s.batch === batch);
            
            const existingData = {};
            // Fetch attendance for all students in this batch for the selected date and session
            for (const s of currentAttStudents) {
                const q = query(
                    collection(db, `users/${s.id}/attendance`),
                    where("date", "==", date),
                    where("sessionName", "==", session)
                );
                const snaps = await getDocs(q);
                if (!snaps.empty) {
                    const d = snaps.docs[0]; // Take first match
                    existingData[s.id] = { status: d.data().status, docId: d.id };
                }
            }

            if (Object.keys(existingData).length === 0) {
                alert("No attendance records found for this Date and Subject to edit.");
                editAttBtn.disabled = false;
                editAttBtn.innerText = "Edit Past Attendance";
                return;
            }

            editingAttendanceMode = true;
            buildAttGrid(currentAttStudents, existingData);
        } catch(err) {
            alert("Error loading past attendance: " + err.message);
        }
        editAttBtn.disabled = false;
        editAttBtn.innerText = "Edit Past Attendance";
    });
}

window.setAttRow = (btn, status) => {
    const row = btn.closest('tr');
    row.querySelectorAll('.btn-att').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    row.querySelector('.att-status-val').value = status;
};

if(saveAttBtn) {
    saveAttBtn.addEventListener('click', async () => {
        const date = document.getElementById('attDate').value;
        let session = document.getElementById('attSession').value;
        
        if(!date || !session) return alert("Select date and session.");
        
        saveAttBtn.disabled = true;
        saveAttBtn.innerText = "Saving...";
        
        try {
            const rows = document.getElementById('attendanceGridBody').querySelectorAll('tr');
            for(let row of rows) {
                const sid = row.getAttribute('data-sid');
                const status = row.querySelector('.att-status-val').value;
                const docId = row.querySelector('.att-doc-id').value;
                
                const attData = {
                    date,
                    sessionName: session,
                    status,
                    markedBy: auth.currentUser.uid,
                    timestamp: new Date().toISOString()
                };

                if (docId) {
                    await updateDoc(doc(db, `users/${sid}/attendance`, docId), attData);
                } else {
                    await addDoc(collection(db, `users/${sid}/attendance`), attData);
                }
            }
            alert("Attendance Saved!");
            document.getElementById('attendanceGridTable').classList.add('hidden');
            saveAttBtn.classList.add('hidden');
            if(delAttBtn) delAttBtn.classList.add('hidden');
            saveAttBtn.disabled = false;
            saveAttBtn.innerText = "Submit Attendance";
            
            // Refresh marked dates cache
            if(typeof fetchMarkedDates === 'function') fetchMarkedDates();
        } catch (err) { 
            alert(err.message); 
            saveAttBtn.disabled = false;
            saveAttBtn.innerText = "Submit Attendance";
        }
    });
}

if(delAttBtn) {
    delAttBtn.addEventListener('click', async () => {
        if(!confirm("Are you sure you want to completely DELETE this attendance record for all shown students? This cannot be undone.")) return;
        
        delAttBtn.disabled = true;
        delAttBtn.innerText = "Deleting...";

        try {
            const rows = document.getElementById('attendanceGridBody').querySelectorAll('tr');
            for(let row of rows) {
                const sid = row.getAttribute('data-sid');
                const docId = row.querySelector('.att-doc-id').value;
                if (docId) {
                    await deleteDoc(doc(db, `users/${sid}/attendance`, docId));
                }
            }
            alert("Attendance Record Deleted!");
            document.getElementById('attendanceGridTable').classList.add('hidden');
            saveAttBtn.classList.add('hidden');
            delAttBtn.classList.add('hidden');
            
            // Refresh marked dates cache
            if(typeof fetchMarkedDates === 'function') fetchMarkedDates();
        } catch(err) {
            alert(err.message);
        }
        delAttBtn.disabled = false;
        delAttBtn.innerText = "Delete This Record";
    });
}

if (downloadAttPdfBtn) {
    downloadAttPdfBtn.addEventListener('click', () => {
        const date = document.getElementById('attDate').value || new Date().toISOString().split('T')[0];
        const session = document.getElementById('attSession').value || 'Session';
        const batch = document.getElementById('attBatch').value || 'Batch';
        
        const table = document.getElementById('attendanceGridTable');
        if (!table || table.classList.contains('hidden')) return alert("No attendance grid visible.");
        
        const clone = table.cloneNode(true);
        const rows = clone.querySelectorAll('tbody tr');
        rows.forEach(r => {
            const statusVal = r.querySelector('.att-status-val')?.value || 'present';
            const actionTd = r.querySelector('.att-actions');
            if (actionTd) {
                let color = '#333';
                if (statusVal === 'present') color = '#2ecc71';
                else if (statusVal === 'absent') color = '#e74c3c';
                else if (statusVal === 'absent_reason' || statusVal === 'leave') color = '#f1c40f';
                actionTd.innerHTML = `<strong style="color: ${color}; text-transform: uppercase;">${statusVal}</strong>`;
            }
        });
        
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div style="padding: 20px; font-family: sans-serif; color: #333;">
                <h2 style="text-align:center; color: #111;">Attendance List</h2>
                <div style="margin-bottom: 20px; font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 10px;">
                    <p><strong>Date:</strong> ${date}</p>
                    <p><strong>Session:</strong> ${session}</p>
                    <p><strong>Batch:</strong> ${batch}</p>
                </div>
            </div>
        `;
        // Ensure table styling for PDF
        clone.style.width = '100%';
        clone.style.borderCollapse = 'collapse';
        clone.querySelectorAll('th, td').forEach(cell => {
            cell.style.border = '1px solid #ccc';
            cell.style.padding = '8px';
            cell.style.textAlign = 'left';
            cell.style.color = '#333';
        });
        
        wrapper.appendChild(clone);
        
        const opt = {
            margin:       10,
            filename:     `Attendance_${batch.replace(/\\s+/g, '_')}_${date}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        downloadAttPdfBtn.disabled = true;
        downloadAttPdfBtn.innerText = "Generating PDF...";
        
        html2pdf().set(opt).from(wrapper).save().then(() => {
            downloadAttPdfBtn.disabled = false;
            downloadAttPdfBtn.innerText = "📥 Download PDF";
        });
    });
}

if (downloadMonthlyAttPdfBtn) {
    downloadMonthlyAttPdfBtn.addEventListener('click', async () => {
        const month = document.getElementById('attMonth').value;
        const session = document.getElementById('attSession').value;
        const batch = document.getElementById('attBatch').value;
        
        if (!month || !session || session === '__ADD_NEW__') {
            return alert("Please select a Subject, Batch, and Month to generate the report.");
        }
        
        downloadMonthlyAttPdfBtn.disabled = true;
        downloadMonthlyAttPdfBtn.innerText = "Gathering Data...";
        
        try {
            const admitted = campusStudents.filter(s => isStatus(s, 'admitted'));
            const students = batch === 'all' ? admitted : admitted.filter(s => s.batch === batch);
            
            if (students.length === 0) {
                throw new Error("No students found for this batch.");
            }
            
            students.sort((a, b) => {
                const rA = parseInt(a.rollNumber) || 99999;
                const rB = parseInt(b.rollNumber) || 99999;
                return rA - rB;
            });
            
            const attendanceData = {};
            const uniqueDates = new Set();
            
            for (const s of students) {
                attendanceData[s.id] = { student: s, records: {} };
                const q = query(
                    collection(db, `users/${s.id}/attendance`),
                    where("sessionName", "==", session)
                );
                const snaps = await getDocs(q);
                snaps.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.date && data.date.startsWith(month)) {
                        uniqueDates.add(data.date);
                        attendanceData[s.id].records[data.date] = data.status;
                    }
                });
            }
            
            const sortedDates = Array.from(uniqueDates).sort();
            
            if (sortedDates.length === 0) {
                throw new Error("No attendance records found for the selected month and subject.");
            }
            
            let tableHtml = `
                <table style="width:100%; border-collapse:collapse; font-size:10px; margin-top:20px;">
                    <thead>
                        <tr>
                            <th style="border:1px solid #ccc; padding:4px; text-align:left; background:#f5f5f5;">Roll No</th>
                            <th style="border:1px solid #ccc; padding:4px; text-align:left; background:#f5f5f5; width:150px;">Name</th>
            `;
            sortedDates.forEach(d => {
                const day = d.split('-')[2];
                tableHtml += `<th style="border:1px solid #ccc; padding:4px; text-align:center; background:#f5f5f5;">${day}</th>`;
            });
            tableHtml += `
                            <th style="border:1px solid #ccc; padding:4px; text-align:center; background:#e8f4f8;">P</th>
                            <th style="border:1px solid #ccc; padding:4px; text-align:center; background:#f8e8e8;">A</th>
                            <th style="border:1px solid #ccc; padding:4px; text-align:center; background:#f5f5f5;">%</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            students.forEach(s => {
                const sData = attendanceData[s.id];
                let pCount = 0;
                let aCount = 0;
                
                let rowHtml = `
                    <tr>
                        <td style="border:1px solid #ccc; padding:4px; font-weight:bold; color:#555;">${escapeHtml(s.rollNumber || '-')}</td>
                        <td style="border:1px solid #ccc; padding:4px;">${escapeHtml(s.fullName || 'Unnamed')}</td>
                `;
                
                sortedDates.forEach(d => {
                    const status = sData.records[d] || '-';
                    let display = '-';
                    let color = '#333';
                    if (status === 'present') { display = 'P'; color = '#2ecc71'; pCount++; }
                    else if (status === 'absent') { display = 'A'; color = '#e74c3c'; aCount++; }
                    else if (status === 'absent_reason' || status === 'leave') { display = 'L'; color = '#f1c40f'; aCount++; }
                    
                    rowHtml += `<td style="border:1px solid #ccc; padding:4px; text-align:center; font-weight:bold; color:${color};">${display}</td>`;
                });
                
                const total = pCount + aCount;
                const pct = total > 0 ? Math.round((pCount / total) * 100) : 0;
                
                rowHtml += `
                        <td style="border:1px solid #ccc; padding:4px; text-align:center; font-weight:bold; background:#e8f4f8; color:#2980b9;">${pCount}</td>
                        <td style="border:1px solid #ccc; padding:4px; text-align:center; font-weight:bold; background:#f8e8e8; color:#c0392b;">${aCount}</td>
                        <td style="border:1px solid #ccc; padding:4px; text-align:center; font-weight:bold; background:#f5f5f5;">${pct}%</td>
                    </tr>
                `;
                tableHtml += rowHtml;
            });
            
            tableHtml += `</tbody></table>`;
            
            const monthParts = month.split('-');
            const dateObj = new Date(monthParts[0], monthParts[1] - 1);
            const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
            
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
                <div style="padding: 20px; font-family: sans-serif; color: #333;">
                    <h2 style="text-align:center; color: #111; margin-bottom:5px;">Monthly Attendance Report</h2>
                    <h3 style="text-align:center; color: #555; margin-top:0;">${monthName}</h3>
                    <div style="margin-top: 20px; font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 10px; display:flex; justify-content:space-between;">
                        <span><strong>Session:</strong> ${session}</span>
                        <span><strong>Batch:</strong> ${batch}</span>
                    </div>
                    ${tableHtml}
                </div>
            `;
            
            const opt = {
                margin:       10,
                filename:     `Monthly_Attendance_${batch.replace(/\s+/g, '_')}_${month}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'mm', format: sortedDates.length > 15 ? 'a3' : 'a4', orientation: 'landscape' }
            };
            
            downloadMonthlyAttPdfBtn.innerText = "Generating PDF...";
            
            await html2pdf().set(opt).from(wrapper).save();
            
        } catch (err) {
            alert(err.message);
        }
        
        downloadMonthlyAttPdfBtn.disabled = false;
        downloadMonthlyAttPdfBtn.innerText = "📥 Download Monthly PDF";
    });
}

// PWA Install Logic
let deferredInstallPrompt = null;
const installAppBtn = document.getElementById('installAppBtn');
const pwaModal = document.getElementById('pwaModal');

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
});

const openPwaModal = () => {
    if (!pwaModal) return;
    pwaModal.classList.add("active");
    pwaModal.setAttribute("aria-hidden", "false");

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    document.getElementById('pwaAndroidInst')?.classList.add("hidden");
    document.getElementById('pwaIosInst')?.classList.add("hidden");
    document.getElementById('pwaGenericInst')?.classList.add("hidden");

    if (deferredInstallPrompt) {
        document.getElementById('pwaAndroidInst')?.classList.remove("hidden");
    } else if (isIos) {
        document.getElementById('pwaIosInst')?.classList.remove("hidden");
    } else {
        document.getElementById('pwaGenericInst')?.classList.remove("hidden");
    }
};

const closePwaModal = () => {
    pwaModal?.classList.remove("active");
    pwaModal?.setAttribute("aria-hidden", "true");
};

installAppBtn?.addEventListener("click", () => {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(() => {
            deferredInstallPrompt = null;
        });
    } else {
        openPwaModal();
    }
});

document.getElementById('closePwaBtn')?.addEventListener("click", closePwaModal);
document.getElementById('pwaInstallActionBtn')?.addEventListener("click", () => {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(() => {
            deferredInstallPrompt = null;
            closePwaModal();
        });
    }
});
pwaModal?.addEventListener("click", (e) => {
    if (e.target === pwaModal) closePwaModal();
});

// --- AUTO IMPORT SCRIPT (Runs Once) ---
setTimeout(async () => {
    if (localStorage.getItem('attendance_imported_v2')) return;
    
    try {
        console.log("Starting Auto Import...");
        const rawData = `1: x, x, x, A, x, x, x, x, x, x, x, x, x, A, x, A, A, A, x
2: x, A, A, A, x, A, A, A, A, A, A, A, A, A, x, A, A, A, P
3: x, A, x, x, x, A, A, A, A, x, A, A, x, A, A, A, A, A, P
4: x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x
5: x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x
6: x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x
7: x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, A
8: x, x, x, x, x, x, x, x, x, P, x, x, x, x, x, x, A, A, A
9: x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, A, A, A, x
10: x, x, x, x, x, x, x, x, P, x, x, x, x, x, x, x, x, x, x
11: x, P, x, x, x, x, x, x, x, x, A, A, P, A, x, x, x, x, x
12: x, x, x, x, P, x, x, x, A, A, A, x, A, x, x, x, x, x, x
13: x, x, x, x, x, x, x, x, P, x, x, x, x, x, x, x, A, x, P
14: x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x
15: x, x, x, x, x, x, x, x, x, x, A, x, A, x, x, A, x, P, A
16: x, A, x, A, A, x, x, x, x, x, x, x, x, x, x, x, P, A, A
17: A, A, x, x, x, x, x, x, P, x, x, x, x, x, x, P, A, x, A
18: A, A, x, x, x, x, x, x, A, x, x, x, x, x, x, x, A, x, P
19: x, x, x, x, x, x, x, x, P, x, x, x, A, x, x, x, x, x, x
20: x, x, x, x, x, x, x, x, A, x, x, x, A, x, x, x, x, x, x
21: A, x, A, x, x, x, x, x, A, P, A, x, P, A, x, x, x, x, x
22: x, x, x, x, P, x, A, A, P, x, x, x, x, x, x, x, x, A, A
23: -, -, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x
24: -, -, x, x, x, x, x, x, x, x, x, x, x, x, P, A, A, A, A
25: x, x, x, A, x, x, x, x, A, x, x, x, x, x, A, A, x, x, x
26: x, A, x, A, x, A, A, A, x, x, x, x, x, x, x, x, P, A, A
27: x, A, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x
28: x, x, x, x, P, x, x, x, x, A, x, x, x, x, x, x, x, x, x
29: x, x, x, x, P, x, x, x, x, A, x, x, x, x, x, x, x, x, x
30: A, P, x, x, x, x, x, x, x, x, x, A, x, x, x, x, x, A, x
31: A, P, x, x, x, x, x, x, x, x, x, P, x, x, x, A, A, x, x
32: x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, P, x
33: x, x, x, x, A, C, x, x, x, P, A, P, x, x, A, x, x, x, x
34: x, x, x, x, x, E, P, x, P, P, A, A, x, x, x, A, x, x, x
35: x, x, x, x, x, P, P, x, A, A, x, A, x, x, x, x, x, x, x
36: x, x, x, x, A, x, x, x, A, x, x, x, x, x, x, x, x, x, x
37: A, A, x, x, A, A, x, x, A, A, A, x, x, x, A, x, x, A, x
38: x, P, P, x, x, x, A, x, x, x, x, A, x, x, x, x, x, x, x
39: x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, A, x
40: x, x, x, x, A, A, A, x, x, x, x, x, x, x, A, x, x, A, x
41: A, A, x, x, A, A, A, x, A, A, A, A, A, x, A, A, A, A, A
42: A, A, x, x, A, A, A, x, A, A, A, A, A, x, A, A, A, A, A
43: x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x
44: x, x, x, x, x, x, x, x, x, x, x, A, x, x, x, x, x, x, x
45: A, x, x, x, x, x, x, x, A, A, A, A, x, x, P, P, A, A, x
46: A, x, x, A, x, x, x, x, A, x, A, A, A, x, A, A, A, A, x
47: x, A, x, x, x, x, x, x, P, x, x, x, x, x, x, A, A, A, A
48: x, x, x, x, x, x, x, x, x, P, x, x, x, x, x, x, x, x, x
49: x, P, x, x, A, A, x, x, x, x, x, x, x, x, x, x, P, A, A
50: A, A, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x
51: x, x, x, x, A, x, x, x, x, x, x, x, x, x, A, x, x, x, x
52: x, A, x, x, A, x, x, x, A, A, x, x, x, x, x, x, x, x, x
53: x, P, x, x, x, x, x, x, A, x, x, x, x, x, x, x, x, A, x
54: x, x, x, P, x, x, x, x, P, x, x, x, x, x, x, x, x, A, A
55: -, x, B, A, x, x, x, x, x, x, x, x, x, x, x, x, x, P, A
56: x, x, P, P, x, x, x, x, x, x, x, x, x, x, x, x, x, P, A
57: x, x, P, P, x, x, x, x, x, x, x, x, x, x, x, x, x, P, A`;
        
        const lines = rawData.split('\n').map(l => l.trim()).filter(l => l);
        const days = [4, 5, 6, 7, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25];
        const yearMonth = "2026-05";

        const attendanceMap = {};
        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length === 2) {
                attendanceMap[parts[0].trim()] = parts[1].split(',').map(m => m.trim());
            }
        }

        const usersSnap = await getDocs(collection(db, "users"));
        const students = [];
        usersSnap.forEach(d => {
            const data = d.data();
            if ((data.role === 'student' || !data.role) && data.status === 'admitted') {
                students.push({ id: d.id, ...data });
            }
        });

        let recordsAdded = 0;
        for (const student of students) {
            const rollNo = parseInt(student.rollNumber);
            if (!rollNo || !attendanceMap[rollNo]) continue;

            const marks = attendanceMap[rollNo];
            for (let i = 0; i < marks.length; i++) {
                if (i >= days.length) break;
                
                const mark = marks[i].toLowerCase();
                if (mark === '-') continue; 
                
                let status = 'present';
                if (mark === 'a') status = 'absent';
                else if (mark !== 'x') status = 'leave';

                const dayStr = days[i].toString().padStart(2, '0');
                const dateStr = `${yearMonth}-${dayStr}`;

                for (const session of ["1st Dars", "2nd Dars"]) {
                    const docId = `${dateStr}_${session.replace(/\s+/g, '')}`;
                    await setDoc(doc(db, `users/${student.id}/attendance`, docId), {
                        date: dateStr,
                        sessionName: session,
                        status: status,
                        markedBy: "auto_import",
                        timestamp: new Date().toISOString()
                    });
                    recordsAdded++;
                }
            }
        }
        
        localStorage.setItem('attendance_imported_v2', 'true');
        alert(`Successfully imported ${recordsAdded} attendance records! You can view them in the Monthly Report now.`);
    } catch (e) {
        console.error("Auto import failed:", e);
    }
}, 5000); // Wait 5 seconds to ensure db is loaded
// --- END AUTO IMPORT SCRIPT ---
