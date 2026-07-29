import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, enableMultiTabIndexedDbPersistence, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
setTimeout(() => {
    enableMultiTabIndexedDbPersistence(db).catch((err) => console.warn("Offline persistence notice:", err.code));
}, 0);

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

// Curated default gallery photos
const defaultGalleryItems = [
    {
        id: "gal-1",
        title: "Main Campus Quadrangle & Mosque View",
        category: "Campus",
        image: "assets/mdu-hero.png",
        description: "Panoramic morning view of Muhyissunnah Dars Ukkuda central building.",
        createdAt: "2026-07-15T09:00:00Z"
    },
    {
        id: "gal-2",
        title: "Annual Convocation & Award Ceremony",
        category: "Events",
        image: "assets/mdu-hero.png",
        description: "Honoring outstanding Fazil graduates and rank holders of the academic year.",
        createdAt: "2026-06-28T14:30:00Z"
    },
    {
        id: "gal-3",
        title: "Central Manuscript Library & Study Hall",
        category: "Academic",
        image: "assets/mdu-hero.png",
        description: "Students engaged in classical Fiqh and Hadith manuscript research.",
        createdAt: "2026-06-10T11:00:00Z"
    },
    {
        id: "gal-4",
        title: "Grand Milad Qira'at Recitation Gathering",
        category: "Events",
        image: "assets/mdu-hero.png",
        description: "Special evening assembly featuring Qari recitations and Naat performances.",
        createdAt: "2026-05-20T18:00:00Z"
    },
    {
        id: "gal-5",
        title: "Inter-Dars Sports & Literary Fest",
        category: "Events",
        image: "assets/mdu-hero.png",
        description: "Students participating in annual Sahityotsav literary and athletic competitions.",
        createdAt: "2026-05-04T10:00:00Z"
    }
];

