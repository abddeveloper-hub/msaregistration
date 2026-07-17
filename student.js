import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, collection, onSnapshot, query, where, addDoc, enableMultiTabIndexedDbPersistence, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";



const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
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

// DOM Elements
const logoutBtn = document.getElementById('logoutBtn');
const submitRegBtn = document.getElementById('submitRegBtn');
const editProfileBtn = document.getElementById('editProfileBtn');

let myStudents = [];
let activeStudentId = null;
let profileSnapUnsub = null;
let base64Photo = null;
let currentUserData = null; // To store the logged-in user's profile
let pendingCampusSelection = null;

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

function selectCampusFromData(data) {
    const select = document.getElementById('stuCampus');
    if (!select || !data) return;

    const campusId = String(data.campusId || '').trim();
    const campusName = String(data.campus || '').trim();
    const match = Array.from(select.options).find(opt => {
        return (campusId && opt.value === campusId) ||
            (campusName && normalizeText(opt.dataset?.name) === normalizeText(campusName)) ||
            (campusName && opt.value === campusName);
    });

    if (match) select.value = match.value;
}

function getSelectedCampus() {
    const select = document.getElementById('stuCampus');
    const opt = select?.options?.[select.selectedIndex];
    return {
        id: String(select?.value || '').trim(),
        name: String(opt?.dataset?.name || opt?.textContent?.replace(/\s*\([^)]*\)\s*$/, '') || '').trim()
    };
}

function setInputValue(id, value) {
    const input = document.getElementById(id);
    if (input && value !== undefined && value !== null) input.value = value;
}

// Wizard Logic
window.nextWizardStep = function(step) {
    // Basic validation before moving
    if (step === 2) {
        const requiredIds = ['stuName', 'stuUsername', 'stuDob', 'stuBlood', 'stuPhone', 'stuAadhar', 'stuFatherName', 'stuFatherPhone', 'stuAddress'];
        for (let id of requiredIds) {
            const el = document.getElementById(id);
            if (el && !el.value) {
                alert("Please fill all required fields in this step.");
                el.focus();
                return;
            }
        }
    } else if (step === 3) {
        const stuSchoolLevel = document.getElementById('stuSchoolLevel');
        if (stuSchoolLevel && !stuSchoolLevel.value) {
            alert("Please select a schooling level.");
            stuSchoolLevel.focus();
            return;
        }
    }

    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    document.getElementById('wizardStep' + step).classList.add('active');
    
    document.querySelectorAll('.wizard-step-indicator').forEach((ind, index) => {
        if (index + 1 < step) {
            ind.classList.add('completed');
            ind.classList.remove('active');
        } else if (index + 1 === step) {
            ind.classList.add('active');
            ind.classList.remove('completed');
        } else {
            ind.classList.remove('active');
            ind.classList.remove('completed');
        }
    });
};

window.prevWizardStep = function(step) {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
    document.getElementById('wizardStep' + step).classList.add('active');
    
    document.querySelectorAll('.wizard-step-indicator').forEach((ind, index) => {
        if (index + 1 < step) {
            ind.classList.add('completed');
            ind.classList.remove('active');
        } else if (index + 1 === step) {
            ind.classList.add('active');
            ind.classList.remove('completed');
        } else {
            ind.classList.remove('active');
            ind.classList.remove('completed');
        }
    });
};

// Auth State
let parentDocUnsub = null;
let studentsSnapUnsub = null;
let notifUnsub = null;

