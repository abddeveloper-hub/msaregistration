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
    const filterContainer = document.getElementById('galleryFilters');
    
    let allPhotos = [];
    let currentFilter = 'all';

    function formatAddedDate(rawDate) {
        if (!rawDate) return '';
        let dateObj;
        if (rawDate && typeof rawDate.toDate === 'function') {
            dateObj = rawDate.toDate();
        } else {
            dateObj = new Date(rawDate);
        }
        if (isNaN(dateObj.getTime())) return String(rawDate);
        
        const formattedDate = dateObj.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const formattedTime = dateObj.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        return `${formattedDate}, ${formattedTime}`;
    }

    let currentCampusFilter = 'all';

    const galleryCampusFilterSelect = document.getElementById('galleryCampusFilter');
    if (galleryCampusFilterSelect) {
        galleryCampusFilterSelect.addEventListener('change', (e) => {
            currentCampusFilter = e.target.value;
            renderGallery();
        });
    }

    function renderFilterButtons() {
        if (!filterContainer) return;

        const existingSelect = document.getElementById('galleryCampusFilter');

        // Default categories list (ordered nicely)
        const defaultCats = ['all', 'events', 'campus', 'academic', 'posters'];
        const customCats = [];

        allPhotos.forEach(p => {
            if (p.category && p.category.trim()) {
                const catLower = p.category.trim().toLowerCase();
                if (!defaultCats.includes(catLower) && !customCats.includes(catLower)) {
                    customCats.push(catLower);
                }
            }
        });

        const allCats = [...defaultCats, ...customCats];

        filterContainer.innerHTML = allCats.map(cat => {
            const displayName = cat === 'all' ? 'All' : (cat.charAt(0).toUpperCase() + cat.slice(1));
            const isActive = currentFilter.toLowerCase() === cat.toLowerCase() ? 'active' : '';
            return `<button class="filter-btn ${isActive}" data-filter="${cat}">${displayName}</button>`;
        }).join('');

        if (existingSelect) {
            filterContainer.appendChild(existingSelect);
        }

        filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                filterContainer.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.getAttribute('data-filter');
                renderGallery();
            });
        });
    }

    function renderGallery() {
        galleryGrid.innerHTML = '';
        let visibleCount = 0;

        allPhotos.forEach(photo => {
            const photoCategory = (photo.category || 'Events').toLowerCase();
            const matchFilter = currentFilter === 'all' || photoCategory === currentFilter.toLowerCase();
            const matchCampus = currentCampusFilter === 'all' || (photo.campus || '').toLowerCase().includes(currentCampusFilter.toLowerCase());

            if (matchFilter && matchCampus) {
                visibleCount++;
                const delay = (visibleCount * 0.05).toFixed(2);
                
                const photoSrc = photo.image || photo.url || 'placeholder.jpg';
                const photoCaption = photo.description ? `${photo.title} - ${photo.description}` : photo.title;
                const categoryTag = photo.category || 'Gallery';
                const addedDateStr = formatAddedDate(photo.createdAt || photo.timestamp || photo.date);
                
                galleryGrid.innerHTML += `
                    <div class="gallery-item has-image" data-category="${photoCategory}" data-caption="${photoCaption}" data-date="${addedDateStr}" style="animation-delay:${delay}s;">
                        <img src="${photoSrc}" alt="${photo.title}" loading="lazy">
                        <div class="gallery-item-overlay">
                            <div>
                                <div class="gallery-item-category-tag">${categoryTag}</div>
                                <div class="gallery-item-label">${photo.title}</div>
                                ${addedDateStr ? `<div style="font-size:0.75rem; color:rgba(255,255,255,0.85); margin-top:0.35rem; display:flex; align-items:center; gap:0.25rem;"><span>🕒</span> ${addedDateStr}</div>` : ''}
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
        
        allPhotos.sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp));
        renderFilterButtons();
        renderGallery();
    });

    function bindLightbox() {
        const items = document.querySelectorAll('.gallery-item');
        const lightbox = document.getElementById('lightbox');
        const lightboxImg = document.getElementById('lightboxImg');
        const lightboxCaption = document.getElementById('lightboxCaption');
        const lightboxClose = document.getElementById('lightboxClose');
        const lightboxPrev = document.getElementById('lightboxPrev');
        const lightboxNext = document.getElementById('lightboxNext');

        if (!lightbox) return;

        let currentIndex = -1;
        const itemsWithImages = Array.from(items).filter(item => item.querySelector('img'));

        function updateLightboxContent(item) {
            const img = item.querySelector('img');
            if (img) {
                lightboxImg.src = img.src;
                const captionText = item.getAttribute('data-caption') || '';
                const dateText = item.getAttribute('data-date') || '';
                lightboxCaption.innerHTML = `
                    <div style="font-size:1.05rem; font-weight:600; color:#fff;">${captionText}</div>
                    ${dateText ? `<div style="font-size:0.85rem; color:rgba(255,255,255,0.75); margin-top:0.4rem;">🕒 Added: ${dateText}</div>` : ''}
                `;
            }
        }

        itemsWithImages.forEach((item, index) => {
            item.addEventListener('click', () => {
                updateLightboxContent(item);
                currentIndex = index;
                lightbox.classList.add('open');
            });
        });

        const closeLightbox = () => lightbox.classList.remove('open');
        const showPrev = (e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
                currentIndex--;
                const prevItem = itemsWithImages[currentIndex];
                updateLightboxContent(prevItem);
            }
        };
        const showNext = (e) => {
            e.stopPropagation();
            if (currentIndex < itemsWithImages.length - 1) {
                currentIndex++;
                const nextItem = itemsWithImages[currentIndex];
                updateLightboxContent(nextItem);
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
