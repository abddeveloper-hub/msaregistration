import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const urlParams = new URLSearchParams(window.location.search);
const formId = urlParams.get('id');

const formTitle = document.getElementById('formTitle');
const formContainer = document.getElementById('dynamicFormContainer');
const submitBtn = document.getElementById('submitFormBtn');
const msg = document.getElementById('formMsg');

let formSchema = null;

async function loadForm() {
    if (!formId) {
        formTitle.textContent = "Invalid Form URL";
        return;
    }
    
    try {
        const docSnap = await getDoc(doc(db, "custom_forms", formId));
        if (docSnap.exists()) {
            formSchema = docSnap.data();
            formTitle.textContent = formSchema.name;
            renderFormFields();
        } else {
            formTitle.textContent = "Form not found or has been removed.";
        }
    } catch (err) {
        formTitle.textContent = "Error loading form: " + err.message;
    }
}

function renderFormFields() {
    formContainer.innerHTML = '';
    formSchema.fields.forEach((field, index) => {
        const div = document.createElement('div');
        div.className = 'input-field';
        
        const label = document.createElement('label');
        label.className = 'label';
        label.textContent = field.label + (field.required ? ' *' : '');
        div.appendChild(label);
        
        if (field.type === 'textarea') {
            const input = document.createElement('textarea');
            input.className = 'input';
            input.required = field.required;
            input.id = 'field_' + index;
            input.rows = 4;
            div.appendChild(input);
        } else {
            const input = document.createElement('input');
            input.type = field.type;
            input.className = 'input';
            input.required = field.required;
            input.id = 'field_' + index;
            div.appendChild(input);
        }
        
        formContainer.appendChild(div);
    });
    
    formContainer.style.display = 'flex';
    submitBtn.style.display = 'block';
}

submitBtn.addEventListener('click', async () => {
    // Validate
    let isValid = true;
    const formData = {};
    
    formSchema.fields.forEach((field, index) => {
        const el = document.getElementById('field_' + index);
        if (field.required && !el.value.trim()) {
            isValid = false;
            el.style.borderColor = 'var(--error)';
        } else {
            el.style.borderColor = 'var(--border)';
            formData[field.label] = el.value.trim();
        }
    });
    
    if (!isValid) {
        msg.textContent = 'Please fill out all required fields.';
        msg.style.color = 'var(--error)';
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    
    try {
        await addDoc(collection(db, "form_responses"), {
            formId: formId,
            formName: formSchema.name,
            responses: formData,
            submittedAt: new Date().toISOString()
        });
        
        formContainer.innerHTML = '';
        submitBtn.style.display = 'none';
        msg.textContent = 'Thank you! Your response has been submitted successfully.';
        msg.style.color = 'var(--success)';
        msg.style.fontSize = '1.1rem';
        msg.style.fontWeight = '600';
    } catch(err) {
        msg.textContent = 'Submission error: ' + err.message;
        msg.style.color = 'var(--error)';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Response';
    }
});

loadForm();
