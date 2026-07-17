import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const emptyState = document.getElementById('eventsEmpty');
const container = document.getElementById('eventsContainer');

if (container && emptyState) {
    onSnapshot(doc(db, "settings", "announcements"), (docSnap) => {
        if (docSnap.exists() && docSnap.data().active && docSnap.data().text) {
            const data = docSnap.data();
            
            emptyState.style.display = 'none';
            container.style.display = 'block';
            
            const dateStr = data.updatedAt 
                ? new Date(data.updatedAt).toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'}) 
                : new Date().toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'});

            container.innerHTML = `
                <div style="
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    padding: 2.5rem;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.05);
                    position: relative;
                    overflow: hidden;
                ">
                    <div style="position:absolute; top:0; left:0; width:6px; height:100%; background:var(--primary);"></div>
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 1rem;">
                        <span style="font-size:0.85rem; text-transform:uppercase; letter-spacing:0.1em; font-weight:700; color:var(--primary);">Latest Update</span>
                        <span style="font-size:0.9rem; color:var(--text-dim);"><span style="margin-right:0.5rem;">🕒</span>${dateStr}</span>
                    </div>
                    
                    <p style="font-size:1.2rem; color:var(--text-main); line-height:1.8; white-space:pre-wrap;">${data.text}</p>
                </div>
            `;
        } else {
            emptyState.style.display = 'block';
            container.style.display = 'none';
            container.innerHTML = '';
        }
    });
}