onAuthStateChanged(auth, async (user) => {
    const splash = document.getElementById("appSplashScreen");
    if (splash) splash.classList.add("hidden");

    // Cleanup previous listeners
    if (parentDocUnsub) { parentDocUnsub(); parentDocUnsub = null; }
    if (studentsSnapUnsub) { studentsSnapUnsub(); studentsSnapUnsub = null; }
    if (notifUnsub) { notifUnsub(); notifUnsub = null; }

    if (user) {
        // Fetch parent user profile
        parentDocUnsub = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists()) {
                currentUserData = docSnap.data();
            }
        });

        // Listen for all students registered by this user
        const q = query(collection(db, "users"), where("parentUid", "==", user.uid));
        studentsSnapUnsub = onSnapshot(q, (snapshot) => {
            myStudents = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            renderAccountDashboard();
        }, (error) => {
            console.error("Student list failed:", error);
            const loading = document.getElementById('studentsLoadingMsg');
            const noStudents = document.getElementById('noStudentsMsg');
            if (loading) {
                loading.classList.remove('hidden');
                loading.innerHTML = '<h3>Unable to load students</h3><p></p>';
                const msg = loading.querySelector('p');
                if (msg) msg.innerText = error.message;
            }
            noStudents?.classList.add('hidden');
        });

        // Listen for notifications
        const notifQuery = query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(20));
        notifUnsub = onSnapshot(notifQuery, (snapshot) => {
            const container = document.getElementById('notificationsContainer');
            const noMsg = document.getElementById('noNotificationsMsg');
            const badge = document.getElementById('navNotifBadge');
            
            if (!container) return;
            
            if (snapshot.empty) {
                container.innerHTML = '';
                if (noMsg) noMsg.classList.remove('hidden');
                if (badge) badge.style.display = 'none';
                return;
            }
            
            if (noMsg) noMsg.classList.add('hidden');
            let unreadCount = 0;
            
            // Handle new notifications (toast)
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    // Check if it's a truly new notification (within last 5 mins) to avoid spamming toasts on initial load
                    const data = change.doc.data();
                    const notifTime = new Date(data.timestamp).getTime();
                    const now = new Date().getTime();
                    if (now - notifTime < 5 * 60 * 1000) {
                        showToast(data.title, data.body);
                    }
                }
            });

            container.innerHTML = snapshot.docs.map((doc, index) => {
                const data = doc.data();
                if (index < 3) unreadCount++; // Simple mock: treat top 3 as unread, or real logic if we store read states
                const d = new Date(data.timestamp);
                return `
                    <div class="portal-card" style="border-left: 4px solid var(--primary); padding: 1rem;">
                        <h4 style="color: var(--text-main); margin-bottom: 0.5rem; display: flex; justify-content: space-between;">
                            ${data.title}
                            <span style="font-size: 0.75rem; color: var(--text-dim); font-weight: normal;">${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </h4>
                        <p style="color: var(--text); font-size: 0.9rem;">${data.body}</p>
                    </div>
                `;
            }).join('');
            
            if (badge) {
                if (unreadCount > 0) {
                    badge.style.display = 'inline-block';
                    badge.innerText = unreadCount;
                } else {
                    badge.style.display = 'none';
                }
            }
        });

    } else {
        window.location.href = "index.html";
    }
});

