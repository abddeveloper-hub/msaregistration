/**
 * MSA Registration Portal - Digital Student ID Card & Public Verification Engine
 */

(function (global) {
    'use strict';

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // --- 1. Canvas QRCode Spec Engine ---
    const QRCodeEngine = {
        render: function (canvas, text, options) {
            if (!canvas) return;
            const opts = Object.assign({
                size: 260,
                colorDark: '#000000',
                colorLight: '#ffffff'
            }, options);

            const ctx = canvas.getContext('2d');
            const scale = Math.max(window.devicePixelRatio || 1, 2);
            const renderSize = opts.size * scale;
            canvas.width = renderSize;
            canvas.height = renderSize;

            ctx.imageSmoothingEnabled = false;

            try {
                const QRModel = window.QRCodeModel || (typeof QRCodeModel !== 'undefined' ? QRCodeModel : null);
                if (!QRModel) return;

                const getUTF8Len = (str) => str.replace(/[\u0080-\u07ff]/g, 'aa').replace(/[\u0800-\uffff]/g, 'aaa').length;
                const len = getUTF8Len(text);
                let typeNum = 4;
                if (len > 120) typeNum = 10;
                else if (len > 80) typeNum = 8;
                else if (len > 50) typeNum = 6;

                const qr = new QRModel(typeNum, 0); // Level M
                qr.addData(text);
                qr.make();

                const count = qr.getModuleCount();
                const cellSize = renderSize / count;

                // Pure White Background
                ctx.fillStyle = opts.colorLight;
                ctx.fillRect(0, 0, renderSize, renderSize);

                // High Contrast Black Modules
                ctx.fillStyle = opts.colorDark;
                for (let r = 0; r < count; r++) {
                    for (let c = 0; c < count; c++) {
                        if (qr.isDark(r, c)) {
                            ctx.fillRect(
                                Math.floor(c * cellSize),
                                Math.floor(r * cellSize),
                                Math.ceil(cellSize),
                                Math.ceil(cellSize)
                            );
                        }
                    }
                }

                // Center logo
                if (opts.logoSrc) {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = function () {
                        const logoSize = renderSize * 0.18;
                        const pos = (renderSize - logoSize) / 2;
                        ctx.fillStyle = opts.colorLight;
                        ctx.beginPath();
                        ctx.arc(renderSize / 2, renderSize / 2, logoSize / 2 + (4 * scale), 0, Math.PI * 2);
                        ctx.fill();
                        ctx.drawImage(img, pos, pos, logoSize, logoSize);
                    };
                    img.src = opts.logoSrc;
                }
            } catch (err) {
                console.error("QRCodeEngine render error:", err);
            }
        }
    };

    // --- 2. ID Card & Public Verification Controller ---
    const IDCardController = {
        currentStudent: {
            id: "01",
            name: "Muhammad Muwaz",
            role: "Student",
            dept: "Islamic Studies & Computer Science",
            batch: "Batch 1",
            bloodGroup: "O+",
            issued: "01 Jan 2024",
            expiry: "31 Dec 2026",
            status: "VERIFIED ACTIVE",
            photo: "logo.png?v=2"
        },

        init: function () {
            this.bindEvents();
            this.loadStoredProfile();
            this.renderCard();
            this.checkURLVerification();
        },

        buildPublicVerifyURL: function (id, name) {
            let origin = window.location.origin;
            if (!origin || origin === "null" || window.location.protocol === "file:") {
                origin = "https://msaregistration.web.app";
            }
            let path = window.location.pathname;
            if (!path.endsWith('/')) {
                path = path.replace(/[^/]*$/, '');
            }
            return `${origin}${path}index.html?verify=${encodeURIComponent(id || '01')}&name=${encodeURIComponent(name || 'Student')}`;
        },

        checkURLVerification: function () {
            try {
                const params = new URLSearchParams(window.location.search);
                const verifyId = params.get('verify') || params.get('studentId') || params.get('id');
                const verifyName = params.get('name');
                if (verifyId) {
                    setTimeout(() => {
                        this.openPublicVerificationModal(verifyId, verifyName);
                    }, 300);
                }
            } catch (e) {
                console.warn("Error parsing URL verify params:", e);
            }
        },

        loadStoredProfile: function () {
            try {
                const storedUser = localStorage.getItem("msaukkuda:user") || localStorage.getItem("userProfile");
                if (storedUser) {
                    const parsed = JSON.parse(storedUser);
                    if (parsed.name || parsed.fullName) this.currentStudent.name = parsed.name || parsed.fullName;
                    if (parsed.id || parsed.admissionNo || parsed.rollNumber) this.currentStudent.id = parsed.id || parsed.admissionNo || parsed.rollNumber;
                    if (parsed.dept || parsed.department) this.currentStudent.dept = parsed.dept || parsed.department;
                    if (parsed.bloodGroup) this.currentStudent.bloodGroup = parsed.bloodGroup;
                    if (parsed.photo || parsed.photoUrl) this.currentStudent.photo = parsed.photo || parsed.photoUrl;
                }
            } catch (e) {
                console.warn("Could not parse stored student profile", e);
            }
        },

        renderCard: function () {
            const s = this.currentStudent;

            const nameEl = document.getElementById("idCardName");
            const roleEl = document.getElementById("idCardRole");
            const numberEl = document.getElementById("idCardNumber");
            const deptEl = document.getElementById("idCardDept");
            const batchEl = document.getElementById("idCardBatch");
            const bloodEl = document.getElementById("idCardBlood");
            const expiryEl = document.getElementById("idCardExpiry");
            const statusEl = document.getElementById("idCardStatus");
            const photoEl = document.getElementById("idCardPhoto");
            const qrCanvas = document.getElementById("idCardQRCanvas");

            if (nameEl) nameEl.textContent = s.name;
            if (roleEl) roleEl.textContent = s.role;
            if (numberEl) numberEl.textContent = s.id;
            if (deptEl) deptEl.textContent = s.dept;
            if (batchEl) batchEl.textContent = s.batch;
            if (bloodEl) bloodEl.textContent = s.bloodGroup;
            if (expiryEl) expiryEl.textContent = s.expiry;
            if (statusEl) statusEl.textContent = s.status;
            if (photoEl) photoEl.src = s.photo;

            const qrData = this.buildPublicVerifyURL(s.id, s.name);

            if (qrCanvas) {
                QRCodeEngine.render(qrCanvas, qrData, {
                    size: 140,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    logoSrc: "logo.png?v=2"
                });
            }

            const backNameEl = document.getElementById("idCardBackName");
            const backIdEl = document.getElementById("idCardBackId");
            const backBarcodeEl = document.getElementById("idCardBarcodeText");
            if (backNameEl) backNameEl.textContent = s.name;
            if (backIdEl) backIdEl.textContent = s.id;
            if (backBarcodeEl) backBarcodeEl.textContent = "*" + String(s.id).replace(/-/g, "") + "*";
        },

        bindEvents: function () {
            document.addEventListener("click", (e) => {
                const target = e.target.closest("#openQRScannerBtn, .open-qr-verify-btn");
                if (target) {
                    e.preventDefault();
                    this.openVerificationModal();
                }
            });

            const flipBtn = document.getElementById("flipCardBtn");
            const cardContainer = document.getElementById("idCard3DContainer");
            if (flipBtn && cardContainer) {
                flipBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    cardContainer.classList.toggle("flipped");
                });
                cardContainer.addEventListener("click", () => {
                    cardContainer.classList.toggle("flipped");
                });
            }

            const downloadBtn = document.getElementById("downloadCardBtn");
            if (downloadBtn) {
                downloadBtn.addEventListener("click", () => this.downloadIDCardPNG());
            }

            const printBtn = document.getElementById("printCardBtn");
            if (printBtn) {
                printBtn.addEventListener("click", () => window.print());
            }

            const photoInput = document.getElementById("idCardPhotoInput");
            const photoBtn = document.getElementById("uploadPhotoBtn");
            if (photoBtn && photoInput) {
                photoBtn.addEventListener("click", () => photoInput.click());
                photoInput.addEventListener("change", (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                            this.currentStudent.photo = evt.target.result;
                            this.renderCard();
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
        },

        downloadIDCardPNG: function () {
            const cardFront = document.getElementById("idCardFront");
            if (!cardFront) return;

            const canvas = document.createElement("canvas");
            const width = 640;
            const height = 400;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");

            const grad = ctx.createLinearGradient(0, 0, width, height);
            grad.addColorStop(0, '#0a192f');
            grad.addColorStop(0.5, '#0f2b48');
            grad.addColorStop(1, '#020c1b');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, width, height);

            ctx.fillStyle = "#d4af37";
            ctx.fillRect(0, 0, width, 12);
            ctx.fillRect(0, height - 12, width, 12);

            ctx.fillStyle = "#d4af37";
            ctx.font = "bold 22px 'Aref Ruqaa', Georgia, serif";
            ctx.fillText("MUHYISSUNNAH DARS UKKUDA", 30, 48);

            ctx.fillStyle = "#a8b2d1";
            ctx.font = "12px sans-serif";
            ctx.fillText("OFFICIAL DIGITAL STUDENT IDENTIFICATION", 30, 68);

            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                ctx.strokeStyle = "#d4af37";
                ctx.lineWidth = 3;
                ctx.strokeRect(30, 95, 110, 130);
                ctx.drawImage(img, 30, 95, 110, 130);

                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 20px sans-serif";
                ctx.fillText(this.currentStudent.name, 160, 118);

                ctx.fillStyle = "#64ffda";
                ctx.font = "bold 13px monospace";
                ctx.fillText("ID: " + this.currentStudent.id, 160, 142);

                ctx.fillStyle = "#8892b0";
                ctx.font = "12px sans-serif";
                ctx.fillText("Department: " + this.currentStudent.dept, 160, 168);
                ctx.fillText("Batch: " + this.currentStudent.batch, 160, 188);
                ctx.fillText("Blood Group: " + this.currentStudent.bloodGroup, 160, 208);
                ctx.fillText("Valid Until: " + this.currentStudent.expiry, 160, 228);

                ctx.fillStyle = "#00e676";
                ctx.fillRect(30, 245, 110, 24);
                ctx.fillStyle = "#000000";
                ctx.font = "bold 10px sans-serif";
                ctx.fillText(this.currentStudent.status, 38, 261);

                const qrCanvas = document.getElementById("idCardQRCanvas");
                if (qrCanvas) {
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(width - 150, 95, 120, 120);
                    ctx.drawImage(qrCanvas, width - 150, 95, 120, 120);

                    ctx.fillStyle = "#a8b2d1";
                    ctx.font = "10px monospace";
                    ctx.fillText("SCAN TO VERIFY", width - 145, 230);
                }

                ctx.fillStyle = "#4a5568";
                ctx.font = "italic 10px sans-serif";
                ctx.fillText("This card is computer generated and property of MSA Ukkuda.", 30, 365);

                const a = document.createElement("a");
                a.download = `Student_ID_${this.currentStudent.id}.png`;
                a.href = canvas.toDataURL("image/png");
                a.click();
            };
            img.src = this.currentStudent.photo;
        },

        openPublicVerificationModal: function (id, name) {
            let modal = document.getElementById("publicCredentialVerifyModal");
            const studentId = decodeURIComponent(id || "01");
            const studentName = decodeURIComponent(name || "Muhammad Muwaz");

            if (!modal) {
                modal = document.createElement("div");
                modal.id = "publicCredentialVerifyModal";
                modal.className = "modal-overlay";
                document.body.appendChild(modal);
            }

            modal.innerHTML = `
                <div class="modal-card glassmorphism-card" style="max-width:540px; width:92%; padding:1.75rem; border-radius:24px; background:linear-gradient(145deg, #091a2f 0%, #082820 100%); color:#ffffff; position:relative; box-shadow:0 30px 70px rgba(0,0,0,0.85); border:2px solid #D4AF37; z-index:99999; max-height:92vh; overflow-y:auto;">
                    <button id="closePublicVerifyModal" style="position:absolute; top:16px; right:16px; background:rgba(255,255,255,0.1); border:none; color:#ffffff; font-size:1.5rem; cursor:pointer; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; z-index:10;">&times;</button>
                    
                    <!-- Header Seal -->
                    <div style="text-align:center; margin-bottom:1.25rem;">
                        <img src="logo.png?v=2" alt="MSA Ukkuda Logo" style="width:52px; height:52px; margin:0 auto 0.4rem; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));">
                        <div style="font-family:'Aref Ruqaa',serif; font-size:1.35rem; color:#D4AF37; font-weight:bold;">MUHYISSUNNAH DARS UKKUDA</div>
                        <div style="font-size:0.7rem; letter-spacing:0.15em; color:#00e676; text-transform:uppercase; margin-top:0.2rem; font-weight:bold;">&#10004; OFFICIAL VERIFIED DIGITAL STUDENT ID CARD</div>
                    </div>

                    <!-- 3D Student ID Card Visual -->
                    <div class="id-card-3d-scene" style="height:280px; margin-bottom:1.25rem;">
                        <div class="id-card-3d-card" id="pubCard3DContainer" title="Click to Flip Card">
                            <!-- FRONT SIDE -->
                            <div class="id-card-face id-card-front" style="background:linear-gradient(135deg, #091a2f 0%, #0f3456 50%, #030d1a 100%); padding:1.25rem;">
                                <div class="id-card-hologram"></div>
                                <div class="id-card-header">
                                    <div>
                                        <div style="font-family:'Aref Ruqaa', serif; font-size:1.05rem; color:#d4af37; font-weight:bold;">MUHYISSUNNAH DARS UKKUDA</div>
                                        <div style="font-size:0.58rem; color:#a8b2d1; letter-spacing:0.1em; text-transform:uppercase;">Official Student Credentials</div>
                                    </div>
                                    <img src="logo.png?v=2" alt="Logo" style="width:30px; height:30px;">
                                </div>
                                <div class="id-card-body">
                                    <div class="id-card-photo-box" style="width:85px; height:105px;">
                                        <img src="logo.png?v=2" alt="Student Photo">
                                    </div>
                                    <div class="id-card-info-fields">
                                        <span class="label">Full Name</span>
                                        <span class="value" style="font-size:0.95rem; font-weight:bold;">${escapeHtml(studentName)}</span>
                                        <span class="label" style="margin-top:0.2rem;">ID Number</span>
                                        <span class="value" style="color:#64ffda; font-family:monospace; font-weight:bold;">ID: ${escapeHtml(studentId)}</span>
                                        <span class="label" style="margin-top:0.2rem;">Department</span>
                                        <span class="value" style="font-size:0.75rem;">Islamic Studies</span>
                                    </div>
                                    <div class="id-card-qr-box" style="width:80px; height:80px; padding:4px;">
                                        <canvas id="pubCardQRCanvas" style="width:72px!important; height:72px!important;"></canvas>
                                    </div>
                                </div>
                                <div class="id-card-footer">
                                    <div>VALID: <strong style="color:#fff;">31 Dec 2026</strong></div>
                                    <div>BLOOD: <strong style="color:#ff5252;">O+</strong></div>
                                    <div style="background:#00e676; color:#000; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:0.65rem;">VERIFIED</div>
                                </div>
                            </div>

                            <!-- BACK SIDE -->
                            <div class="id-card-face id-card-back" style="background:linear-gradient(135deg, #030c17 0%, #0a2239 100%); padding:1.25rem;">
                                <div class="id-card-hologram"></div>
                                <div style="background:#111; height:32px; margin:-1.25rem -1.25rem 0.5rem -1.25rem; display:flex; align-items:center; padding-left:1.25rem; font-family:monospace; font-size:0.6rem; color:#888;">MAGNETIC STRIPE / INSTITUTION BADGE</div>
                                <div style="font-size:0.75rem; color:#a8b2d1; display:flex; flex-direction:column; gap:0.35rem;">
                                    <div><strong>Holder:</strong> <span>${escapeHtml(studentName)}</span></div>
                                    <div><strong>System Key:</strong> <span>${escapeHtml(studentId)}</span></div>
                                    <div><strong>Emergency Contact:</strong> +91 98765 43210</div>
                                    <div style="font-size:0.62rem; color:#666; margin-top:0.2rem;">This credential is non-transferable and property of Muhyissunnah Dars Ukkuda.</div>
                                </div>
                                <div style="text-align:center; margin-top:auto; padding-top:0.4rem; border-top:1px dashed rgba(255,255,255,0.2);">
                                    <div style="font-family:'Courier New', monospace; font-size:1rem; letter-spacing:0.25em; color:#fff;">*${escapeHtml(studentId)}*</div>
                                    <div style="font-size:0.58rem; color:#8892b0;">AUTHENTICATED BADGE</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Details Summary Card -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; background:rgba(255,255,255,0.04); padding:1rem; border-radius:14px; border:1px solid rgba(255,255,255,0.1); font-size:0.85rem; margin-bottom:1.25rem;">
                        <div><strong style="color:#8892b0; font-size:0.7rem; text-transform:uppercase;">Student Name</strong><br><span style="color:#ffffff; font-weight:bold; font-size:0.95rem;">${escapeHtml(studentName)}</span></div>
                        <div><strong style="color:#8892b0; font-size:0.7rem; text-transform:uppercase;">Roll / Student ID</strong><br><span style="color:#64ffda; font-family:monospace; font-weight:bold; font-size:0.95rem;">ID: ${escapeHtml(studentId)}</span></div>
                        <div><strong style="color:#8892b0; font-size:0.7rem; text-transform:uppercase;">Batch / Dars</strong><br><span style="color:#ffffff;">Batch 1 (Islamic Studies)</span></div>
                        <div><strong style="color:#8892b0; font-size:0.7rem; text-transform:uppercase;">Enrollment Status</strong><br><span style="color:#00e676; font-weight:bold;">Active Enrolled Student</span></div>
                    </div>

                    <!-- Controls -->
                    <div style="display:flex; gap:0.75rem; justify-content:center; flex-wrap:wrap;">
                        <button id="pubFlipCardBtn" class="btn btn-outline" style="flex:1; min-width:140px;">&#128472; Flip Card (3D)</button>
                        <button id="closePubVerifyBtn" class="btn btn-main" style="flex:1; min-width:140px; background:#0F4C3A; color:#fff;">Close ID Card</button>
                    </div>
                </div>
            `;

            modal.style.display = "flex";
            requestAnimationFrame(() => modal.classList.add("active"));

            // Render mini QR code on public ID card front
            setTimeout(() => {
                const qrCanvas = document.getElementById("pubCardQRCanvas");
                if (qrCanvas && window.QRCodeEngine) {
                    window.QRCodeEngine.render(qrCanvas, this.buildPublicVerifyURL(studentId, studentName), {
                        size: 72,
                        colorDark: "#000000",
                        colorLight: "#ffffff"
                    });
                }
            }, 100);

            // Flip Card Action
            const pubFlipBtn = document.getElementById("pubFlipCardBtn");
            const pubCardContainer = document.getElementById("pubCard3DContainer");
            if (pubFlipBtn && pubCardContainer) {
                pubFlipBtn.onclick = (e) => {
                    e.stopPropagation();
                    pubCardContainer.classList.toggle("flipped");
                };
                pubCardContainer.onclick = () => {
                    pubCardContainer.classList.toggle("flipped");
                };
            }

            const closeModal = () => {
                modal.classList.remove("active");
                setTimeout(() => modal.style.display = "none", 200);
            };

            const closeBtn = document.getElementById("closePublicVerifyModal");
            const closeBottomBtn = document.getElementById("closePubVerifyBtn");
            if (closeBtn) closeBtn.onclick = closeModal;
            if (closeBottomBtn) closeBottomBtn.onclick = closeModal;
            modal.onclick = (e) => { if (e.target === modal) closeModal(); };
        },

        openVerificationModal: function () {
            let modal = document.getElementById("qrVerifyModal");
            if (!modal) {
                modal = document.createElement("div");
                modal.id = "qrVerifyModal";
                modal.className = "modal-overlay";
                modal.innerHTML = `
                    <div class="modal-card glassmorphism-card" style="max-width:480px; width:90%; padding:2rem; border-radius:16px; background:#0d1b2a; color:#ffffff; position:relative; box-shadow:0 25px 50px rgba(0,0,0,0.7); border:1px solid rgba(212,175,55,0.4); z-index:2001;">
                        <button id="closeQRVerifyModal" style="position:absolute; top:15px; right:15px; background:none; border:none; color:#ffffff; font-size:1.6rem; cursor:pointer; padding:4px 8px;">&times;</button>
                        <h3 style="font-family:'Cinzel',serif; color:#d4af37; margin-bottom:0.5rem; font-size:1.4rem;">Student ID QR Scanner & Verifier</h3>
                        <p style="font-size:0.85rem; color:#a8b2d1; margin-bottom:1.5rem;">Enter or scan the verification URL/code from the student ID card.</p>
                        
                        <div style="display:flex; flex-direction:column; gap:1rem;">
                            <textarea id="qrInputData" placeholder="Paste QR URL string (e.g. https://.../index.html?verify=01)" rows="3" style="width:100%; padding:0.75rem; border-radius:8px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.4); color:#fff; font-family:monospace; font-size:0.85rem;"></textarea>
                            <button id="runVerifyBtn" class="btn btn-main" style="width:100%; padding:0.75rem; font-weight:600; background:#0F4C3A; color:#ffffff;">Validate Credentials</button>
                        </div>
                        
                        <div id="verifyResultContainer" style="margin-top:1.5rem; display:none; padding:1rem; border-radius:8px; background:rgba(0,230,118,0.15); border:1px solid #00e676;">
                            <div style="display:flex; align-items:center; gap:0.75rem; color:#00e676; font-weight:bold;">
                                <span>&#10004;</span>
                                <span id="verifyResultTitle">CREDENTIAL VERIFIED</span>
                            </div>
                            <div id="verifyResultBody" style="font-size:0.85rem; color:#ffffff; margin-top:0.5rem;"></div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }

            modal.style.display = "flex";
            requestAnimationFrame(() => modal.classList.add("active"));

            const closeModal = () => {
                modal.classList.remove("active");
                setTimeout(() => modal.style.display = "none", 200);
            };

            const closeBtn = document.getElementById("closeQRVerifyModal");
            if (closeBtn) closeBtn.onclick = closeModal;
            modal.onclick = (e) => { if (e.target === modal) closeModal(); };

            const runBtn = document.getElementById("runVerifyBtn");
            const inputField = document.getElementById("qrInputData");
            const resultBox = document.getElementById("verifyResultContainer");
            const resultTitle = document.getElementById("verifyResultTitle");
            const resultBody = document.getElementById("verifyResultBody");

            if (runBtn && inputField) {
                runBtn.onclick = () => {
                    const rawVal = inputField.value.trim();
                    if (!rawVal) {
                        alert("Please enter a QR URL or Student ID code.");
                        return;
                    }

                    try {
                        let parsedId = rawVal;
                        let parsedName = "Student Record";
                        if (rawVal.includes("verify=")) {
                            const urlObj = new URL(rawVal, window.location.origin);
                            parsedId = urlObj.searchParams.get("verify") || rawVal;
                            parsedName = urlObj.searchParams.get("name") || "Student Record";
                        } else if (rawVal.startsWith("{")) {
                            const parsed = JSON.parse(rawVal);
                            parsedId = parsed.id || rawVal;
                            parsedName = parsed.name || "Student Record";
                        }

                        this.openPublicVerificationModal(parsedId, parsedName);
                    } catch (e) {
                        resultBox.style.display = "block";
                        resultBox.style.borderColor = "#ff5252";
                        resultBox.style.background = "rgba(255, 82, 82, 0.15)";
                        resultTitle.style.color = "#ff5252";
                        resultTitle.textContent = "UNVERIFIED OR EXPIRED CODE";
                        resultBody.textContent = "The code provided could not be matched against active institutional records.";
                    }
                };
            }
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => IDCardController.init());
    } else {
        IDCardController.init();
    }

    global.QRCodeEngine = QRCodeEngine;
    global.IDCardEngine = IDCardController;
})(window);
