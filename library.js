import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const libraryGrid = document.getElementById('libraryGrid');
const filterBtns = document.querySelectorAll('.filter-btn');

let allResources = [];

onSnapshot(collection(db, "library_resources"), (snapshot) => {
    allResources = [];
    snapshot.forEach(doc => {
        allResources.push({ id: doc.id, ...doc.data() });
    });
    // Sort by newest first
    allResources.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    renderResources('all');
});

function renderResources(filterType) {
    if (!libraryGrid) return;
    
    libraryGrid.innerHTML = '';
    
    const filtered = filterType === 'all' 
        ? allResources 
        : allResources.filter(r => r.type === filterType);
        
    if (filtered.length === 0) {
        libraryGrid.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color: var(--text-dim);">No resources found.</p>';
        return;
    }
    
    filtered.forEach(res => {
        const div = document.createElement('div');
        div.className = 'portal-card animate-on-scroll slide-up is-visible';
        
        let icon = '📄';
        if (res.type === 'audio') icon = '🎧';
        if (res.type === 'link') icon = '🔗';
        
        div.innerHTML = `
            <div style="font-size: 2rem; margin-bottom: 1rem;">${icon}</div>
            <h3 style="font-size: 1.25rem; margin-bottom: 0.5rem; font-family: var(--font-display);">${res.title}</h3>
            <p style="color: var(--text-dim); font-size: 0.85rem; margin-bottom: 1.5rem; text-transform: uppercase;">${res.type}</p>
            <a href="${res.url}" target="_blank" class="btn btn-outline" style="width: 100%;">View Resource</a>
        `;
        libraryGrid.appendChild(div);
    });
}

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => {
            b.classList.remove('btn-main');
            b.classList.add('btn-ghost');
        });
        btn.classList.remove('btn-ghost');
        btn.classList.add('btn-main');
        renderResources(btn.getAttribute('data-filter'));
    });
});