function showToast(title, body) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: var(--surface);
        border: 1px solid var(--border);
        border-left: 4px solid var(--primary);
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        min-width: 250px;
        max-width: 350px;
        animation: slideInRight 0.3s ease forwards;
        position: relative;
        overflow: hidden;
    `;
    
    toast.innerHTML = `
        <h4 style="margin-bottom: 5px; color: var(--text-main); font-size: 0.95rem;">${title}</h4>
        <p style="color: var(--text); font-size: 0.85rem; margin: 0;">${body}</p>
        <button style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 1.2rem; line-height: 1;">&times;</button>
    `;
    
    toast.querySelector('button').onclick = () => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    };
    
    container.appendChild(toast);
    
    // Request Native Notification Permission
    if ("Notification" in window) {
        if (Notification.permission === "granted") {
            new Notification(title, { body: body, icon: "logo.png" });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification(title, { body: body, icon: "logo.png" });
                }
            });
        }
    }
    
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

// Add some keyframes for the toast animation
const style = document.createElement('style');
style.innerHTML = \`
@keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
@keyframes slideOutRight {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
}
\`;
document.head.appendChild(style);

function renderAccountDashboard() {
    const container = document.getElementById('studentListContainer');
    const noStudents = document.getElementById('noStudentsMsg');
    const loading = document.getElementById('studentsLoadingMsg');
    if(!container) return;

    container.innerHTML = '';
    loading?.classList.add('hidden');
    if(myStudents.length === 0) {
        noStudents?.classList.remove('hidden');
        if(noStudents) noStudents.innerHTML = '<div class="empty-state-card"><div class="icon">🎓</div><h3>No Students Registered</h3><p>You haven\'t registered any students yet. Start a new application!</p></div>';
    } else {
        noStudents?.classList.add('hidden');
        myStudents.forEach(s => {
            const card = document.createElement('div');
            card.className = 'form-section';
            card.style.cursor = 'pointer';
            card.style.transition = '0.2s';
            card.innerHTML = `
                <div style="display:flex; gap:1rem; align-items:center; margin-bottom:1rem;">
                    <img src="${s.photoUrl || ''}" style="width:50px; height:50px; border-radius:50%; background:#333; object-fit:cover;">
                    <div style="flex:1">
                        <h4 style="margin:0; color:var(--primary);">${s.fullName}</h4>
                        <p style="margin:0; font-size:0.8rem; color:var(--text-dim);">${s.username || 'ID: ' + s.id.substring(0,6)}</p>
                    </div>
                    <span class="badge" style="background:${s.status === 'admitted' ? 'var(--success-glow)' : 'var(--primary-glow)'}; color:${s.status === 'admitted' ? 'var(--success)' : 'var(--primary)'}; font-size:0.7rem;">
                        ${s.status || 'Pending'}
                    </span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; padding-top:0.75rem; border-top:1px solid var(--border);">
                    <div id="summary_att_${s.id}" style="color:var(--success);">Attendance: ...</div>
                    <div id="summary_marks_${s.id}" style="color:var(--primary);">Avg. Marks: ...</div>
                </div>
            `;
            card.onclick = () => showStudentDetail(s.id);
            container.appendChild(card);
            
            // Fetch summary stats for this card
            loadStudentSummary(s.id);
        });
    }
}

async function loadStudentSummary(sid) {
    try {
        const attSnap = await getDocs(collection(db, `users/${sid}/attendance`));
        const total = attSnap.size;
        const present = attSnap.docs.filter(d => d.data().status === 'present').length;
        const attPct = total > 0 ? Math.round((present/total)*100) : 0;
        const attEl = document.getElementById(`summary_att_${sid}`);
        if(attEl) attEl.innerText = `Attendance: ${attPct}%`;

        const marksSnap = await getDocs(collection(db, `users/${sid}/marks`));
        const mCount = marksSnap.size;
        const totalM = marksSnap.docs.reduce((acc, d) => acc + parseFloat(d.data().percentage || 0), 0);
        const marksAvg = mCount > 0 ? Math.round(totalM / mCount) : 0;
        const marksEl = document.getElementById(`summary_marks_${sid}`);
        if(marksEl) marksEl.innerText = `Avg. Marks: ${marksAvg}%`;
    } catch(e) { console.warn("Summary fetch error:", e); }
}

// Sync Nav UI
function syncNav(target) {
    document.querySelectorAll('.nav-item, .m-nav-item').forEach(n => {
        const isMatch = n.id === target || n.innerText.includes(target) || (target === 'Home' && n.id === 'navHome');
        n.classList.toggle('active', isMatch);
    });
}

window.showAccountDashboard = () => {
    document.querySelectorAll('.main-content > div').forEach(v => v.classList.add('hidden'));
    document.getElementById('viewAccountDashboard').classList.remove('hidden');
    syncNav('navHome');
    activeStudentId = null;
    if(profileSnapUnsub) { profileSnapUnsub(); profileSnapUnsub = null; }
};

window.showNewStudentForm = () => {
    document.querySelectorAll('.main-content > div').forEach(v => v.classList.add('hidden'));
    document.getElementById('viewRegistration').classList.remove('hidden');
    syncNav('navNewStudent');
    document.getElementById('registrationForm').reset();
    base64Photo = null;
    if (window.nextWizardStep) window.nextWizardStep(1);
};

// Nav Click Handlers
document.getElementById('navHome')?.addEventListener('click', showAccountDashboard);
document.getElementById('navNewStudent')?.addEventListener('click', showNewStudentForm);
const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
if(mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', () => signOut(auth));

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => signOut(auth));
}

const downloadIdBtn = document.getElementById('downloadIdBtn');
if (downloadIdBtn) {
    downloadIdBtn.addEventListener('click', () => {
        const idCard = document.querySelector('.id-card');
        if (!idCard) return;
        
        // Simple print approach which is most compatible on mobile
        const originalContent = document.body.innerHTML;
        const printContent = `
            <html>
            <head>
                <title>Student ID Card</title>
                <style>
                    body { background: white; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: sans-serif; }
                    .id-card { 
                        width: 400px; padding: 2rem; border: 1px solid #ddd; border-radius: 1rem; 
                        background: linear-gradient(135deg, #1e3a8a, #111b27); color: white;
                        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                        text-align: center;
                    }
                    .id-header { margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 0.5rem; }
                    .id-photo { width: 120px; height: 120px; border-radius: 1rem; object-fit: cover; border: 2px solid rgba(255,255,255,0.3); margin: 1rem auto; display: block; }
                    .id-details { text-align: left; margin: 1.5rem 0; font-size: 0.9rem; }
                    .id-details p { display: flex; justify-content: space-between; margin: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
                    .id-number { font-size: 1.5rem; font-weight: 800; color: #fbbf24; margin-top: 1rem; letter-spacing: 0.1em; }
                </style>
            </head>
            <body>
                <div class="id-card">${idCard.innerHTML}</div>
            </body>
            </html>
        `;
        
        const printIframe = document.createElement('iframe');
        printIframe.style.position = 'absolute';
        printIframe.style.width = '0';
        printIframe.style.height = '0';
        printIframe.style.border = 'none';
        document.body.appendChild(printIframe);
        
        printIframe.contentDocument.write(printContent);
        printIframe.contentDocument.close();
        
        setTimeout(() => {
            printIframe.contentWindow.focus();
            printIframe.contentWindow.print();
            setTimeout(() => {
                if (document.body.contains(printIframe)) {
                    document.body.removeChild(printIframe);
                }
            }, 2000);
        }, 500);
    });
}

// Load Campuses
onSnapshot(collection(db, "institutions"), (snapshot) => {
    const select = document.getElementById('stuCampus');
    if (select) {
        select.innerHTML = '<option value="" disabled selected>Select Off-Campus</option>';
        snapshot.forEach(docSnap => {
            const inst = docSnap.data();
            const opt = document.createElement('option');
            opt.value = docSnap.id; // stable id
            opt.dataset.name = inst.name || '';
            opt.textContent = `${inst.name} (${inst.regNumber || 'N/A'})`;
            select.appendChild(opt);
        });

        selectCampusFromData(pendingCampusSelection || currentUserData);
    }
});

// Dynamic Form Logic
const stuDarsType = document.getElementById('stuDarsType');
const stuDarsDetails = document.getElementById('stuDarsDetails');
if (stuDarsType) {
    stuDarsType.addEventListener('change', (e) => {
        stuDarsDetails.classList.remove('hidden');
        if(e.target.value === 'new') {
            stuDarsDetails.placeholder = "How much madrasa have you studied?";
        } else {
            stuDarsDetails.placeholder = "Previous institution details";
        }
    });
}

const stuSchoolLevel = document.getElementById('stuSchoolLevel');
const schoolFieldsContainer = document.getElementById('schoolFieldsContainer');
if (stuSchoolLevel) {
    stuSchoolLevel.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) {
            schoolFieldsContainer.classList.add('hidden');
            schoolFieldsContainer.innerHTML = '';
            return;
        }
        schoolFieldsContainer.classList.remove('hidden');
        let html = '';
        if (val === 'below10') {
            html = `<div class="input-field"><label class="label">Which class are you studying in?</label><input type="text" id="schoolClass" class="input" required></div>`;
        } else if (val === 'sslc') {
            html = `
                <div class="input-field"><label class="label">SSLC Percentage</label><input type="text" id="schoolSslcPercent" class="input" required></div>
                <div class="input-field"><label class="label">Where did you complete SSLC?</label><input type="text" id="schoolSslcWhere" class="input" required></div>
            `;
        } else if (val === 'puc') {
            html = `
                <div class="input-field"><label class="label">SSLC Percentage</label><input type="text" id="schoolSslcPercent" class="input" required></div>
                <div class="input-field"><label class="label">PUC Percentage</label><input type="text" id="schoolPucPercent" class="input" required></div>
                <div class="input-field" style="grid-column: span 2"><label class="label">Where did you complete PUC?</label><input type="text" id="schoolPucWhere" class="input" required></div>
            `;
        } else if (val === 'degree') {
            html = `
                <div class="input-field"><label class="label">Which Degree?</label><input type="text" id="schoolDegreeWhich" class="input" required></div>
                <div class="input-field"><label class="label">Where are you studying/completed?</label><input type="text" id="schoolDegreeWhere" class="input" required></div>
            `;
        }
        schoolFieldsContainer.innerHTML = html;
    });
}

// Photo Upload
const photoInput = document.getElementById('stuPhotoFile');
if (photoInput) {
    photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => base64Photo = ev.target.result;
            reader.readAsDataURL(file);
        }
    });
}

// Submit Registration
const regForm = document.getElementById('registrationForm');
if (regForm) {
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        submitRegBtn.disabled = true;
        submitRegBtn.innerText = "Submitting...";

        try {
            // Gather school info
            const schoolLevel = document.getElementById('stuSchoolLevel').value;
            let schoolInfo = { level: schoolLevel };
            if(schoolLevel === 'below10') schoolInfo.class = document.getElementById('schoolClass')?.value;
            if(schoolLevel === 'sslc') {
                schoolInfo.sslcPercent = document.getElementById('schoolSslcPercent')?.value;
                schoolInfo.sslcWhere = document.getElementById('schoolSslcWhere')?.value;
            }
            if(schoolLevel === 'puc') {
                schoolInfo.sslcPercent = document.getElementById('schoolSslcPercent')?.value;
                schoolInfo.pucPercent = document.getElementById('schoolPucPercent')?.value;
                schoolInfo.pucWhere = document.getElementById('schoolPucWhere')?.value;
            }
            if(schoolLevel === 'degree') {
                schoolInfo.degreeWhich = document.getElementById('schoolDegreeWhich')?.value;
                schoolInfo.degreeWhere = document.getElementById('schoolDegreeWhere')?.value;
            }

            const selectedCampus = getSelectedCampus();
            if (!selectedCampus.id || !selectedCampus.name) {
                throw new Error("Please select a valid off-campus institution.");
            }

            const payload = {
                fullName: document.getElementById('stuName').value,
                username: document.getElementById('stuUsername').value,
                dob: document.getElementById('stuDob').value,
                bloodGroup: document.getElementById('stuBlood').value,
                phone: document.getElementById('stuPhone').value,
                aadhar: document.getElementById('stuAadhar').value,
                fatherName: document.getElementById('stuFatherName').value,
                fatherPhone: document.getElementById('stuFatherPhone').value,
                address: document.getElementById('stuAddress').value,
                isSayyid: document.getElementById('stuSayyid').value,
                isHafiz: document.getElementById('stuHafiz').value,
                isOrphan: document.getElementById('stuOrphan').value,
                darsType: document.getElementById('stuDarsType').value,
                darsDetails: document.getElementById('stuDarsDetails').value,
                schoolInfo: schoolInfo,
                campus: selectedCampus.name,
                campusId: selectedCampus.id,
                batch: document.getElementById('stuBatch').value,
                rollNumber: document.getElementById('stuRollNumber')?.value || '',
                updatedAt: new Date().toISOString()
            };

            if (base64Photo) payload.photoUrl = base64Photo;

            if (activeStudentId) {
                await updateDoc(doc(db, "users", activeStudentId), payload);
                alert("Application updated!");
            } else {
                payload.parentUid = auth.currentUser.uid;
                payload.role = 'student';
                payload.status = 'pending';
                payload.createdAt = new Date().toISOString();
                await addDoc(collection(db, "users"), payload);
                alert("Registration submitted successfully!");
            }
            
            showAccountDashboard();
            // View will auto-update via onSnapshot
        } catch (error) {
            console.error(error);
            alert("Error submitting: " + error.message);
        } finally {
            submitRegBtn.disabled = false;
            submitRegBtn.innerText = "Submit Registration";
        }
    });
}

function showStudentDetail(studentId) {
    activeStudentId = studentId;
    document.querySelectorAll('.main-content > div').forEach(v => v.classList.add('hidden'));
    const detailView = document.getElementById('viewStudentDetail');
    detailView.classList.remove('hidden');

    if(profileSnapUnsub) profileSnapUnsub();
    
    profileSnapUnsub = onSnapshot(doc(db, "users", studentId), (snap) => {
        if(!snap.exists()) return;
        const data = snap.data();
        
        document.getElementById('detailStudentName').innerText = data.fullName;
        document.getElementById('detailStudentStatus').innerText = "Status: " + (data.status || 'Pending');

        const editBtn = document.getElementById('editProfileBtn');
        if (editBtn) {
            editBtn.onclick = () => {
                showNewStudentForm();
                prefillForm(data);
                activeStudentId = studentId; // Re-set because showNewStudentForm resets it
                document.getElementById('submitRegBtn').innerText = "Update Application";
            };
        }

        if(data.status === 'admitted') {
            document.getElementById('pendingStatusSection').classList.add('hidden');
            document.getElementById('admittedDetailSection').classList.remove('hidden');
            const idBtn = document.getElementById('generateIdCardBtn');
            if (idBtn) idBtn.style.display = 'block';
            renderAdmittedDashboard(data, studentId);
        } else {
            document.getElementById('admittedDetailSection').classList.add('hidden');
            document.getElementById('pendingStatusSection').classList.remove('hidden');
            const idBtn = document.getElementById('generateIdCardBtn');
            if (idBtn) idBtn.style.display = 'none';
        }
    });
}

function prefillForm(data) {
    document.getElementById('stuName').value = data.fullName || '';
    document.getElementById('stuUsername').value = data.username || '';
    document.getElementById('stuDob').value = data.dob || '';
    document.getElementById('stuBlood').value = data.bloodGroup || '';
    document.getElementById('stuPhone').value = data.phone || '';
    document.getElementById('stuAadhar').value = data.aadhar || '';
    document.getElementById('stuFatherName').value = data.fatherName || '';
    document.getElementById('stuFatherPhone').value = data.fatherPhone || '';
    document.getElementById('stuAddress').value = data.address || '';
    document.getElementById('stuSayyid').value = data.isSayyid || 'no';
    document.getElementById('stuHafiz').value = data.isHafiz || 'no';
    document.getElementById('stuOrphan').value = data.isOrphan || 'no';
    document.getElementById('stuDarsType').value = data.darsType || 'new';
    document.getElementById('stuDarsDetails').value = data.darsDetails || '';
    document.getElementById('stuDarsDetails').classList.remove('hidden');
    document.getElementById('stuSchoolLevel').value = data.schoolInfo?.level || '';
    document.getElementById('stuSchoolLevel').dispatchEvent(new Event('change'));
    setInputValue('schoolClass', data.schoolInfo?.class);
    setInputValue('schoolSslcPercent', data.schoolInfo?.sslcPercent);
    setInputValue('schoolSslcWhere', data.schoolInfo?.sslcWhere);
    setInputValue('schoolPucPercent', data.schoolInfo?.schoolPucPercent);
    setInputValue('schoolPucWhere', data.schoolInfo?.schoolPucWhere);
    setInputValue('schoolDegreeWhich', data.schoolInfo?.schoolDegreeWhich);
    setInputValue('schoolDegreeWhere', data.schoolInfo?.schoolDegreeWhere);
    setInputValue('stuRollNumber', data.rollNumber);
    pendingCampusSelection = data;
    selectCampusFromData(data);
    document.getElementById('stuBatch').value = data.batch || '';
    if(data.photoUrl) base64Photo = data.photoUrl;
}

function renderAdmittedDashboard(data, studentId) {
    // Populate ID
    document.getElementById('idPhotoDisplay').src = data.photoUrl || `https://ui-avatars.com/api/?name=${data.fullName}&background=6366f1&color=fff`;
    document.getElementById('idNameDisplay').innerText = data.fullName;
    document.getElementById('idFatherDisplay').innerText = data.fatherName;
    document.getElementById('idDobDisplay').innerText = data.dob;
    document.getElementById('idPhoneDisplay').innerText = data.phone;
    document.getElementById('idCampusDisplay').innerText = data.campus;
    
    const rollDisplay = document.getElementById('idRollNumberDisplay');
    if (rollDisplay) rollDisplay.innerText = data.rollNumber || "PENDING";

    // Fetch Marks - Grouped by Dars Type
    onSnapshot(collection(db, `users/${studentId}/marks`), (snap) => {
        const percentageDisplay = document.getElementById('marksPercentage');
        const countDisplay = document.getElementById('marksCount');
        
        // Separate marks by type
        const marks1stDars = [];
        const marks2ndDars = [];
        const marksOther = [];

        if(!snap.empty) {
            snap.forEach(doc => {
                const m = doc.data();
                if(m.subject === '1st Dars') {
                    marks1stDars.push(m);
                } else if(m.subject === '2nd Dars') {
                    marks2ndDars.push(m);
                } else {
                    marksOther.push(m);
                }
            });
        }

        // Render 1st Dars Marks
        const tbody1st = document.getElementById('marksTableBody1stDars');
        const section1st = document.getElementById('firstDarsSection');
        if(tbody1st) {
            tbody1st.innerHTML = '';
            if(marks1stDars.length === 0) {
                tbody1st.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;">No marks recorded yet.</td></tr>';
                section1st?.classList.add('hidden');
            } else {
                marks1stDars.forEach(m => {
                    tbody1st.innerHTML += `<tr>
                        <td><strong>${m.subject}</strong></td>
                        <td>${m.marksObtained} / ${m.totalMarks}</td>
                        <td><span style="color:var(--primary); font-weight:bold;">${m.percentage}%</span></td>
                        <td>${m.date}</td>
                    </tr>`;
                });
                section1st?.classList.remove('hidden');
            }
        }

        // Render 2nd Dars Marks
        const tbody2nd = document.getElementById('marksTableBody2ndDars');
        const section2nd = document.getElementById('secondDarsSection');
        if(tbody2nd) {
            tbody2nd.innerHTML = '';
            if(marks2ndDars.length === 0) {
                tbody2nd.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;">No marks recorded yet.</td></tr>';
                section2nd?.classList.add('hidden');
            } else {
                marks2ndDars.forEach(m => {
                    tbody2nd.innerHTML += `<tr>
                        <td><strong>${m.subject}</strong></td>
                        <td>${m.marksObtained} / ${m.totalMarks}</td>
                        <td><span style="color:var(--primary); font-weight:bold;">${m.percentage}%</span></td>
                        <td>${m.date}</td>
                    </tr>`;
                });
                section2nd?.classList.remove('hidden');
            }
        }

        // Render Other Subjects Marks
        const tbodyOther = document.getElementById('marksTableBodyOther');
        const sectionOther = document.getElementById('otherSubjectsSection');
        if(tbodyOther) {
            tbodyOther.innerHTML = '';
            if(marksOther.length === 0) {
                tbodyOther.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;">No marks recorded yet.</td></tr>';
                sectionOther?.classList.add('hidden');
            } else {
                marksOther.forEach(m => {
                    tbodyOther.innerHTML += `<tr>
                        <td><strong>${m.subject}</strong></td>
                        <td>${m.marksObtained} / ${m.totalMarks}</td>
                        <td><span style="color:var(--primary); font-weight:bold;">${m.percentage}%</span></td>
                        <td>${m.date}</td>
                    </tr>`;
                });
                sectionOther?.classList.remove('hidden');
            }
        }

        // Update overall percentage (all subjects combined)
        const allMarks = [...marks1stDars, ...marks2ndDars, ...marksOther];
        let totalPercent = 0;
        let examCount = 0;
        allMarks.forEach(m => {
            examCount++;
            totalPercent += parseFloat(m.percentage || 0);
        });

        if(percentageDisplay) percentageDisplay.innerText = examCount > 0 ? `${Math.round(totalPercent / examCount)}%` : '0%';
        if(countDisplay) countDisplay.innerText = `${examCount} exam${examCount > 1 ? 's' : ''}`;
    });

    // Fetch Attendance - Grouped by Dars Type
    onSnapshot(collection(db, `users/${studentId}/attendance`), (snap) => {
        const percentageDisplay = document.getElementById('attPercentage');
        const countDisplay = document.getElementById('attCount');

        // Separate attendance by type
        const att1stDars = [];
        const att2ndDars = [];
        const attOther = [];

        if(!snap.empty) {
            snap.forEach(doc => {
                const a = doc.data();
                if(a.sessionName === '1st Dars') {
                    att1stDars.push(a);
                } else if(a.sessionName === '2nd Dars') {
                    att2ndDars.push(a);
                } else {
                    attOther.push(a);
                }
            });
        }

        // Helper function to render attendance by type
        const renderAttendanceByType = (records, containerId, sectionId) => {
            const container = document.getElementById(containerId);
            const section = document.getElementById(sectionId);
            
            if (!container) return;
            container.innerHTML = '';

            if (records.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:#666;">No attendance records.</p>';
                section?.classList.add('hidden');
                return;
            }

            section?.classList.remove('hidden');

            // Group by month-year
            const monthlyData = {};
            records.forEach(a => {
                let monthYearKey = 'Unknown Date';
                if (a.date) {
                    try {
                        const dateObj = new Date(a.date);
                        if (!isNaN(dateObj)) {
                            monthYearKey = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
                        }
                    } catch(e) {}
                }
                if (!monthlyData[monthYearKey]) {
                    monthlyData[monthYearKey] = [];
                }
                monthlyData[monthYearKey].push(a);
            });

            // Sort keys (newest first)
            const sortedMonths = Object.keys(monthlyData).sort((a, b) => new Date(b) - new Date(a));

            sortedMonths.forEach(month => {
                monthlyData[month].sort((a, b) => new Date(b.date) - new Date(a.date));

                let rowsHtml = '';
                monthlyData[month].forEach(a => {
                    let statusColor = a.status === 'present' ? 'var(--success)' : (a.status === 'absent_reason' || a.status === 'leave' ? 'var(--accent)' : 'var(--error)');
                    rowsHtml += `<tr>
                        <td>${escapeHtml(a.sessionName || 'N/A')}</td>
                        <td>${escapeHtml(a.date || 'N/A')}</td>
                        <td><span style="color:${statusColor}; text-transform:uppercase; font-size:0.8rem; font-weight:bold;">${escapeHtml((a.status || '').replace('_', ' '))}</span></td>
                    </tr>`;
                });

                container.innerHTML += `
                    <div style="background:var(--glass); border:1px solid var(--border); border-radius:0.5rem; overflow:hidden;">
                        <div style="background:rgba(255,255,255,0.05); padding:0.75rem 1rem; border-bottom:1px solid var(--border); font-weight:bold; color:var(--primary);">
                            ${escapeHtml(month)}
                        </div>
                        <table class="data-table" style="margin:0;">
                            <thead><tr><th>Session/Subject</th><th>Date</th><th>Status</th></tr></thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                `;
            });
        };

        // Render each type
        renderAttendanceByType(att1stDars, 'attendanceContainer1stDars', 'firstDarsSection');
        renderAttendanceByType(att2ndDars, 'attendanceContainer2ndDars', 'secondDarsSection');
        renderAttendanceByType(attOther, 'attendanceContainerOther', 'otherSubjectsSection');

        // Update overall statistics
        const allAttendance = [...att1stDars, ...att2ndDars, ...attOther];
        let presentCount = 0;
        let totalCount = allAttendance.length;
        allAttendance.forEach(a => {
            if (a.status === 'present') presentCount++;
        });

        const percent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
        if(percentageDisplay) percentageDisplay.innerText = `${percent}%`;
        if(countDisplay) countDisplay.innerText = `${presentCount}/${totalCount} sessions`;
    });

    // Fetch Remarks
    onSnapshot(collection(db, `users/${studentId}/remarks`), (snap) => {
        const container = document.getElementById('remarksContainer');
        container.innerHTML = '';
        if(snap.empty) {
            container.innerHTML = '<p style="text-align:center;color:#666;">No remarks added.</p>';
            return;
        }
        snap.forEach(doc => {
            const r = doc.data();
            container.innerHTML += `
                <div style="background:var(--glass); border:1px solid var(--border); border-left: 4px solid var(--primary); padding:1rem; border-radius:0.5rem;">
                    <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:0.5rem;">${r.date} - ${r.author}</div>
                    <p>${r.text}</p>
                </div>
            `;
        });
    });
}

// ==========================================
// REAL-TIME MESSAGING LOGIC (STUDENT)
// ==========================================
let currentChatTeacher = null;
let chatUnsub = null;

async function loadTeacherRoster() {
    const roster = document.getElementById('chatRoster');
    if(!roster) return;
    roster.innerHTML = 'Loading teachers...';
    
    try {
        const q = query(collection(db, "users"), where("role", "==", "faculty"));
        const snap = await getDocs(q);
        
        roster.innerHTML = '';
        if(snap.empty) {
            roster.innerHTML = '<div style="padding:1rem; color:var(--text-dim); font-size:0.9rem;">No teachers available.</div>';
            return;
        }
        
        snap.forEach(docSnap => {
            const t = docSnap.data();
            const div = document.createElement('div');
            div.style.cssText = `padding:1rem; border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.2s;`;
            div.innerHTML = `<strong>${escapeHtml(t.fullName || 'Teacher')}</strong>`;
            div.onmouseover = () => div.style.background = 'var(--surface-hover)';
            div.onmouseout = () => div.style.background = '';
            div.onclick = () => loadChat(t);
            roster.appendChild(div);
        });
    } catch(e) {
        console.error("Failed to load teachers", e);
    }
}

function loadChat(teacher) {
    currentChatTeacher = teacher;
    document.getElementById('chatHeader').innerHTML = `Chat with <strong>${escapeHtml(teacher.fullName || 'Teacher')}</strong>`;
    document.getElementById('chatInput').disabled = false;
    document.getElementById('chatSendBtn').disabled = false;
    document.getElementById('chatInput').focus();
    
    if(chatUnsub) chatUnsub();
    
    const myUid = auth.currentUser ? auth.currentUser.uid : (activeStudentId ? activeStudentId : null);
    if(!myUid) return;
    
    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    chatUnsub = onSnapshot(q, (snapshot) => {
        const history = document.getElementById('chatHistory');
        if(!history) return;
        history.innerHTML = '';
        snapshot.forEach(docSnap => {
            const m = docSnap.data();
            if((m.senderUid === myUid && m.receiverUid === teacher.uid) ||
               (m.senderUid === teacher.uid && m.receiverUid === myUid)) {
                
                const isMe = m.senderUid === myUid;
                const align = isMe ? 'flex-end' : 'flex-start';
                const bg = isMe ? 'var(--primary)' : 'var(--glass-heavy)';
                const color = isMe ? 'white' : 'var(--text-main)';
                const dateStr = new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                history.innerHTML += `
                    <div style="align-self:${align}; background:${bg}; color:${color}; padding:0.5rem 1rem; border-radius:1rem; max-width:75%; font-size:0.95rem;">
                        <div style="margin-bottom:0.2rem;">${escapeHtml(m.text)}</div>
                        <div style="font-size:0.65rem; opacity:0.7; text-align:right;">${dateStr}</div>
                    </div>
                `;
            }
        });
        history.scrollTop = history.scrollHeight;
    });
}

document.getElementById('chatSendBtn')?.addEventListener('click', async () => {
    if(!currentChatTeacher) return;
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if(!text) return;
    
    const myUid = auth.currentUser ? auth.currentUser.uid : (activeStudentId ? activeStudentId : null);
    if(!myUid) return;
    
    input.value = '';
    try {
        await addDoc(collection(db, "messages"), {
            senderUid: myUid,
            receiverUid: currentChatTeacher.uid,
            text: text,
            timestamp: Date.now()
        });
    } catch(e) {
        console.error(e);
        if(window.showToast) window.showToast("Failed to send message", "error");
    }
});

document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
    if(e.key === 'Enter') document.getElementById('chatSendBtn').click();
});

