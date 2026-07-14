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
    const galleryGrid = document.getElementById('galleryGrid');
    const emptyState = document.getElementById('galleryEmpty');
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
                
                const photoSrc = photo.image || photo.url || 'placeholder.jpg';
                const photoCaption = photo.description ? `${photo.title} - ${photo.description}` : photo.title;
                
                galleryGrid.innerHTML += `
                    <div class="gallery-item has-image" data-category="events" data-caption="${photoCaption}" style="animation-delay:${delay}s;">
                        <img src="${photoSrc}" alt="${photo.title}" loading="lazy">
                        <div class="gallery-item-overlay">
                            <div>
                                <div class="gallery-item-category-tag">Gallery</div>
                                <div class="gallery-item-label">${photo.title}</div>
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

    onSnapshot(collection(db, "gallery"), (snap) => {
        allPhotos = [];
        snap.forEach(docSnap => {
            allPhotos.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        allPhotos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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
        const lightbox = document.getElementById('galleryLightbox');
        const lightboxImg = document.getElementById('lightboxImg');
        const lightboxCaption = document.getElementById('lightboxCaption');
        const lightboxClose = document.getElementById('lightboxClose');
        const lightboxPrev = document.getElementById('lightboxPrev');
        const lightboxNext = document.getElementById('lightboxNext');

        if (!lightbox) return;

        let currentIndex = -1;
        const itemsWithImages = Array.from(items).filter(item => item.querySelector('img'));

        itemsWithImages.forEach((item, index) => {
            item.addEventListener('click', () => {
                const img = item.querySelector('img');
                if (img) {
                    lightboxImg.src = img.src;
                    lightboxCaption.textContent = item.getAttribute('data-caption') || '';
                    currentIndex = index;
                    lightbox.classList.add('open');
                }
            });
        });

        const closeLightbox = () => lightbox.classList.remove('open');
        const showPrev = (e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
                currentIndex--;
                const prevItem = itemsWithImages[currentIndex];
                lightboxImg.src = prevItem.querySelector('img').src;
                lightboxCaption.textContent = prevItem.getAttribute('data-caption') || '';
            }
        };
        const showNext = (e) => {
            e.stopPropagation();
            if (currentIndex < itemsWithImages.length - 1) {
                currentIndex++;
                const nextItem = itemsWithImages[currentIndex];
                lightboxImg.src = nextItem.querySelector('img').src;
                lightboxCaption.textContent = nextItem.getAttribute('data-caption') || '';
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
