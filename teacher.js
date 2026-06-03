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

    // Separate sessions by type
    const dars1st = {};
    const dars2nd = {};
    const otherSessions = {};

    Object.entries(sessionStats).forEach(([sName, stat]) => {
        if (sName === '1st Dars') {
            dars1st[sName] = stat;
        } else if (sName === '2nd Dars') {
            dars2nd[sName] = stat;
        } else {
            otherSessions[sName] = stat;
        }
    });

    // Calculate attendance % for each type
    const calcAttendancePct = (sessionObj) => {
        let totalRecords = 0;
        let presentRecords = 0;
        Object.values(sessionObj).forEach(stat => {
            totalRecords += stat.total;
            presentRecords += stat.present;
        });
        return totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;
    };

    const att1stPct = calcAttendancePct(dars1st);
    const att2ndPct = calcAttendancePct(dars2nd);
    const attOtherPct = calcAttendancePct(otherSessions);

    const renderBreakdownSection = (sessionObj, title) => {
        if (Object.keys(sessionObj).length === 0) return '';
        
        let html = '';
        if (title) {
            html = `<div style="margin-bottom:1rem;">
                <div style="font-size:0.75rem; font-weight:700; color:var(--primary); text-transform:uppercase; margin-bottom:0.5rem; padding-bottom:0.25rem; border-bottom:1px solid var(--border);">${title}</div>`;
        }
        
        Object.entries(sessionObj).forEach(([sName, stat]) => {
            const sPct = stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0;
            html += `
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
        
        if (title) {
            html += '</div>';
        }
        return html;
    };

    let breakdownHtml = '';
    if (Object.keys(sessionStats).length === 0) {
        breakdownHtml = '<p style="color:var(--text-dim); font-size:0.85rem; margin:0; text-align:center;">No attendance records found.</p>';
    } else {
        breakdownHtml += renderBreakdownSection(dars1st, '1st Dars');
        breakdownHtml += renderBreakdownSection(dars2nd, '2nd Dars');
        breakdownHtml += renderBreakdownSection(otherSessions, 'Other Subjects');
    }

    body.innerHTML = `
        <!-- Student Header -->
        <div style="display:flex; gap:1.5rem; margin-bottom:2rem; align-items:center; padding:1.5rem; background:linear-gradient(135deg, rgba(251,191,36,0.1), rgba(100,200,255,0.1)); border-radius:0.75rem; border:1px solid var(--border);">
            <img src="${escapeHtml(s.photoUrl || '')}" style="width:100px; height:100px; object-fit:cover; border-radius:0.75rem; background:#333; border:2px solid var(--primary); flex-shrink:0;">
            <div style="flex:1;">
                <h2 style="margin:0 0 0.5rem; font-size:1.5rem; color:var(--primary);">${escapeHtml(s.fullName || 'N/A')}</h2>
                <p style="margin:0 0 0.75rem; font-size:1rem; color:var(--text-dim); font-weight:500;">ID: ${escapeHtml(s.rollNumber || 'Pending')}</p>
                <div style="display:flex; gap:2rem; font-size:0.9rem;">
                    <span style="color:var(--text);"><strong>Batch:</strong> ${escapeHtml(s.batch || 'N/A')}</span>
                    <span style="color:var(--text);"><strong>Dars:</strong> ${escapeHtml(s.darsType || 'N/A')}</span>
                </div>
            </div>
        </div>

        <!-- Attendance Performance Cards -->
        <div style="margin-bottom:2rem;">
            <h3 style="margin:0 0 1rem; color:var(--text); font-size:1.1rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-dim);">📊 Attendance Performance</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:1rem;">
                ${Object.keys(dars1st).length > 0 ? `
                    <div style="padding:1.25rem; background:linear-gradient(135deg, #fbbf2460, #fbbf2420); border-radius:0.75rem; border:1px solid #fbbf24; display:flex; flex-direction:column; align-items:center; text-align:center; transition:all 0.3s ease; cursor:pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px rgba(251,191,36,0.2)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        <div style="font-size:0.8rem; color:#fbbf24; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">📚 1st Dars</div>
                        <div style="font-size:2.2rem; font-weight:900; color:${att1stPct >= 75 ? 'var(--success)' : '#ef4444'}; margin-bottom:0.25rem;">${att1stPct}%</div>
                        <div style="font-size:0.75rem; color:var(--text-dim);">Attendance Rate</div>
                    </div>
                ` : ''}
                ${Object.keys(dars2nd).length > 0 ? `
                    <div style="padding:1.25rem; background:linear-gradient(135deg, #34d39960, #34d39920); border-radius:0.75rem; border:1px solid #34d399; display:flex; flex-direction:column; align-items:center; text-align:center; transition:all 0.3s ease; cursor:pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px rgba(52,211,153,0.2)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        <div style="font-size:0.8rem; color:#34d399; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">📚 2nd Dars</div>
                        <div style="font-size:2.2rem; font-weight:900; color:${att2ndPct >= 75 ? 'var(--success)' : '#ef4444'}; margin-bottom:0.25rem;">${att2ndPct}%</div>
                        <div style="font-size:0.75rem; color:var(--text-dim);">Attendance Rate</div>
                    </div>
                ` : ''}
                ${Object.keys(otherSessions).length > 0 ? `
                    <div style="padding:1.25rem; background:linear-gradient(135deg, #60a5fa60, #60a5fa20); border-radius:0.75rem; border:1px solid #60a5fa; display:flex; flex-direction:column; align-items:center; text-align:center; transition:all 0.3s ease; cursor:pointer;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 16px rgba(96,165,250,0.2)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        <div style="font-size:0.8rem; color:#60a5fa; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">📖 Other Subjects</div>
                        <div style="font-size:2.2rem; font-weight:900; color:${attOtherPct >= 75 ? 'var(--success)' : '#ef4444'}; margin-bottom:0.25rem;">${attOtherPct}%</div>
                        <div style="font-size:0.75rem; color:var(--text-dim);">Attendance Rate</div>
                    </div>
                ` : ''}
                <div style="padding:1.25rem; background:linear-gradient(135deg, rgba(0,0,0,0.2), rgba(0,0,0,0.1)); border-radius:0.75rem; border:1px solid var(--border); display:flex; flex-direction:column; align-items:center; text-align:center;">
                    <div style="font-size:0.8rem; color:var(--text-dim); font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem;">📊 Average Marks</div>
                    <div style="font-size:2.2rem; font-weight:900; color:var(--primary); margin-bottom:0.25rem;">${marksAvg}%</div>
                    <div style="font-size:0.75rem; color:var(--text-dim);">Overall Performance</div>
                </div>
            </div>
        </div>

        <!-- Detailed Attendance Breakdown by Session -->
        <div style="margin-bottom:2rem;">
            <h3 style="margin:0 0 1rem; color:var(--text); font-size:1.1rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-dim);">📋 Attendance Breakdown by Session</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1.5rem;">
                ${Object.keys(dars1st).length > 0 ? `
                    <div style="background:linear-gradient(135deg, #fbbf2410, #fbbf2405); border-radius:0.75rem; padding:1.25rem; border:1px solid #fbbf24; border-left:4px solid #fbbf24;">
                        <div style="font-size:0.85rem; font-weight:700; color:#fbbf24; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid #fbbf2430;">📚 1st Dars Sessions</div>
                        <div style="max-height:160px; overflow-y:auto; padding-right:0.5rem;">
                            ${renderBreakdownSection(dars1st, '')}
                        </div>
                    </div>
                ` : ''}
                ${Object.keys(dars2nd).length > 0 ? `
                    <div style="background:linear-gradient(135deg, #34d39910, #34d39905); border-radius:0.75rem; padding:1.25rem; border:1px solid #34d399; border-left:4px solid #34d399;">
                        <div style="font-size:0.85rem; font-weight:700; color:#34d399; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid #34d39930;">📚 2nd Dars Sessions</div>
                        <div style="max-height:160px; overflow-y:auto; padding-right:0.5rem;">
                            ${renderBreakdownSection(dars2nd, '')}
                        </div>
                    </div>
                ` : ''}
                ${Object.keys(otherSessions).length > 0 ? `
                    <div style="background:linear-gradient(135deg, #60a5fa10, #60a5fa05); border-radius:0.75rem; padding:1.25rem; border:1px solid #60a5fa; border-left:4px solid #60a5fa;">
                        <div style="font-size:0.85rem; font-weight:700; color:#60a5fa; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid #60a5fa30;">📖 Other Subject Sessions</div>
                        <div style="max-height:160px; overflow-y:auto; padding-right:0.5rem;">
                            ${renderBreakdownSection(otherSessions, '')}
                        </div>
                    </div>
                ` : ''}
                ${Object.keys(sessionStats).length === 0 ? `
                    <div style="background:var(--glass); border-radius:0.75rem; padding:2rem; border:1px solid var(--border); grid-column: 1/-1; text-align:center;">
                        <p style="color:var(--text-dim); font-size:0.9rem; margin:0;">📭 No attendance records found for this student.</p>
                    </div>
                ` : ''}
            </div>
        </div>

        <!-- Student Information -->
        <div style="margin-bottom:2rem;">
            <h3 style="margin:0 0 1rem; color:var(--text); font-size:1.1rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-dim);">👤 Personal Information</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:1rem;">
                <div style="padding:1rem; background:var(--glass); border-radius:0.75rem; border:1px solid var(--border);">
                    <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem; font-weight:600;">Father's Name</div>
                    <div style="font-size:0.95rem; color:var(--text);">${escapeHtml(s.fatherName || 'Not provided')}</div>
                </div>
                <div style="padding:1rem; background:var(--glass); border-radius:0.75rem; border:1px solid var(--border);">
                    <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem; font-weight:600;">📱 Phone Number</div>
                    <div style="font-size:0.95rem; color:var(--text);">${escapeHtml(s.phone || 'Not provided')}</div>
                </div>
                <div style="padding:1rem; background:var(--glass); border-radius:0.75rem; border:1px solid var(--border);">
                    <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.5rem; font-weight:600;">🎂 Date of Birth</div>
                    <div style="font-size:0.95rem; color:var(--text);">${escapeHtml(s.dob || 'Not provided')}</div>
                </div>
            </div>
        </div>

        <!-- Education Details -->
        <div style="padding:1.25rem; background:linear-gradient(135deg, rgba(100,200,255,0.1), rgba(100,200,255,0.05)); border-radius:0.75rem; border:1px solid var(--border); border-left:4px solid var(--primary);">
            <h3 style="margin:0 0 1rem; color:var(--text); font-size:1rem; font-weight:600;">📖 Educational Background</h3>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; font-size:0.9rem;">
                <p style="margin:0.5rem 0;"><strong style="color:var(--primary);">School Level:</strong> <span style="color:var(--text);">${escapeHtml(s.schoolInfo?.level || 'Not specified')}</span></p>
                <p style="margin:0.5rem 0;"><strong style="color:var(--primary);">Dars Type:</strong> <span style="color:var(--text);">${escapeHtml(s.darsType || 'Not specified')}</span></p>
            </div>
            <p style="margin:0.75rem 0 0; color:var(--text-dim); font-size:0.85rem;"><strong>📍 Address:</strong> ${escapeHtml(s.address || 'Not provided')}</p>
        </div>
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
        
        const rows = table.querySelectorAll('tbody tr');
        const head = [];
        table.querySelectorAll('thead th').forEach(th => head.push(th.innerText.trim()));
        
        const body = [];
        rows.forEach(r => {
            const cells = r.querySelectorAll('td');
            const rowData = [];
            cells.forEach((td, i) => {
                if (td.classList.contains('att-actions')) {
                    const statusVal = r.querySelector('.att-status-val')?.value || 'present';
                    rowData.push(statusVal.toUpperCase());
                } else {
                    rowData.push(td.innerText.trim());
                }
            });
            body.push(rowData);
        });
        
        downloadAttPdfBtn.disabled = true;
        downloadAttPdfBtn.innerText = "Generating PDF...";

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        
        doc.setFontSize(16);
        doc.text('Attendance List', 105, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Date: ${date}   Session: ${session}   Batch: ${batch}`, 14, 25);
        
        doc.autoTable({
            head: [head],
            body: body,
            startY: 30,
            styles: { fontSize: 9, cellPadding: 3, textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.1 },
            headStyles: { fillColor: [240,240,240], textColor: [0,0,0], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250,250,250] },
        });
        
        doc.save(`Attendance_${batch.replace(/\s+/g,'_')}_${date}.pdf`);
        downloadAttPdfBtn.disabled = false;
        downloadAttPdfBtn.innerText = "📥 Download PDF";
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
                throw new Error("No admitted students found for this selection.");
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
            
            const monthParts = month.split('-');
            const dateObj = new Date(monthParts[0], monthParts[1] - 1);
            const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

            // Build table data for jsPDF autoTable
            const dayLabels = sortedDates.map(d => d.split('-')[2]);
            const head = ['#', 'Name', ...dayLabels, 'P', 'A', '%'];
            
            const body = students.map(s => {
                const sData = attendanceData[s.id];
                let pCount = 0, aCount = 0;
                const dayCells = sortedDates.map(d => {
                    const status = sData.records[d] || '';
                    if (status === 'present') { pCount++; return 'P'; }
                    else if (status === 'absent') { aCount++; return 'A'; }
                    else if (status === 'absent_reason' || status === 'leave') { aCount++; return 'L'; }
                    return '-';
                });
                const total = pCount + aCount;
                const pct = total > 0 ? Math.round((pCount / total) * 100) + '%' : '-';
                return [s.rollNumber || '-', s.fullName || 'Unnamed', ...dayCells, pCount, aCount, pct];
            });

            downloadMonthlyAttPdfBtn.innerText = "Generating PDF...";

            const { jsPDF } = window.jspdf;
            const isLandscape = sortedDates.length > 10;
            const format = sortedDates.length > 20 ? 'a3' : 'a4';
            const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format });

            doc.setFontSize(14);
            doc.text('Monthly Attendance Report', doc.internal.pageSize.getWidth() / 2, 12, { align: 'center' });
            doc.setFontSize(11);
            doc.text(monthName, doc.internal.pageSize.getWidth() / 2, 19, { align: 'center' });
            doc.setFontSize(9);
            doc.text(`Session: ${session}   Batch: ${batch === 'all' ? 'All Batches' : batch}`, 14, 26);

            doc.autoTable({
                head: [head],
                body: body,
                startY: 30,
                styles: { fontSize: 8, cellPadding: 2, textColor: [0,0,0], lineColor: [0,0,0], lineWidth: 0.1, overflow: 'linebreak' },
                headStyles: { fillColor: [230,230,230], textColor: [0,0,0], fontStyle: 'bold', halign: 'center' },
                columnStyles: {
                    0: { cellWidth: 10, halign: 'center' },
                    1: { cellWidth: 40 },
                },
                alternateRowStyles: { fillColor: [248,248,248] },
            });

            doc.save(`Monthly_Attendance_${batch.replace(/\s+/g,'_')}_${month}.pdf`);

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
