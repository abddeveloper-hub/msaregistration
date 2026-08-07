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
                                <a href="https://api.whatsapp.com/send?text=${encodeURIComponent('📌 *' + evt.title + '*\n📅 Date: ' + evt.date + '\n📍 Location: ' + evt.location + '\n\nMore info on Muhyissunnah Dars Ukkuda Portal: ' + window.location.href)}" target="_blank" rel="noopener noreferrer" style="margin-top:0.5rem; display:inline-flex; align-items:center; gap:0.4rem; font-size:0.75rem; font-weight:700; color:#25D366; text-decoration:none; background:rgba(37,211,102,0.1); padding:4px 10px; border-radius:50px; width:fit-content;">
                                    <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                    Share on WhatsApp
                                </a>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        container.innerHTML = html;
    }
}

// Live Event Countdown Timer
(function initEventCountdown() {
    const cdDays = document.getElementById("cdDays");
    const cdHours = document.getElementById("cdHours");
    const cdMins = document.getElementById("cdMins");
    const cdSecs = document.getElementById("cdSecs");

    if (!cdDays) return;

    const targetDate = new Date("2026-08-15T09:30:00+05:30").getTime();

    function updateTimer() {
        const now = new Date().getTime();
        const diff = targetDate - now;

        if (diff <= 0) {
            cdDays.textContent = "00";
            cdHours.textContent = "00";
            cdMins.textContent = "00";
            cdSecs.textContent = "00";
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        cdDays.textContent = String(days).padStart(2, "0");
        cdHours.textContent = String(hours).padStart(2, "0");
        cdMins.textContent = String(mins).padStart(2, "0");
        cdSecs.textContent = String(secs).padStart(2, "0");
    }

    updateTimer();
    setInterval(updateTimer, 1000);
})();

