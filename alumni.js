import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, enableMultiTabIndexedDbPersistence, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
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

document.addEventListener('DOMContentLoaded', () => {
    const alumniGrid = document.getElementById('alumniGrid');
    const filterContainer = document.getElementById('alumniFilters');
    
    const lightboxModal = document.getElementById('alumniLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxTitleTag = document.getElementById('lightboxTitleTag');
    const lightboxName = document.getElementById('lightboxName');
    const lightboxBatch = document.getElementById('lightboxBatch');
    const lightboxDesignation = document.getElementById('lightboxDesignation');
    const lightboxLocation = document.getElementById('lightboxLocation');
    const lightboxBio = document.getElementById('lightboxBio');
    const lightboxContact = document.getElementById('lightboxContact');
    const closeLightboxBtn = document.getElementById('closeLightboxBtn');

    let allAlumni = [];
    let currentFilter = 'all';

    function renderFilterButtons() {
        if (!filterContainer) return;

        const defaultBatches = ['all', '2025-2026', '2024-2025', '2023-2024', 'Fazil Graduates'];
        const dynamicBatches = new Set(defaultBatches);
        allAlumni.forEach(item => {
            if (item.batch) dynamicBatches.add(item.batch);
        });

        const activeCat = currentFilter;
        filterContainer.innerHTML = '';

        dynamicBatches.forEach(b => {
            const btn = document.createElement('button');
            btn.className = `filter-btn ${activeCat.toLowerCase() === b.toLowerCase() ? 'active' : ''}`;
            btn.dataset.filter = b;
            btn.textContent = b === 'all' ? 'All Batches' : (b.includes('Batch') ? b : `Batch ${b}`);
            btn.addEventListener('click', () => {
                currentFilter = b;
                renderFilterButtons();
                renderAlumni();
            });
            filterContainer.appendChild(btn);
        });
    }

    function renderAlumni() {
        if (!alumniGrid) return;
        alumniGrid.innerHTML = '';

        const filtered = allAlumni.filter(item => {
            if (currentFilter === 'all') return true;
            return (item.batch || '').toLowerCase() === currentFilter.toLowerCase();
        });

        if (filtered.length === 0) {
            alumniGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 4rem 1rem; color: var(--text-dim);">
                    <div style="font-size:3rem; margin-bottom:1rem;">🎓</div>
                    <h3 style="font-size:1.2rem; color:var(--text-main); margin-bottom:0.5rem;">No Alumni Profiles Found</h3>
                    <p style="font-size:0.9rem;">There are no graduate profiles listed under this batch yet.</p>
                </div>
            `;
            return;
        }

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = 'alumni-card';
            
            const photoSrc = item.url || item.image || item.photoUrl || 'assets/mdu-hero.png';
            const batchText = item.batch ? (item.batch.includes('Batch') ? item.batch : `Batch ${item.batch}`) : 'Graduate';

            card.innerHTML = `
                <div class="alumni-card-img-wrap">
                    <img src="${photoSrc}" alt="${item.name || 'Alumni Photo'}" loading="lazy">
                    <div class="batch-badge">🎓 ${batchText}</div>
                </div>
                <div class="alumni-card-body">
                    <span class="alumni-title-tag">${item.title || 'Fazil Muhyissunnah'}</span>
                    <h3 class="alumni-name">${item.name || 'Graduate Scholar'}</h3>
                    ${item.designation ? `<div class="alumni-designation">💼 ${item.designation}</div>` : ''}
                    ${item.location ? `<div class="alumni-location">📍 ${item.location}</div>` : ''}
                    <div class="alumni-card-footer">
                        <span>View Profile Bio</span>
                        <span>→</span>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                openLightbox(item);
            });

            alumniGrid.appendChild(card);
        });
    }

    function openLightbox(item) {
        if (!lightboxModal) return;

        lightboxImg.src = item.url || item.image || item.photoUrl || 'assets/mdu-hero.png';
        lightboxTitleTag.textContent = item.title || 'Fazil Muhyissunnah';
        lightboxName.textContent = item.name || 'Graduate Scholar';
        lightboxBatch.textContent = `🎓 ${item.batch ? (item.batch.includes('Batch') ? item.batch : `Batch ${item.batch}`) : 'Graduate'}`;

        lightboxDesignation.textContent = item.designation ? `💼 ${item.designation} ${item.institution ? `@ ${item.institution}` : ''}` : '';
        lightboxLocation.textContent = item.location ? `📍 ${item.location}` : '';
        lightboxBio.textContent = item.bio || 'No biography or research summary provided.';
        
        let contactHtml = '';
        if (item.whatsapp) {
            contactHtml += `<a href="https://wa.me/${item.whatsapp.replace(/[^0-9]/g, '')}" target="_blank" style="color:#10b981; font-weight:700; text-decoration:none;">💬 WhatsApp</a>`;
        }
        if (item.email) {
            contactHtml += `<a href="mailto:${item.email}" style="color:var(--primary); font-weight:700; text-decoration:none;">✉️ Email</a>`;
        }
        if (item.phone) {
            contactHtml += `<a href="tel:${item.phone}" style="color:var(--text-main); font-weight:700; text-decoration:none;">📞 Call</a>`;
        }
        lightboxContact.innerHTML = contactHtml || '<span style="color:var(--text-dim);">No direct contact info shared.</span>';

        lightboxModal.classList.add('active');
    }

    if (closeLightboxBtn) {
        closeLightboxBtn.addEventListener('click', () => {
            lightboxModal.classList.remove('active');
        });
    }

    if (lightboxModal) {
        lightboxModal.addEventListener('click', (e) => {
            if (e.target === lightboxModal) {
                lightboxModal.classList.remove('active');
            }
        });
    }

    // Firestore Listener
    onSnapshot(collection(db, "alumni"), (snapshot) => {
        allAlumni = [];
        snapshot.forEach(docSnap => {
            allAlumni.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        renderFilterButtons();
        renderAlumni();
    }, (error) => {
        console.warn("Alumni listener permission notice:", error);
        if (alumniGrid) {
            alumniGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 4rem 1rem; color: var(--text-dim);">
                    <div style="font-size:3rem; margin-bottom:1rem;">🎓</div>
                    <h3 style="font-size:1.2rem; color:var(--text-main); margin-bottom:0.5rem;">No Alumni Profiles Published</h3>
                    <p style="font-size:0.9rem;">Alumni profiles will appear here once published.</p>
                </div>
            `;
        }
    });
});
