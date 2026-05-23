// ==========================================
// STUDENT PORTAL LOGIC
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUserData = null;
let activeAcademicUid = null;
let academicUnsubs = [];
let liveAcademics = {
    attendance: [],
    marks: [],
    remarks: []
};

function clearAcademicListeners() {
    academicUnsubs.forEach((unsub) => unsub());
    academicUnsubs = [];
    activeAcademicUid = null;
    liveAcademics = { attendance: [], marks: [], remarks: [] };
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}

function setSrc(id, value) {
    const el = document.getElementById(id);
    if (el) el.src = value;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}

function studentName(user) {
    return user?.fullName || user?.name || user?.email || "Student";
}

function avatarUrl(user) {
    const name = studentName(user);
    return user?.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
}

function monthLabel(value) {
    if (!value) return "Unsorted";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

function sortByDateDesc(a, b) {
    const aTime = new Date(a.date || a.timestamp || a.createdAt || 0).getTime() || 0;
    const bTime = new Date(b.date || b.timestamp || b.createdAt || 0).getTime() || 0;
    return bTime - aTime;
}

onAuthStateChanged(auth, (user) => {
    if (user) initPortalSync(user.uid);
    else {
        clearAcademicListeners();
        window.location.href = "index.html";
    }
});

function initPortalSync(uid) {
    onSnapshot(doc(db, "users", uid), (snap) => {
        if (!snap.exists()) {
            window.location.href = "index.html";
            return;
        }

        currentUserData = { uid: snap.id, ...snap.data() };
        if (currentUserData.status !== "approved" && currentUserData.status !== "admitted") {
            window.location.href = "index.html";
            return;
        }

        updatePortalUI();
        initAcademicSync(uid);
    }, (error) => {
        console.error("Unable to load student portal:", error);
        window.location.href = "index.html";
    });
}

function initAcademicSync(uid) {
    if (activeAcademicUid === uid) return;
    clearAcademicListeners();
    activeAcademicUid = uid;

    const syncCollection = (key) => {
        const unsub = onSnapshot(collection(db, `users/${uid}/${key}`), (snap) => {
            liveAcademics[key] = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
            renderAcademics();
        }, (error) => {
            console.warn(`Unable to load ${key}:`, error);
            liveAcademics[key] = [];
            renderAcademics();
        });
        academicUnsubs.push(unsub);
    };

    syncCollection("attendance");
    syncCollection("marks");
    syncCollection("remarks");
}

function updatePortalUI() {
    const user = currentUserData;
    const name = studentName(user);
    const firstName = name.split(" ")[0] || "Student";
    const rollNumber = user.rollNumber || "PENDING";

    setText("userName", name);
    setText("welcomeName", firstName);
    setText("displayIdNumber", rollNumber);
    setText("userAvatar", name[0]?.toUpperCase() || "S");

    setText("profileFullName", name);
    setText("profileEmail", user.email || "N/A");
    setText("profileIdNum", rollNumber);
    setSrc("profilePhoto", avatarUrl(user));

    const details = document.getElementById("profileDetails");
    if (details) {
        const address = [user.homeAddress || user.address, user.district, user.state].filter(Boolean).join(", ") || "N/A";
        details.innerHTML = `
            <div class="detail-group"><label class="label">Phone</label><p>${escapeHtml(user.phone || "N/A")}</p></div>
            <div class="detail-group"><label class="label">DOB</label><p>${escapeHtml(user.dob || "N/A")}</p></div>
            <div class="detail-group"><label class="label">Guardian</label><p>${escapeHtml(user.fatherName || "N/A")}</p></div>
            <div class="detail-group"><label class="label">Aadhar</label><p>${escapeHtml(user.aadhar || "N/A")}</p></div>
            <div class="detail-group" style="grid-column: span 2;"><label class="label">Address</label><p>${escapeHtml(address)}</p></div>
        `;
    }

    renderAcademics();
    renderIdCard(user);
}

function legacyAttendanceByMonth(academics) {
    return Object.entries(academics?.monthlyAttendance || {}).map(([month, data]) => ({
        month,
        present: Number(data.present || 0),
        total: Number(data.total || 0),
        pct: Number(data.pct || 0)
    }));
}

function liveAttendanceByMonth() {
    const grouped = new Map();
    liveAcademics.attendance.forEach((record) => {
        const month = monthLabel(record.date || record.timestamp);
        const current = grouped.get(month) || { month, present: 0, total: 0, pct: 0 };
        current.total += 1;
        if (record.status === "present") current.present += 1;
        current.pct = current.total > 0 ? Math.round((current.present / current.total) * 100) : 0;
        grouped.set(month, current);
    });
    return Array.from(grouped.values());
}

function legacyExamGroups(academics) {
    return (academics?.monthlyExams || []).map((exam) => ({
        month: exam.month || "Exam",
        subjects: (exam.subjects || []).map((sub) => ({
            name: sub.name || "Subject",
            score: sub.score || "N/A"
        }))
    }));
}

function liveExamGroups() {
    const grouped = new Map();
    liveAcademics.marks.sort(sortByDateDesc).forEach((mark) => {
        const month = monthLabel(mark.date || mark.timestamp);
        const list = grouped.get(month) || [];
        list.push({
            name: mark.subject || "Subject",
            score: `${mark.marksObtained ?? "-"} / ${mark.totalMarks ?? "-"} (${mark.percentage || 0}%)`
        });
        grouped.set(month, list);
    });

    return Array.from(grouped.entries()).map(([month, subjects]) => ({ month, subjects }));
}

function renderAcademics() {
    const academics = currentUserData?.academics || {};
    const emptyState = document.getElementById("academicEmpty");
    const dataState = document.getElementById("academicData");
    const gradeBadge = document.getElementById("portalGradeBadge");

    const attendanceRows = legacyAttendanceByMonth(academics);
    const liveAttendanceRows = liveAttendanceByMonth();
    const examGroups = legacyExamGroups(academics);
    const liveExams = liveExamGroups();
    const remarks = [
        academics.remarks,
        ...liveAcademics.remarks
            .sort(sortByDateDesc)
            .map((remark) => {
                const meta = [remark.date, remark.author].filter(Boolean).join(" - ");
                return meta ? `${meta}: ${remark.text || ""}` : remark.text || "";
            })
    ].filter(Boolean);

    const hasAcademicData = attendanceRows.length || liveAttendanceRows.length || examGroups.length || liveExams.length || remarks.length || academics.grade;

    if (!hasAcademicData) {
        emptyState?.classList.remove("hidden");
        dataState?.classList.add("hidden");
        if (gradeBadge) gradeBadge.innerText = "Grade: N/A";
        return;
    }

    emptyState?.classList.add("hidden");
    dataState?.classList.remove("hidden");
    if (gradeBadge) gradeBadge.innerText = `Grade: ${academics.grade || currentUserData.batch || "N/A"}`;

    renderAttendance(attendanceRows.length ? attendanceRows : liveAttendanceRows);
    renderExams(examGroups.length ? examGroups : liveExams);
    renderRemarks(remarks);
}

function renderAttendance(rows) {
    const attList = document.getElementById("monthlyAttList");
    if (!attList) return;

    attList.innerHTML = "";
    if (rows.length === 0) {
        attList.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:2rem;">No attendance records found.</p>';
        setText("overallAttText", "0% Overall Attendance");
        return;
    }

    let presentTotal = 0;
    let sessionTotal = 0;

    rows.forEach((data) => {
        presentTotal += data.present || 0;
        sessionTotal += data.total || 0;
        const pct = data.total > 0 ? Math.round((data.present / data.total) * 100) : Number(data.pct || 0);
        attList.innerHTML += `
            <div class="glass-card" style="padding:1rem; text-align:center;">
                <div style="font-size:0.6rem; color:var(--text-dim); text-transform:uppercase; margin-bottom:0.4rem;">${escapeHtml(data.month)}</div>
                <div style="font-size:1.1rem; font-weight:700; color:${pct < 75 ? "var(--error)" : "var(--success)"}">${pct}%</div>
                <div style="font-size:0.5rem; color:var(--text-dim); margin-top:0.3rem;">${data.present || 0}/${data.total || 0} Days</div>
            </div>
        `;
    });

    const overall = sessionTotal > 0 ? Math.round((presentTotal / sessionTotal) * 100) : 0;
    setText("overallAttText", `${overall}% Overall Attendance`);
}

function renderExams(exams) {
    const timeline = document.getElementById("examTimeline");
    if (!timeline) return;

    timeline.innerHTML = "";
    if (exams.length === 0) {
        timeline.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:2rem;">No exam records found.</p>';
        return;
    }

    exams.forEach((exam) => {
        const block = document.createElement("div");
        block.className = "glass-card";
        block.style.padding = "2rem";
        block.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom:1px solid var(--border); padding-bottom:0.8rem;">
                <h4 style="margin:0; font-family:'Outfit'; color:var(--primary); font-size:1.2rem;">${escapeHtml(exam.month)}</h4>
                <span class="glass-badge" style="font-size:0.6rem;">Monthly Result</span>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:1.5rem;">
                ${exam.subjects.map((sub) => `
                    <div style="text-align:center;">
                        <label style="font-size:0.55rem; color:var(--text-dim); display:block; margin-bottom:0.4rem; text-transform:uppercase;">${escapeHtml(sub.name)}</label>
                        <div style="font-size:1.1rem; font-weight:800;">${escapeHtml(sub.score)}</div>
                    </div>
                `).join("")}
            </div>
        `;
        timeline.appendChild(block);
    });
}

function renderRemarks(remarks) {
    const remarksBox = document.getElementById("remarksWrapper");
    const remarksText = document.getElementById("portalRemarks");
    if (!remarksBox || !remarksText) return;

    if (remarks.length === 0) {
        remarksBox.classList.add("hidden");
        remarksText.innerText = "";
        return;
    }

    remarksBox.classList.remove("hidden");
    remarksText.innerText = remarks.join("\n\n");
}

function renderIdCard(user) {
    const wrap = document.getElementById("studentIdCard");
    if (!wrap) return;
    const name = studentName(user);
    wrap.innerHTML = `
        <div class="id-card-wrap">
            <div class="id-card-header">
                <div class="app-logo" style="margin:0; font-size:0.8rem;"><div class="dot"></div> The Ledger</div>
                <div class="glass-badge" style="font-size:0.5rem;">Student ID</div>
            </div>
            <div class="id-card-body">
                <div class="id-photo"><img src="${escapeHtml(avatarUrl(user))}" alt=""></div>
                <div class="id-info">
                    <h3>${escapeHtml(name)}</h3>
                    <div class="id-details-grid">
                        <div class="id-detail-item"><label>DOB</label><p>${escapeHtml(user.dob || "N/A")}</p></div>
                        <div class="id-detail-item"><label>Phone</label><p>${escapeHtml(user.phone || "N/A")}</p></div>
                        <div class="id-detail-item"><label>Guardian</label><p>${escapeHtml(user.fatherName || "N/A")}</p></div>
                        <div class="id-detail-item"><label>District</label><p>${escapeHtml(user.district || user.campus || "N/A")}</p></div>
                    </div>
                    <div class="id-number-box">${escapeHtml(user.rollNumber || "PENDING")}</div>
                </div>
            </div>
            <div class="id-footer">
                <div style="font-size: 0.5rem; color: var(--text-dim);">VALID UNTIL DEC 2026</div>
                <div class="id-barcode"></div>
            </div>
        </div>
    `;
}

window.switchPortalTab = (tabId) => {
    const navItems = document.querySelectorAll(".nav-item");
    const mItems = document.querySelectorAll(".m-nav-item");
    const tabs = document.querySelectorAll(".portal-view");

    tabs.forEach((tab) => tab.classList.add("hidden"));
    const target = document.getElementById(`tab-${tabId}`);
    if (target) target.classList.remove("hidden");

    navItems.forEach((item) => item.classList.toggle("active", item.dataset.tab === tabId));
    mItems.forEach((item) => item.classList.toggle("active", item.dataset.mTab === tabId));
};

document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => window.switchPortalTab(item.dataset.tab));
});

document.querySelectorAll(".m-nav-item").forEach((item) => {
    item.addEventListener("click", () => window.switchPortalTab(item.dataset.mTab));
});

document.getElementById("logoutBtn")?.addEventListener("click", () => signOut(auth));
document.getElementById("downloadIdBtn")?.addEventListener("click", () => {
    if (!currentUserData || typeof html2pdf !== "function") return;
    const element = document.getElementById("studentIdCard");
    const safeName = studentName(currentUserData).replace(/\s+/g, "_");
    html2pdf().set({
        margin: 1,
        filename: `ID_${safeName}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, backgroundColor: "#000000" },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
    }).from(element).save();
});
