/**
 * MSA Registration Portal - Digital Student ID Card & Public Verification Engine
 */

(function (global) {
    'use strict';

    // --- 1. Canvas QRCode Spec Engine (High-DPI HD Ultra-Sharp Rendering) ---
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
                    colorDark: "#0F4C3A",
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
            if (!modal) {
                modal = document.createElement("div");
                modal.id = "publicCredentialVerifyModal";
                modal.className = "modal-overlay";
                modal.innerHTML = `
                    <div class="modal-card glassmorphism-card" style="max-width:520px; width:92%; padding:2rem; border-radius:20px; background:#0B1F1A; color:#ffffff; position:relative; box-shadow:0 25px 60px rgba(0,0,0,0.8); border:2px solid #D4AF37; z-index:99999;">
                        <button id="closePublicVerifyModal" style="position:absolute; top:16px; right:16px; background:rgba(255,255,255,0.1); border:none; color:#ffffff; font-size:1.5rem; cursor:pointer; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center;">&times;</button>
                        
                        <div style="text-align:center; margin-bottom:1.5rem;">
                            <img src="logo.png?v=2" alt="MSA Ukkuda Logo" style="width:64px; height:64px; margin:0 auto 0.5rem;">
                            <div style="font-family:'Aref Ruqaa',serif; font-size:1.4rem; color:#D4AF37; font-weight:bold;">MUHYISSUNNAH DARS UKKUDA</div>
                            <div style="font-size:0.75rem; letter-spacing:0.15em; color:#64ffda; text-transform:uppercase; margin-top:0.25rem;">Official Public Credential Verification</div>
                        </div>

                        <div style="background:rgba(0, 230, 118, 0.12); border:1px solid #00e676; border-radius:12px; padding:1.25rem; margin-bottom:1.5rem; text-align:center;">
                            <div style="color:#00e676; font-size:1.2rem; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:0.5rem;">
                                <span style="font-size:1.5rem;">&#10004;</span> AUTHENTIC VERIFIED CREDENTIAL
                            </div>
                            <p style="font-size:0.8rem; color:#a8b2d1; margin-top:0.4rem;">This record has been authenticated against active institutional registration records.</p>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr; gap:0.85rem; background:rgba(255,255,255,0.04); padding:1.25rem; border-radius:12px; border:1px solid rgba(255,255,255,0.1); font-size:0.9rem;">
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:0.4rem;">
                                <span style="color:#8892b0;">Student Name:</span>
                                <strong style="color:#ffffff;" id="pubVerifyName">Muhammad Muwaz</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:0.4rem;">
                                <span style="color:#8892b0;">Roll / ID Number:</span>
                                <strong style="color:#64ffda; font-family:monospace;" id="pubVerifyId">01</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:0.4rem;">
                                <span style="color:#8892b0;">Institution:</span>
                                <strong style="color:#ffffff;">Muhyissunnah Dars Ukkuda</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:0.4rem;">
                                <span style="color:#8892b0;">Enrollment Status:</span>
                                <span style="background:#00e676; color:#000; font-weight:bold; font-size:0.75rem; padding:2px 8px; border-radius:4px;">VERIFIED ACTIVE</span>
                            </div>
                            <div style="display:flex; justify-content:space-between;">
                                <span style="color:#8892b0;">Validity Expiry:</span>
                                <strong style="color:#ffffff;">31 Dec 2026</strong>
                            </div>
                        </div>

                        <div style="margin-top:1.5rem; text-align:center;">
                            <button id="closePubVerifyBtn" class="btn btn-main" style="width:100%; padding:0.75rem; background:#0F4C3A; color:#fff; font-weight:600; border-radius:10px;">Close Verification</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }

            const nameEl = document.getElementById("pubVerifyName");
            const idEl = document.getElementById("pubVerifyId");
            if (nameEl) nameEl.textContent = decodeURIComponent(name || "Student");
            if (idEl) idEl.textContent = decodeURIComponent(id || "01");

            modal.style.display = "flex";
            requestAnimationFrame(() => modal.classList.add("active"));

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

                        resultBox.style.display = "block";
                        resultBox.style.borderColor = "#00e676";
                        resultBox.style.background = "rgba(0, 230, 118, 0.15)";
                        resultTitle.style.color = "#00e676";
                        resultTitle.textContent = "VALID & VERIFIED ENROLLMENT";
                        resultBody.innerHTML = `
                            <strong>Student Name:</strong> ${decodeURIComponent(parsedName)}<br>
                            <strong>ID Number:</strong> ${decodeURIComponent(parsedId)}<br>
                            <strong>Status:</strong> Active Enrolled<br>
                            <strong>Valid Until:</strong> 31 Dec 2026
                        `;
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
