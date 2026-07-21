import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, enableMultiTabIndexedDbPersistence, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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

    const editMyBioBtn = document.getElementById('editMyBioBtn');
    const editSelfModal = document.getElementById('editAlumniSelfModal');
    const closeEditSelfModalBtn = document.getElementById('closeEditSelfModalBtn');
    const editSelfForm = document.getElementById('editAlumniSelfForm');
    const selfSaveMsg = document.getElementById('selfSaveMsg');
    const selfPhotoInput = document.getElementById('selfPhoto');
    const selfPhotoPreviewWrap = document.getElementById('selfPhotoPreviewWrap');
    const selfPhotoPreview = document.getElementById('selfPhotoPreview');

    let currentUser = null;
    let selfPhotoBase64 = null;

    if (selfPhotoInput) {
        selfPhotoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    selfPhotoBase64 = evt.target.result;
                    if (selfPhotoPreview) selfPhotoPreview.src = selfPhotoBase64;
                    if (selfPhotoPreviewWrap) selfPhotoPreviewWrap.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            const userSnap = await getDoc(doc(db, "users", user.uid));
            const alumniSnap = await getDoc(doc(db, "alumni", user.uid));
            if ((userSnap.exists() && userSnap.data().role === 'alumni') || alumniSnap.exists()) {
                if (editMyBioBtn) editMyBioBtn.classList.remove('hidden');
            }
        }
    });

    if (editMyBioBtn) {
        editMyBioBtn.addEventListener('click', async () => {
            if (!currentUser) return;
            selfSaveMsg.textContent = '';
            selfPhotoBase64 = null;
            
            const userSnap = await getDoc(doc(db, "users", currentUser.uid));
            const alumniSnap = await getDoc(doc(db, "alumni", currentUser.uid));
            
            const uData = userSnap.exists() ? userSnap.data() : {};
            const aData = alumniSnap.exists() ? alumniSnap.data() : {};

            document.getElementById('selfName').value = aData.name || uData.fullName || '';
            document.getElementById('selfTitle').value = aData.title || 'Fazil Muhyissunnah';
            document.getElementById('selfBatch').value = aData.batch || uData.batch || '';
            document.getElementById('selfDesignation').value = aData.designation || uData.designation || '';
            document.getElementById('selfInstitution').value = aData.institution || '';
            document.getElementById('selfLocation').value = aData.location || '';
            document.getElementById('selfPhone').value = aData.whatsapp || aData.phone || '';
            document.getElementById('selfBio').value = aData.bio || uData.bio || '';

            const currentImg = aData.url || aData.photoUrl || uData.url || '';
            if (currentImg && selfPhotoPreview) {
                selfPhotoPreview.src = currentImg;
                if (selfPhotoPreviewWrap) selfPhotoPreviewWrap.style.display = 'block';
            } else if (selfPhotoPreviewWrap) {
                selfPhotoPreviewWrap.style.display = 'none';
            }

            editSelfModal.classList.add('active');
        });
    }

    if (closeEditSelfModalBtn && editSelfModal) {
        closeEditSelfModalBtn.addEventListener('click', () => {
            editSelfModal.classList.remove('active');
        });
        editSelfModal.addEventListener('click', (e) => {
            if (e.target === editSelfModal) editSelfModal.classList.remove('active');
        });
    }

    if (editSelfForm) {
        editSelfForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;
            
            const saveBtn = document.getElementById('saveSelfBtn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            selfSaveMsg.style.color = 'var(--primary)';
            selfSaveMsg.textContent = 'Updating profile and bio...';

            try {
                const name = document.getElementById('selfName').value.trim();
                const title = document.getElementById('selfTitle').value.trim();
                const batch = document.getElementById('selfBatch').value.trim();
                const designation = document.getElementById('selfDesignation').value.trim();
                const institution = document.getElementById('selfInstitution').value.trim();
                const location = document.getElementById('selfLocation').value.trim();
                const phone = document.getElementById('selfPhone').value.trim();
                const bio = document.getElementById('selfBio').value.trim();

                const alumniPayload = {
                    name: name,
                    title: title || 'Fazil Muhyissunnah',
                    batch: batch || 'Graduate Scholar',
                    designation: designation,
                    institution: institution,
                    location: location,
                    whatsapp: phone,
                    bio: bio,
                    email: currentUser.email,
                    uploadedBy: currentUser.uid,
                    updatedAt: new Date().toISOString()
                };

                if (selfPhotoBase64) {
                    alumniPayload.url = selfPhotoBase64;
                    alumniPayload.photoUrl = selfPhotoBase64;
                }

                await setDoc(doc(db, "alumni", currentUser.uid), alumniPayload, { merge: true });
                
                const userUpdate = {
                    fullName: name,
                    bio: bio,
                    batch: batch,
                    designation: designation,
                    title: title,
                    institution: institution,
                    location: location,
                    phone: phone
                };
                if (selfPhotoBase64) userUpdate.url = selfPhotoBase64;

                await setDoc(doc(db, "users", currentUser.uid), userUpdate, { merge: true });

                selfSaveMsg.style.color = '#10b981';
                selfSaveMsg.textContent = 'Profile & Bio updated successfully!';
                setTimeout(() => {
                    editSelfModal.classList.remove('active');
                }, 1200);
            } catch (err) {
                console.error("Save error:", err);
                selfSaveMsg.style.color = '#ef4444';
                selfSaveMsg.textContent = 'Failed to save: ' + err.message;
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Profile & Bio';
            }
        });
    }

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
