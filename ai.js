import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig, "ai-app");
const db = getFirestore(app);

window.toggleTheme = () => {
    const currentTheme = document.documentElement.dataset.theme || 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = newTheme;
    localStorage.setItem('msaukkuda:theme', newTheme);
};

document.addEventListener("DOMContentLoaded", () => {
    // Inject AI Widget UI
    const aiWidget = document.createElement('div');
    aiWidget.innerHTML = `
        <div id="aiChatWindow" style="display:none; position:fixed; bottom:90px; right:20px; width:340px; height:500px; background:var(--surface); border:1px solid var(--border); border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.3); z-index:9999; flex-direction:column; overflow:hidden;">
            <div style="background:var(--primary); color:white; padding:1rem; font-weight:bold; display:flex; justify-content:space-between; align-items:center;">
                <span>🤖 Campus AI (Gemini)</span>
                <div>
                    <button id="aiSettingsBtn" style="background:none; border:none; color:white; cursor:pointer; font-size:1.2rem; margin-right:8px;" title="Settings">⚙️</button>
                    <button id="aiCloseBtn" style="background:none; border:none; color:white; cursor:pointer; font-size:1.2rem;" title="Close">&times;</button>
                </div>
            </div>
            
            <div id="aiSettingsPanel" style="display:none; padding:1rem; background:var(--surface-raised); border-bottom:1px solid var(--border);">
                <label style="display:block; font-size:0.85rem; margin-bottom:0.5rem; color:var(--text-dim);">Gemini API Key</label>
                <input type="password" id="aiApiKeyInput" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:4px; background:var(--bg); color:var(--text-main); margin-bottom:0.5rem;" placeholder="AIzaSy...">
                <button id="aiSaveKeyBtn" style="width:100%; background:var(--primary); color:white; border:none; padding:0.5rem; border-radius:4px; cursor:pointer;">Save Key</button>
            </div>

            <div id="aiChatBody" style="flex:1; padding:1rem; overflow-y:auto; display:flex; flex-direction:column; gap:0.5rem; font-size:0.9rem;">
                <div style="background:var(--glass-heavy); padding:0.5rem; border-radius:8px; align-self:flex-start; max-width:85%;">
                    Hello! I am the intelligent Campus AI. Ask me anything about the institution!
                </div>
            </div>
            <div style="padding:0.5rem; border-top:1px solid var(--border); display:flex; gap:0.5rem;">
                <input type="text" id="aiInput" style="flex:1; padding:0.5rem; border:1px solid var(--border); border-radius:4px; background:var(--bg); color:var(--text-main);" placeholder="Ask me anything...">
                <button id="aiSendBtn" style="background:var(--primary); color:white; border:none; padding:0.5rem; border-radius:4px; cursor:pointer;">Send</button>
            </div>
        </div>
        <button id="aiToggleBtn" style="position:fixed; bottom:20px; left:20px; width:60px; height:60px; border-radius:50%; background:var(--primary); color:white; border:none; box-shadow:0 4px 12px rgba(37,99,235,0.4); font-size:1.5rem; cursor:pointer; z-index:9999; display:flex; align-items:center; justify-content:center; transition:transform 0.2s;">
            🤖
        </button>
    `;
    document.body.appendChild(aiWidget);

    const toggleBtn = document.getElementById('aiToggleBtn');
    const chatWindow = document.getElementById('aiChatWindow');
    const closeBtn = document.getElementById('aiCloseBtn');
    const settingsBtn = document.getElementById('aiSettingsBtn');
    const settingsPanel = document.getElementById('aiSettingsPanel');
    const apiKeyInput = document.getElementById('aiApiKeyInput');
    const saveKeyBtn = document.getElementById('aiSaveKeyBtn');
    
    const input = document.getElementById('aiInput');
    const sendBtn = document.getElementById('aiSendBtn');
    const chatBody = document.getElementById('aiChatBody');

    // Load API Key
    let geminiApiKey = localStorage.getItem('msaukkuda:gemini_key') || '';
    if (geminiApiKey) apiKeyInput.value = geminiApiKey;

    toggleBtn.addEventListener('click', () => {
        chatWindow.style.display = chatWindow.style.display === 'none' ? 'flex' : 'none';
        if(chatWindow.style.display === 'flex') input.focus();
    });
    
    closeBtn.addEventListener('click', () => chatWindow.style.display = 'none');
    
    settingsBtn.addEventListener('click', () => {
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
    });

    saveKeyBtn.addEventListener('click', () => {
        geminiApiKey = apiKeyInput.value.trim();
        localStorage.setItem('msaukkuda:gemini_key', geminiApiKey);
        settingsPanel.style.display = 'none';
        addMessage("API Key saved securely.", false);
    });

    let conversationHistory = [];

    const addMessage = (text, isUser = false) => {
        const div = document.createElement('div');
        div.style.padding = '0.5rem 0.75rem';
        div.style.borderRadius = '8px';
        div.style.maxWidth = '85%';
        div.style.alignSelf = isUser ? 'flex-end' : 'flex-start';
        div.style.background = isUser ? 'var(--primary)' : 'var(--glass-heavy)';
        div.style.color = isUser ? 'white' : 'var(--text-main)';
        // Simple bold markdown parser
        div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        chatBody.appendChild(div);
        chatBody.scrollTop = chatBody.scrollHeight;
    };

    const gatherContext = async () => {
        let stats = { students: 0, faculty: 0, admins: 0 };
        try {
            const stuSnap = await getDocs(collection(db, 'students'));
            stats.students = stuSnap.size;
            const usrSnap = await getDocs(collection(db, 'users'));
            usrSnap.forEach(d => {
                if(d.data().role === 'admin') stats.admins++;
                if(d.data().role === 'faculty') stats.faculty++;
            });
            return `System Context: You are the MSA Ukkuda Campus Assistant. The campus has ${stats.students} registered students, ${stats.faculty} faculty members, and ${stats.admins} administrators. Always be helpful, concise, and professional.`;
        } catch (e) {
            console.error("Context error:", e);
            return "System Context: You are the MSA Ukkuda Campus Assistant. Unable to fetch real-time stats.";
        }
    };

    const processAIQuery = async (query) => {
        if (!geminiApiKey) {
            addMessage("Please click the ⚙️ icon and enter a valid Gemini API Key first.", false);
            return;
        }

        // Add user query to history
        conversationHistory.push({ role: "user", parts: [{ text: query }] });

        // Add loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.style.alignSelf = 'flex-start';
        loadingDiv.textContent = 'Thinking...';
        loadingDiv.style.color = 'var(--text-dim)';
        loadingDiv.style.fontSize = '0.8rem';
        loadingDiv.id = 'aiLoadingIndicator';
        chatBody.appendChild(loadingDiv);
        chatBody.scrollTop = chatBody.scrollHeight;

        try {
            const context = await gatherContext();
            
            const payload = {
                system_instruction: { parts: [{ text: context }] },
                contents: conversationHistory
            };

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            const indicator = document.getElementById('aiLoadingIndicator');
            if (indicator) indicator.remove();

            if (data.error) {
                addMessage(`API Error: ${data.error.message}`, false);
                conversationHistory.pop(); // remove failed user query
                return;
            }

            const botText = data.candidates[0].content.parts[0].text;
            addMessage(botText, false);
            conversationHistory.push({ role: "model", parts: [{ text: botText }] });

        } catch(e) {
            console.error(e);
            const indicator = document.getElementById('aiLoadingIndicator');
            if (indicator) indicator.remove();
            addMessage("Network or Server error. Check console.", false);
            conversationHistory.pop();
        }
    };

    const handleSend = () => {
        const text = input.value.trim();
        if(!text) return;
        addMessage(text, true);
        input.value = '';
        processAIQuery(text);
    };

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleSend(); });
});
