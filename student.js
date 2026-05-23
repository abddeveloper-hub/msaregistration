import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, collection, onSnapshot, query, where, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";



const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

// Auth State
let parentDocUnsub = null;
let studentsSnapUnsub = null;

onAuthStateChanged(auth, async (user) => {
    // Cleanup previous listeners
    if (parentDocUnsub) { parentDocUnsub(); parentDocUnsub = null; }
    if (studentsSnapUnsub) { studentsSnapUnsub(); studentsSnapUnsub = null; }

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
    } else {
        window.location.href = "index.html";
    }
});

function renderAccountDashboard() {
    const container = document.getElementById('studentListContainer');
    const noStudents = document.getElementById('noStudentsMsg');
    const loading = document.getElementById('studentsLoadingMsg');
    if(!container) return;

    container.innerHTML = '';
    loading?.classList.add('hidden');
    if(myStudents.length === 0) {
        noStudents?.classList.remove('hidden');
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
            renderAdmittedDashboard(data, studentId);
        } else {
            document.getElementById('admittedDetailSection').classList.add('hidden');
            document.getElementById('pendingStatusSection').classList.remove('hidden');
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
    setInputValue('schoolPucPercent', data.schoolInfo?.pucPercent);
    setInputValue('schoolPucWhere', data.schoolInfo?.pucWhere);
    setInputValue('schoolDegreeWhich', data.schoolInfo?.degreeWhich);
    setInputValue('schoolDegreeWhere', data.schoolInfo?.degreeWhere);
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
    document.getElementById('idNumberDisplay').innerText = data.idNumber || "MSA UKKUDA-PENDING";
    
    const rollDisplay = document.getElementById('idRollNumberDisplay');
    if (rollDisplay) rollDisplay.innerText = data.rollNumber || "Not Assigned";

    // Fetch Marks
    onSnapshot(collection(db, `users/${studentId}/marks`), (snap) => {
        const tbody = document.getElementById('marksTableBody');
        const percentageDisplay = document.getElementById('marksPercentage');
        const countDisplay = document.getElementById('marksCount');
        
        tbody.innerHTML = '';
        if(snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;">No marks recorded yet.</td></tr>';
            if(percentageDisplay) percentageDisplay.innerText = '0%';
            if(countDisplay) countDisplay.innerText = '0 exams';
            return;
        }

        let totalPercent = 0;
        let examCount = 0;

        snap.forEach(doc => {
            const m = doc.data();
            examCount++;
            totalPercent += parseFloat(m.percentage || 0);

            tbody.innerHTML += `<tr>
                <td><strong>${m.subject}</strong></td>
                <td>${m.marksObtained} / ${m.totalMarks}</td>
                <td><span style="color:var(--primary); font-weight:bold;">${m.percentage}%</span></td>
                <td>${m.date}</td>
            </tr>`;
        });

        if(percentageDisplay) percentageDisplay.innerText = `${Math.round(totalPercent / examCount)}%`;
        if(countDisplay) countDisplay.innerText = `${examCount} exam${examCount > 1 ? 's' : ''}`;
    });

    // Fetch Attendance
    onSnapshot(collection(db, `users/${studentId}/attendance`), (snap) => {
        const container = document.getElementById('attendanceContainer');
        const percentageDisplay = document.getElementById('attPercentage');
        const countDisplay = document.getElementById('attCount');

        container.innerHTML = '';
        if(snap.empty) {
            container.innerHTML = '<p style="text-align:center;color:#666;">No attendance records.</p>';
            if(percentageDisplay) percentageDisplay.innerText = '0%';
            if(countDisplay) countDisplay.innerText = '0/0 sessions';
            return;
        }

        let presentCount = 0;
        let totalCount = 0;
        
        // Group by month-year
        const monthlyData = {};

        snap.forEach(doc => {
            const a = doc.data();
            totalCount++;
            if (a.status === 'present') presentCount++;

            // Parse date "YYYY-MM-DD" or standard string to get Month Year
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

        // Sort keys (newest first, rough approximation by sorting Date parsing)
        const sortedMonths = Object.keys(monthlyData).sort((a, b) => new Date(b) - new Date(a));

        sortedMonths.forEach(month => {
            // Sort records within month by date descending
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
