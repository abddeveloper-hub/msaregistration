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
        csv += `"${s.idNumber || 'N/A'}","${s.fullName || 'Unnamed'}","${s.phone || 'N/A'}","${s.batch || 'N/A'}","${s.campus || 'N/A'}"\n`;
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
            <span><strong>${escapeHtml(sName)}</strong> <small style="opacity:0.7">(${sBatch})</small></span>
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
    try {
        const attSnap = await getDocs(collection(db, `users/${uid}/attendance`));
        const total = attSnap.size;
        const present = attSnap.docs.filter(d => d.data().status === 'present').length;
        attPct = total > 0 ? Math.round((present/total)*100) : 0;

        const marksSnap = await getDocs(collection(db, `users/${uid}/marks`));
        const mCount = marksSnap.size;
        const totalM = marksSnap.docs.reduce((acc, d) => acc + parseFloat(d.data().percentage || 0), 0);
        marksAvg = mCount > 0 ? Math.round(totalM / mCount) : 0;
    } catch(e) { console.error("Stats fetch error:", e); }

    body.innerHTML = `
        <div style="display:flex; gap:1rem; margin-bottom:1.5rem; align-items:center;">
            <img src="${escapeHtml(s.photoUrl || '')}" style="width:80px; height:80px; object-fit:cover; border-radius:0.5rem; background:#333;">
            <div>
                <h3 style="margin:0; color:var(--primary);">${escapeHtml(s.fullName || 'N/A')}</h3>
                <p style="margin:0; font-size:0.9rem; color:var(--text-dim);">${escapeHtml(s.idNumber || 'Pending ID')}</p>
            </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
            <div style="text-align:center; padding:1rem; background:var(--glass); border-radius:0.5rem; border:1px solid var(--border);">
                <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase;">Attendance</div>
                <div style="font-size:1.5rem; font-weight:800; color:var(--success);">${attPct}%</div>
            </div>
            <div style="text-align:center; padding:1rem; background:var(--glass); border-radius:0.5rem; border:1px solid var(--border);">
                <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase;">Avg. Marks</div>
                <div style="font-size:1.5rem; font-weight:800; color:var(--primary);">${marksAvg}%</div>
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
                    idNumber: `MSA UKKUDA-${shortCampus}-${seq}`,
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
                idNumber: `MSA UKKUDA-${shortCampus}-PENDING`,
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
    
    document.getElementById('editStuIdNumber').value = s.idNumber || '';
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
                idNumber: document.getElementById('editStuIdNumber').value,
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
            <td style="color:var(--primary); font-weight:bold;">${escapeHtml(s.idNumber || 'N/A')}</td>
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
    admitted.forEach(s => stuOpts += `<option value="${s.id}">${escapeHtml(s.fullName || 'Unnamed')} (${escapeHtml(s.idNumber || 'No ID')})</option>`);
    
    const sm = document.getElementById('markStudent');
    const rm = document.getElementById('remStudent');
    if(sm) sm.innerHTML = stuOpts;
    if(rm) rm.innerHTML = stuOpts;

    // 2. Subjects dropdown (Dynamic Filtering)
    const renderSubjectOpts = (targetEl, filterBatch = 'All') => {
        if (!targetEl) return;
        let subOpts = '<option value="" disabled selected>Select Subject...</option>';
        subOpts += '<option value="1st Dars">1st Dars</option>';
        subOpts += '<option value="2nd Dars">2nd Dars</option>';
        
        campusSubjects.forEach(sub => {
            const sName = typeof sub === 'string' ? sub : sub.name;
            const sBatch = sub.batch || 'All';
            
            // Show if it's a legacy string subject, or if batch matches, or if it's 'All'
            if (sName !== '1st Dars' && sName !== '2nd Dars') {
                if (filterBatch === 'all' || filterBatch === 'All' || sBatch === 'All' || sBatch === filterBatch) {
                    subOpts += `<option value="${escapeHtml(sName)}">${escapeHtml(sName)} ${sBatch !== 'All' ? `(${sBatch})` : ''}</option>`;
                }
            }
        });
        subOpts += '<option value="__ADD_NEW__">+ Add New Subject...</option>';
        targetEl.innerHTML = subOpts;
    };

    const marksSub = document.getElementById('markSubject');
    const attSub = document.getElementById('attSession');
    const attBatch = document.getElementById('attBatch')?.value || 'All';
    
    renderSubjectOpts(marksSub, 'All'); // Marks shows all by default
    renderSubjectOpts(attSub, attBatch); // Attendance filters by selected batch
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
}

// Refresh subjects when attendance batch changes
document.getElementById('attBatch')?.addEventListener('change', updateSelects);

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
const saveAttBtn = document.getElementById('saveAttendanceBtn');
let currentAttStudents = [];

if (loadAttBtn) {
    loadAttBtn.addEventListener('click', () => {
        const batch = document.getElementById('attBatch').value;
        const admitted = campusStudents.filter(s => isStatus(s, 'admitted'));
        currentAttStudents = batch === 'all' ? admitted : admitted.filter(s => s.batch === batch);
        
        if(currentAttStudents.length === 0) return alert("No students found for this batch.");
        
        currentAttStudents.sort((a, b) => {
            const rA = parseInt(a.rollNumber) || 99999;
            const rB = parseInt(b.rollNumber) || 99999;
            return rA - rB;
        });
        
        const tbody = document.getElementById('attendanceGridBody');
        tbody.innerHTML = '';
        currentAttStudents.forEach(s => {
            tbody.innerHTML += `
                <tr data-sid="${s.id}">
                    <td style="color:var(--text-dim); font-weight:bold;">${escapeHtml(s.rollNumber || '-')}</td>
                    <td>${escapeHtml(s.fullName || 'Unnamed')}</td>
                    <td>${escapeHtml(s.batch || 'N/A')}</td>
                    <td class="att-actions">
                        <div style="display:flex; gap:0.5rem;">
                            <button class="btn-att btn-p" onclick="setAttRow(this, 'present')">P</button>
                            <button class="btn-att btn-a" onclick="setAttRow(this, 'absent')">A</button>
                            <button class="btn-att btn-l" onclick="setAttRow(this, 'absent_reason')">L</button>
                        </div>
                        <input type="hidden" class="att-status-val" value="present">
                    </td>
                </tr>
            `;
        });
        document.getElementById('attendanceGridTable').classList.remove('hidden');
        saveAttBtn.classList.remove('hidden');
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
                await addDoc(collection(db, `users/${sid}/attendance`), {
                    date,
                    sessionName: session,
                    status,
                    markedBy: auth.currentUser.uid,
                    timestamp: new Date().toISOString()
                });
            }
            alert("Attendance Saved!");
            document.getElementById('attendanceGridTable').classList.add('hidden');
            saveAttBtn.classList.add('hidden');
            saveAttBtn.disabled = false;
            saveAttBtn.innerText = "Submit Attendance";
        } catch (err) { 
            alert(err.message); 
            saveAttBtn.disabled = false;
            saveAttBtn.innerText = "Submit Attendance";
        }
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
