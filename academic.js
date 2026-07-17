import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const emptyState = document.getElementById('academicEmpty');
const container = document.getElementById('programsContainer');

if (container && emptyState) {
    onSnapshot(collection(db, 'calendarEvents'), (snapshot) => {
        container.innerHTML = '';
        const events = [];
        snapshot.forEach(docSnap => events.push({ id: docSnap.id, ...docSnap.data() }));
        events.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (events.length === 0) {
            emptyState.style.display = 'block';
            container.style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            container.style.display = 'grid';
            
            events.forEach(ev => {
                const div = document.createElement('div');
                div.style = `
                    background: var(--surface);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    padding: 1.5rem;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                    transition: transform 0.2s, box-shadow 0.2s;
                    display: flex;
                    flex-direction: column;
                `;
                
                let badgeColor = 'var(--primary)';
                let badgeText = 'General Programme';
                if(ev.type === 'exam') {
                    badgeColor = 'var(--gold-base)';
                    badgeText = 'Assessment / Exam';
                } else if(ev.type === 'holiday') {
                    badgeColor = 'var(--error)';
                    badgeText = 'Holiday';
                }
                
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom: 1rem;">
                        <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.1em; font-weight:700; color:${badgeColor}; padding: 0.25rem 0.75rem; border-radius: 50px; border: 1px solid ${badgeColor}40; background: ${badgeColor}10;">${badgeText}</span>
                    </div>
                    <h3 style="font-size:1.35rem; color:var(--text-main); font-family:var(--font-display); margin-bottom:0.5rem; line-height:1.3;">${ev.title}</h3>
                    <div style="margin-top:auto; display:flex; align-items:center; gap:0.5rem; color:var(--text-dim); font-size:0.9rem;">
                        <span style="font-size:1.2rem;">📅</span>
                        <span>${new Date(ev.date).toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'})}</span>
                    </div>
                `;
                
                // Add hover effect via JS since inline pseudo classes aren't possible
                div.addEventListener('mouseenter', () => {
                    div.style.transform = 'translateY(-5px)';
                    div.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)';
                });
                div.addEventListener('mouseleave', () => {
                    div.style.transform = 'translateY(0)';
                    div.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
                });
                
                container.appendChild(div);
            });
        }
    });
}