// Load roster when navigating to messages
document.querySelector('[data-target="viewMessages"]')?.addEventListener('click', () => {
    loadTeacherRoster();
});

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

// ==========================================
// FEATURE: DIGITAL ID CARD GENERATOR
// ==========================================
window.generateIDCard = async () => {
    if (!activeStudentId || !myStudents) return;
    
    const student = myStudents.find(s => s.id === activeStudentId);
    if (!student) return;
    
    const btn = document.getElementById('generateIdCardBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Generating...';
    btn.disabled = true;

    // Populate the template
    document.getElementById('idCardPhoto').src = student.photoUrl || 'logo.png?v=2';
    document.getElementById('idCardName').innerText = student.fullName || 'Student';
    document.getElementById('idCardRoll').innerText = student.rollNumber || 'N/A';
    document.getElementById('idCardBatch').innerText = student.batch || 'N/A';
    document.getElementById('idCardBlood').innerText = student.bloodGroup || 'N/A';
    document.getElementById('idCardBarcodeText').innerText = student.id || 'UUID-XYZ';

    try {
        const template = document.getElementById('idCardTemplate');
        
        // Use html2canvas
        const canvas = await html2canvas(template, {
            scale: 2, // higher resolution
            backgroundColor: null,
            useCORS: true
        });
        
        // Create download link
        const image = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = image;
        a.download = `MSA_ID_Card_${student.fullName.replace(/\s+/g, '_')}.png`;
        a.click();
        
    } catch (e) {
        console.error("ID Card Generation failed:", e);
        alert("Failed to generate ID card. Please try again.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};
