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
    const galleryGrid = document.getElementById('videosGrid');
    const emptyState = document.getElementById('videosEmpty');
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    let allPhotos = [];
    let currentFilter = 'all';

    function renderGallery() {
        galleryGrid.innerHTML = '';
        let visibleCount = 0;

        allPhotos.forEach(photo => {
            if (currentFilter === 'all') {
                visibleCount++;
                const delay = (visibleCount * 0.05).toFixed(2);
                
                const photoSrc = photo.thumbnail || 'placeholder.jpg';
                const videoTitle = photo.title || 'Untitled Video';
                const videoCategory = photo.category || 'Video';
                const videoSpeaker = photo.speaker ? `🎤 ${photo.speaker}` : '';
                const videoDate = photo.date ? `📅 ${photo.date}` : '';
                
                // We'll store stringified metadata to pass to the lightbox
                const metaJson = encodeURIComponent(JSON.stringify({
                    title: videoTitle,
                    category: photo.category,
                    speaker: photo.speaker,
                    date: photo.date,
                    description: photo.description
                }));
                
                galleryGrid.innerHTML += `
                    <div class="gallery-item has-image" data-category="${(photo.category||'').toLowerCase()}" data-meta="${metaJson}" data-video-id="${photo.videoId}" style="animation-delay:${delay}s;">
                        <img src="${photoSrc}" alt="${videoTitle}" loading="lazy">
                        <div class="gallery-item-overlay">
                            <div>
                                <div class="gallery-item-category-tag">${videoCategory}</div>
                                <div class="gallery-item-label">${videoTitle}</div>
                                <div style="font-size: 0.75rem; color: #ccc; margin-top: 4px;">
                                    ${videoSpeaker} ${videoSpeaker && videoDate ? '&bull;' : ''} ${videoDate}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        if (visibleCount === 0) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
        }

        bindLightbox();
    }

    onSnapshot(collection(db, "videos"), (snap) => {
        allPhotos = [];
        snap.forEach(docSnap => {
            allPhotos.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        allPhotos.sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp));
        renderGallery();
    });

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            renderGallery();
        });
    });

    function bindLightbox() {
        const items = document.querySelectorAll('.gallery-item');
        const lightbox = document.getElementById('lightbox');
        const lightboxIframe = document.getElementById('lightboxIframe');
        const lightboxCaption = document.getElementById('lightboxCaption');
        const lightboxClose = document.getElementById('lightboxClose');
        const lightboxPrev = document.getElementById('lightboxPrev');
        const lightboxNext = document.getElementById('lightboxNext');

        if (!lightbox) return;

        let currentIndex = -1;
        const itemsWithImages = Array.from(items).filter(item => item.getAttribute("data-video-id"));

        function updateLightbox(item) {
            const videoId = item.getAttribute("data-video-id");
            if (!videoId) return;
            
            document.getElementById("lightboxIframe").src = "https://www.youtube.com/embed/" + videoId + "?autoplay=1";
            
            try {
                const meta = JSON.parse(decodeURIComponent(item.getAttribute('data-meta')));
                lightboxCaption.innerHTML = `
                    <div style="text-align:left; max-width: 800px; margin: 0 auto; line-height: 1.5;">
                        <div style="font-size:1.2rem; font-weight:700; color:var(--gold-light); margin-bottom:0.25rem;">${meta.title}</div>
                        <div style="font-size:0.85rem; color:#aaa; margin-bottom:0.5rem; display:flex; gap:1rem; flex-wrap:wrap;">
                            ${meta.category ? `<span>📌 ${meta.category}</span>` : ''}
                            ${meta.speaker ? `<span>🎤 ${meta.speaker}</span>` : ''}
                            ${meta.date ? `<span>📅 ${meta.date}</span>` : ''}
                        </div>
                        ${meta.description ? `<p style="font-size:0.95rem; color:#eee; margin-top:0.5rem;">${meta.description}</p>` : ''}
                    </div>
                `;
            } catch(e) {
                lightboxCaption.textContent = item.getAttribute('data-caption') || '';
            }
        }

        itemsWithImages.forEach((item, index) => {
            item.addEventListener('click', () => {
                const videoId = item.getAttribute("data-video-id");
                if (videoId) {
                    updateLightbox(item);
                    currentIndex = index;
                    lightbox.classList.add('open');
                }
            });
        });

        const closeLightbox = () => { lightbox.classList.remove("open"); document.getElementById("lightboxIframe").src = ""; };
        const showPrev = (e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
                currentIndex--;
                updateLightbox(itemsWithImages[currentIndex]);
            }
        };
        const showNext = (e) => {
            e.stopPropagation();
            if (currentIndex < itemsWithImages.length - 1) {
                currentIndex++;
                updateLightbox(itemsWithImages[currentIndex]);
            }
        };

        lightboxClose?.addEventListener('click', closeLightbox);
        lightboxPrev?.addEventListener('click', showPrev);
        lightboxNext?.addEventListener('click', showNext);
        lightbox?.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });

        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('open')) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') showPrev(e);
            if (e.key === 'ArrowRight') showNext(e);
        });
    }
});
