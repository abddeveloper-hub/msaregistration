const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();

/**
 * Cloud Function: Triggered every time a document is added to "notifications" collection.
 * Reads all registered push tokens from "push_tokens" collection and sends FCM push to each.
 */
exports.sendPushOnNewNotification = onDocumentCreated(
    { document: "notifications/{notifId}", region: "us-central1" },
    async (event) => {
        const notifData = event.data?.data();
        if (!notifData) return null;

        const title = notifData.title || "MSA Portal";
        const body = notifData.message || notifData.body || "You have a new notification.";
        const link = notifData.link || "./";
        const type = notifData.type || "announcement";

        console.log(`[FCM] New notification received: "${title}" — dispatching to all tokens...`);

        // Load all device push tokens from Firestore
        let tokensSnap;
        try {
            tokensSnap = await db.collection("push_tokens").get();
        } catch (err) {
            console.error("[FCM] Failed to read push_tokens:", err);
            return null;
        }

        if (!tokensSnap || tokensSnap.empty) {
            console.log("[FCM] No registered push tokens found. Nothing to dispatch.");
            return null;
        }

        const messaging = getMessaging();
        const staleTokens = [];
        const sendPromises = [];

        tokensSnap.forEach((tokenDoc) => {
            const tokenData = tokenDoc.data();
            const token = tokenData?.token;
            if (!token) return;

            const message = {
                token: token,
                notification: {
                    title: title,
                    body: body,
                },
                data: {
                    title: title,
                    message: body,
                    link: link,
                    type: type,
                    notifId: event.params.notifId || ""
                },
                android: {
                    priority: "high",
                    notification: {
                        channelId: "msa_portal_alerts",
                        sound: "default",
                        vibrateTimingsMillis: [300, 100, 300, 100, 300],
                        clickAction: "FLUTTER_NOTIFICATION_CLICK"
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: "default",
                            badge: 1,
                            contentAvailable: true
                        }
                    },
                    headers: {
                        "apns-priority": "10"
                    }
                },
                webpush: {
                    notification: {
                        title: title,
                        body: body,
                        icon: "./icon-192.png",
                        badge: "./icon-192.png",
                        requireInteraction: true
                    },
                    headers: {
                        Urgency: "high"
                    },
                    data: {
                        link: link,
                        type: type
                    },
                    fcmOptions: {
                        link: link
                    }
                }
            };

            const sendPromise = messaging.send(message).then((response) => {
                console.log(`[FCM] Push sent to token ...${token.slice(-20)}:`, response);
            }).catch((err) => {
                // Mark invalid/expired tokens for cleanup
                const errCode = err.errorInfo?.code || "";
                if (
                    errCode === "messaging/invalid-registration-token" ||
                    errCode === "messaging/registration-token-not-registered"
                ) {
                    staleTokens.push(tokenDoc.id);
                }
                console.warn(`[FCM] Push failed for token ...${token.slice(-20)}:`, errCode || err.message);
            });

            sendPromises.push(sendPromise);
        });

        await Promise.allSettled(sendPromises);

        // Clean up expired/invalid device tokens from Firestore
        if (staleTokens.length > 0) {
            console.log(`[FCM] Removing ${staleTokens.length} stale token(s) from Firestore...`);
            const batch = db.batch();
            staleTokens.forEach((docId) => {
                batch.delete(db.collection("push_tokens").doc(docId));
            });
            await batch.commit().catch((e) => console.warn("[FCM] Batch delete notice:", e));
        }

        console.log(`[FCM] Dispatch complete for notification: "${title}"`);
        return null;
    }
);