document.addEventListener('DOMContentLoaded', () => {
    const galleryGrid = document.getElementById('galleryGrid');
    const emptyState = document.getElementById('galleryEmpty');
    const filterContainer = document.getElementById('galleryFilters');
    
    if (galleryGrid) {
        galleryGrid.innerHTML = Array(6).fill(0).map(() => `
            <div class="skeleton-card" style="height:260px; border-radius:16px; position:relative; overflow:hidden; padding:0;">
                <div class="skeleton-box" style="width:100%; height:100%;"></div>
            </div>
        `).join('');
    }

    let allPhotos = [];
    let currentFilter = 'all';

    function getPhotoTime(photo) {
        if (!photo) return 0;
        const val = photo.createdAt || photo.timestamp || photo.date || photo.addedAt || photo.uploadedAt;
        if (!val) return 0;
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        if (typeof val.seconds === 'number') return val.seconds * 1000;
        const parsed = new Date(val).getTime();
        return isNaN(parsed) ? 0 : parsed;
    }

    function formatAddedDate(rawDate) {
        if (!rawDate) return '';
        let dateObj;
        if (rawDate && typeof rawDate.toDate === 'function') {
            dateObj = rawDate.toDate();
        } else if (rawDate && typeof rawDate.seconds === 'number') {
            dateObj = new Date(rawDate.seconds * 1000);
        } else {
            dateObj = new Date(rawDate);
        }
        if (isNaN(dateObj.getTime())) return String(rawDate);
        
        return dateObj.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
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
        const defaultCats = ['all', 'events', 'campus', 'academic'];
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
            const displayName = cat === 'all' ? 'All Photos' : (cat.charAt(0).toUpperCase() + cat.slice(1));
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

        // Sort: Newest (largest timestamp) at the top, older (smaller timestamp) at the bottom
        const sortedPhotos = [...allPhotos].sort((a, b) => getPhotoTime(b) - getPhotoTime(a));

        sortedPhotos.forEach(photo => {
            const photoCategory = (photo.category || 'Events').toLowerCase();
            const matchFilter = currentFilter === 'all' || photoCategory === currentFilter.toLowerCase();
            const matchCampus = currentCampusFilter === 'all' || (photo.campus || '').toLowerCase().includes(currentCampusFilter.toLowerCase());

            if (matchFilter && matchCampus) {
                visibleCount++;
                const delay = (visibleCount * 0.05).toFixed(2);
                
                const photoSrc = photo.image || photo.url || 'assets/mdu-hero.png';
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

    try {
        onSnapshot(collection(db, "gallery"), (snap) => {
            const fetched = [];
            snap.forEach(docSnap => {
                fetched.push({ id: docSnap.id, ...docSnap.data() });
            });
            
            if (fetched.length > 0) {
                allPhotos = fetched;
            } else {
                allPhotos = defaultGalleryItems;
            }
            allPhotos.sort((a, b) => getPhotoTime(b) - getPhotoTime(a));
            renderFilterButtons();
            renderGallery();
        }, (err) => {
            console.warn("Gallery load notice, using curated photos:", err);
            allPhotos = defaultGalleryItems;
            allPhotos.sort((a, b) => getPhotoTime(b) - getPhotoTime(a));
            renderFilterButtons();
            renderGallery();
        });
    } catch(e) {
        allPhotos = defaultGalleryItems;
        allPhotos.sort((a, b) => getPhotoTime(b) - getPhotoTime(a));
        renderFilterButtons();
        renderGallery();
    }

    function bindLightbox() {
        const lightbox = document.getElementById('lightbox');
        const scrollContainer = document.getElementById('lightboxScrollContainer');
        const lightboxClose = document.getElementById('lightboxClose');
        const itemsWithImages = Array.from(document.querySelectorAll('.gallery-item')).filter(item => item.querySelector('img'));

        if (!lightbox || !scrollContainer) return;

        function buildVerticalFeed(selectedIndex) {
            scrollContainer.innerHTML = itemsWithImages.map((item, idx) => {
                const img = item.querySelector('img');
                const photoSrc = img ? img.src : '';
                const photoAlt = img ? (img.alt || 'Gallery Photo') : '';
                const captionText = item.getAttribute('data-caption') || '';
                const dateText = item.getAttribute('data-date') || '';
                const initialLikes = Math.floor(Math.random() * 30) + 12;

                return `
                    <div class="lightbox-slide" id="lightbox-slide-${idx}">
                        <div class="lightbox-img-wrapper" id="img-wrapper-${idx}">
                            <img src="${photoSrc}" alt="${photoAlt}" loading="lazy">
                        </div>
                        <div class="lightbox-slide-info">
                            <div class="lightbox-slide-title">${photoAlt}</div>
                            ${captionText && captionText !== photoAlt ? `<div class="lightbox-slide-desc">${captionText}</div>` : ''}
                            <div style="display:flex; align-items:center; justify-content:center; gap:0.85rem; flex-wrap:wrap; margin-top:0.5rem;">
                                ${dateText ? `<div class="lightbox-slide-meta"><span>🕒 ${dateText}</span></div>` : ''}
                                <button class="like-btn" id="like-btn-${idx}" type="button">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                    <span id="like-count-${idx}">${initialLikes} Likes</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Attach double-tap and like click handlers for each slide
            itemsWithImages.forEach((_, idx) => {
                const wrapper = document.getElementById(`img-wrapper-${idx}`);
                const likeBtn = document.getElementById(`like-btn-${idx}`);
                const likeCountEl = document.getElementById(`like-count-${idx}`);
                let lastTap = 0;
                let isLiked = false;
                let currentLikes = parseInt(likeCountEl?.textContent || '15', 10);

                function triggerHeartPop() {
                    if (!wrapper) return;
                    const heart = document.createElement('div');
                    heart.className = 'heart-pop';
                    heart.innerHTML = `<svg width="84" height="84" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
                    wrapper.appendChild(heart);
                    setTimeout(() => heart.remove(), 820);

                    if (!isLiked) {
                        isLiked = true;
                        currentLikes++;
                        if (likeBtn) likeBtn.classList.add('liked');
                        if (likeCountEl) likeCountEl.textContent = `${currentLikes} Likes`;
                    }
                }

                if (wrapper) {
                    wrapper.addEventListener('click', () => {
                        const currentTime = new Date().getTime();
                        const tapLength = currentTime - lastTap;
                        if (tapLength < 300 && tapLength > 0) {
                            triggerHeartPop();
                        }
                        lastTap = currentTime;
                    });
                }

                if (likeBtn) {
                    likeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        isLiked = !isLiked;
                        currentLikes += isLiked ? 1 : -1;
                        likeBtn.classList.toggle('liked', isLiked);
                        if (likeCountEl) likeCountEl.textContent = `${currentLikes} Likes`;
                        if (isLiked) triggerHeartPop();
                    });
                }
            });

            lightbox.classList.add('open');
            document.body.style.overflow = 'hidden';

            // Instantly snap to the clicked photo (exact single screen alignment)
            setTimeout(() => {
                const targetSlide = document.getElementById(`lightbox-slide-${selectedIndex}`);
                if (targetSlide) {
                    targetSlide.scrollIntoView({ behavior: 'auto', block: 'start' });
                }
            }, 30);
        }

        itemsWithImages.forEach((item, index) => {
            item.addEventListener('click', () => {
                buildVerticalFeed(index);
            });
        });

        const closeLightbox = () => {
            lightbox.classList.remove('open');
            document.body.style.overflow = '';
        };

        lightboxClose?.addEventListener('click', closeLightbox);

        lightbox?.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target === scrollContainer) {
                closeLightbox();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('open')) return;
            if (e.key === 'Escape') closeLightbox();
        });
    }
});
