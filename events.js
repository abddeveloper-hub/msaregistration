import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const emptyState = document.getElementById('eventsEmpty');
const container = document.getElementById('eventsContainer');

// Curated default events
const defaultEvents = [
    {
        id: "evt-1",
        title: "Annual Convocation Conference & Award Ceremony",
        category: "Academic Convocation",
        date: "August 15, 2026",
        time: "09:30 AM IST",
        location: "Central Auditorium, MSA Ukkuda Campus",
        description: "Official convocation ceremony honoring rank holders and Sanad graduates.",
        badge: "Featured Event"
    },
    {
        id: "evt-2",
        title: "Grand Milad & Qira'at Majlis Gathering",
        category: "Spiritual Gathering",
        date: "September 02, 2026",
        time: "07:00 PM IST",
        location: "Grand Mosque Complex",
        description: "Recitation of Qira'at by renowned international Qaris and Naat performances.",
        badge: "Public Assembly"
    },
    {
        id: "evt-3",
        title: "Sahityotsav Inter-Dars Academic & Cultural Fest",
        category: "Student Fest",
        date: "October 10, 2026",
        time: "08:30 AM IST",
        location: "Campus Sports Grounds",
        description: "Annual literary competition featuring debate, manuscript presentation, and sports.",
        badge: "Student Competition"
    }
];

if (container && emptyState) {
    let hasLiveAnnouncement = false;

    // Listen to Announcements Document
    onSnapshot(doc(db, "settings", "announcements"), (docSnap) => {
        if (docSnap.exists() && docSnap.data().active && docSnap.data().text) {
            hasLiveAnnouncement = true;
            renderAllEvents(docSnap.data());
        } else {
            hasLiveAnnouncement = false;
            renderAllEvents(null);
        }
    }, (err) => {
        console.warn("Events announcement load notice:", err);
        renderAllEvents(null);
    });

    function renderAllEvents(announcementData) {
        emptyState.style.display = 'none';
        container.style.display = 'block';

        let html = '';

        // Render Live Announcement Banner if present
        if (announcementData) {
            const dateStr = announcementData.updatedAt 
                ? new Date(announcementData.updatedAt).toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'}) 
                : new Date().toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'});

            html += `
                <div style="background: linear-gradient(135deg, rgba(37,99,235,0.1) 0%, rgba(15,23,42,0.05) 100%); border: 1px solid var(--primary); border-radius: 16px; padding: 2rem; box-shadow: 0 10px 30px rgba(37,99,235,0.1); position: relative; overflow: hidden; margin-bottom: 2.5rem;">
                    <div style="position:absolute; top:0; left:0; width:6px; height:100%; background:var(--primary);"></div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.75rem; flex-wrap:wrap; gap:0.5rem;">
                        <span style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.12em; font-weight:800; color:var(--primary); background:rgba(37,99,235,0.15); padding:4px 10px; border-radius:6px;">⚡ Live Announcement</span>
                        <span style="font-size:0.82rem; color:var(--text-dim);">🕒 ${dateStr}</span>
                    </div>
                    <p style="font-size:1.1rem; color:var(--text-main); line-height:1.75; white-space:pre-wrap;">${announcementData.text}</p>
                </div>
            `;
        }

        // Render Scheduled Upcoming Events Grid
        html += `
            <div style="margin-top: 1rem;">
                <h3 style="font-family: var(--font-display); font-size: 1.4rem; font-weight: 700; color: var(--text-main); margin-bottom: 1.25rem;">Upcoming Events & Assemblies</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 1.5rem;" class="events-cards-grid">
                    ${defaultEvents.map(evt => `
                        <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; box-shadow: var(--shadow-sm);">
                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                                    <span style="background: rgba(37,99,235,0.12); color: var(--primary); font-size: 0.72rem; font-weight: 700; padding: 4px 10px; border-radius: 8px; text-transform: uppercase;">${evt.category}</span>
                                    <span style="font-size: 0.72rem; color: var(--text-dim); font-weight: 600;">📌 ${evt.badge}</span>
                                </div>
                                <h4 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem; font-family: var(--font-display); line-height: 1.35;">${evt.title}</h4>
                                <p style="color: var(--text-dim); font-size: 0.84rem; line-height: 1.5; margin-bottom: 1.25rem;">${evt.description}</p>
                            </div>
                            <div style="border-top: 1px solid var(--border); padding-top: 1rem; font-size: 0.8rem; color: var(--text-dim); display: flex; flex-direction: column; gap: 0.35rem;">
                                <div>📅 <strong style="color: var(--text-main);">${evt.date}</strong> (${evt.time})</div>
                                <div>📍 <span>${evt.location}</span></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        container.innerHTML = html;
    }
}
