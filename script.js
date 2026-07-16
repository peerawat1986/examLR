const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwim-zIawKEQ_7Oh8bjJIMxhyfObInAXyX9F7TKp2kH7a7n07ChHGy8BqC3KpJ4GRSTXw/exec"; // TODO: วาง URL ที่ได้จากขั้นตอน Deploy Google Apps Script

// App State
let exams = [];
let currentExamTaking = null;
let currentStudent = null;
let currentAdmin = null;
let allSubjects = [];

// Helper function to call the GAS API
async function callApi(action, payload = {}) {
    payload.action = action;
    try {
        const response = await fetch(GAS_API_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                'Content-Type': 'text/plain;charset=utf-8' // Use text/plain to avoid CORS preflight issues
            }
        });
        const data = await response.json();
        if (data && data.error) {
            throw new Error(data.error);
        }
        return data;
    } catch (error) {
        throw error;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Block LINE In-App Browser
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    if (ua.indexOf("Line") > -1 || ua.indexOf("LINE") > -1) {
        document.body.innerHTML = `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; background-color:#0f172a; color:white; text-align:center; padding:2rem;">
                <h1 style="font-size:4rem; margin-bottom:1rem;">⚠️</h1>
                <h2 style="color:#ef4444; margin-bottom:1rem;">ไม่อนุญาตให้เปิดผ่านแอป LINE</h2>
                <p style="font-size:1.2rem; line-height:1.8; color:#94a3b8;">
                    เพื่อประสิทธิภาพในการสอบและป้องกันปัญหาหน้าจอ<br>
                    กรุณากดที่เมนู (ไอคอนจุด 3 จุด)<br>
                    แล้วเลือก <b>"เปิดด้วยเบราว์เซอร์อื่น"</b><br>
                    (Open in other app / Chrome / Safari)
                </p>
            </div>
        `;
        return;
    }

    showLoading();

    // Fetch initial data
    Promise.all([
        callApi('getExams'),
        callApi('getTeachersAndSubjects'),
        callApi('getTeachersForLogin')
    ]).then(([serverExams, subjectData, loginTeachers]) => {
        exams = serverExams || [];
        allSubjects = subjectData || [];

        const loginSelect = document.getElementById('admin-login-name');
        loginSelect.innerHTML = '<option value="">-- เลือกชื่อครูผู้สอน --</option>' +
            loginTeachers.map(t => `<option value="${t}">${t}</option>`).join('');

        hideLoading();
        addQuestionField();
    }).catch(error => {
        console.error('Error loading initial data:', error);
        hideLoading();
        alert('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + error.message);
    });

    // Check if there was a pending exam submission due to a page refresh
    const pendingExamStr = sessionStorage.getItem('pendingExamSubmit');
    if (pendingExamStr) {
        const pendingExam = JSON.parse(pendingExamStr);
        // Submit immediately in the background
        callApi('submitExamScore', { data: pendingExam }).then(() => {
            sessionStorage.removeItem('pendingExamSubmit');
        }).catch(err => console.error("Auto submit failed:", err));

        alert('⚠️ ตรวจพบการรีเฟรชหรือออกจากหน้าจอระหว่างการทำข้อสอบ! ระบบได้ทำการส่งข้อสอบของคุณโดยอัตโนมัติแล้ว');
    }

    // Global Clock Interval
    setInterval(() => {
        const clockEl = document.getElementById('realtime-clock');
        if (clockEl) {
            clockEl.textContent = new Date().toLocaleString('th-TH');
        }
    }, 1000);
});

function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function handleAdminLogin(e) {
    e.preventDefault();
    const name = document.getElementById('admin-login-name').value;
    const password = document.getElementById('admin-login-password').value;

    if (!name || !password) return;

    showLoading();

    callApi('verifyTeacherLogin', { teacherName: name, password: password })
        .then(res => {
            hideLoading();
            if (res && res.success) {
                currentAdmin = name;
                document.getElementById('admin-login').classList.add('hidden');
                document.getElementById('admin-dashboard').classList.remove('hidden');

                document.getElementById('logged-in-teacher-name').textContent = name;
                document.getElementById('exam-teacher').value = name;

                populateAdminSubjectsDropdown(name);
                renderAdminExamList();
            } else {
                alert('รหัสผ่านไม่ถูกต้อง หรือไม่มีชื่อนี้ในระบบ');
            }
        })
        .catch(error => {
            hideLoading();
            alert('เกิดข้อผิดพลาด: ' + error.message);
        });
}

function populateAdminSubjectsDropdown(teacherName) {
    const subjectSelect = document.getElementById('exam-subject');
    const teacherSubjects = allSubjects.filter(s => s.teacher === teacherName);

    if (teacherSubjects.length === 0) {
        subjectSelect.innerHTML = '<option value="">-- ไม่พบรายวิชาที่สอน --</option>';
        return;
    }

    subjectSelect.innerHTML = '<option value="">-- เลือกวิชา --</option>' +
        teacherSubjects.map(s => {
            const display = `${s.code} - ${s.name} (${s.credit} หน่วยกิต)`;
            return `<option value="${s.code}">${display}</option>`;
        }).join('');
}

// Navigation
function navigateTo(viewId) {
    document.querySelectorAll('.view').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('active');
    });

    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.classList.remove('hidden');
        void target.offsetWidth;
        target.classList.add('active');
    }

    if (viewId === 'admin') {
        currentAdmin = null;
        document.getElementById('admin-login-form').reset();
        document.getElementById('admin-login').classList.remove('hidden');
        document.getElementById('admin-dashboard').classList.add('hidden');
    } else if (viewId === 'student') {
        currentStudent = null;
        document.getElementById('student-name-display').classList.add('hidden');
        document.getElementById('student-login').classList.remove('hidden');
        document.getElementById('student-exam-selection').classList.add('hidden');
        document.getElementById('student-exam-taking').classList.add('hidden');
        document.getElementById('student-exam-result').classList.add('hidden');
    }
}

// ==========================================
// STUDENT LOGIN LOGIC
// ==========================================

const SCHOOL_LAT = 17.848930;
const SCHOOL_LNG = 103.564542;
const MAX_DISTANCE_METERS = 500;

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function handleStudentLogin(e) {
    e.preventDefault();
    const code = document.getElementById('student-code').value.trim();
    if (!code) return;

    showLoading();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const distance = calculateDistance(SCHOOL_LAT, SCHOOL_LNG, lat, lng);

            if (distance > MAX_DISTANCE_METERS) {
                hideLoading();
                alert(`ไม่อนุญาตให้เข้าสอบ! คุณอยู่นอกพื้นที่ที่กำหนด (ระยะห่าง ${Math.round(distance)} เมตร) อนุญาตเฉพาะรัศมี ${MAX_DISTANCE_METERS} เมตรเท่านั้น`);
                return;
            }
            proceedWithStudentLogin(code);

        }, function (error) {
            hideLoading();
            alert('คุณต้อง "อนุญาต (Allow)" ให้ระบบเข้าถึงตำแหน่งที่ตั้ง (Location) เพื่อตรวจสอบพื้นที่ก่อนเข้าสอบ');
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    } else {
        hideLoading();
        alert('เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่ง ไม่สามารถเข้าสอบได้');
    }
}

function proceedWithStudentLogin(code) {
    callApi('getStudentByCode', { code: code })
        .then(studentData => {
            hideLoading();
            if (studentData && !studentData.error) {
                currentStudent = studentData;
                const nameDisplay = document.getElementById('student-name-display');
                nameDisplay.textContent = `👤 ${studentData.name} (ม.${studentData.room} เลขที่ ${studentData.number})`;
                nameDisplay.classList.remove('hidden');

                document.getElementById('student-login').classList.add('hidden');
                document.getElementById('student-exam-selection').classList.remove('hidden');

                renderStudentExamList();

                if (window.studentExamListInterval) clearInterval(window.studentExamListInterval);
                window.studentExamListInterval = setInterval(() => {
                    if (!document.getElementById('student-exam-selection').classList.contains('hidden')) {
                        renderStudentExamList();
                    }
                }, 10000);
            } else {
                alert(studentData.error || 'ไม่พบรหัสนักเรียนนี้ในระบบ กรุณาตรวจสอบอีกครั้ง');
            }
        })
        .catch(error => {
            hideLoading();
            alert('เกิดข้อผิดพลาดในการตรวจสอบรหัส: ' + error.message);
        });
}


// ==========================================
// ADMIN LOGIC
// ==========================================

function addQuestionField(existingData = null) {
    const container = document.getElementById('questions-container');
    const questionCount = container.children.length + 1;

    const qDiv = document.createElement('div');
    qDiv.className = 'question-item slide-up';
    qDiv.dataset.index = questionCount;

    let optsData = ['', '', '', ''];
    let correctIdx = 0;

    if (existingData) {
        optsData = existingData.options;
        correctIdx = existingData.correct;
    } else if (container.children.length > 0) {
        const lastQ = container.children[container.children.length - 1];
        const lastQOptsCount = lastQ.querySelectorAll('.q-opt').length;
        if (lastQOptsCount > 0) {
            optsData = Array(lastQOptsCount).fill('');
        }
    }

    let optionsHtml = '';
    optsData.forEach((optText, i) => {
        optionsHtml += `
            <div class="option-input-wrapper" style="display:flex; align-items:center;">
                <input type="radio" name="q${questionCount}_correct" value="${i}" ${i === correctIdx ? 'checked' : ''} required>
                <input type="text" class="q-opt" data-opt="${i}" required placeholder="ตัวเลือก ${i + 1}" value="${optText}" style="flex:1;">
                <button type="button" class="btn-text text-sm" style="color:var(--danger); padding:0 0.5rem;" onclick="this.parentElement.remove()">✕</button>
            </div>
        `;
    });

    qDiv.innerHTML = `
        <div class="question-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h4>ข้อที่ ${questionCount}</h4>
            <div>
                ${questionCount > 1 || existingData ? `<button type="button" class="btn-remove" onclick="this.closest('.question-item').remove()">ลบข้อนี้</button>` : ''}
            </div>
        </div>
        <div class="input-group">
            <input type="text" class="q-text" required placeholder="พิมพ์คำถามที่นี่..." value="${existingData ? existingData.text : ''}">
        </div>
        <p class="subtitle mt-2 text-sm">ตัวเลือก (เลือกปุ่มวงกลมเพื่อกำหนดข้อที่ถูกต้อง)</p>
        <div class="options-grid" id="q${questionCount}-options-grid">
            ${optionsHtml}
        </div>
        <div style="margin-top: 0.75rem; text-align: left;">
            <button type="button" class="btn-text" style="color: var(--primary);" onclick="addOptionToQuestion(this, ${questionCount})">+ เพิ่มตัวเลือก</button>
        </div>
    `;

    container.appendChild(qDiv);
}

function addOptionToQuestion(btn, qIndex) {
    const grid = document.getElementById(`q${qIndex}-options-grid`);
    let optCount = 0;
    const radios = grid.querySelectorAll(`input[type="radio"]`);
    if (radios.length > 0) {
        optCount = parseInt(radios[radios.length - 1].value) + 1;
    }

    const div = document.createElement('div');
    div.className = 'option-input-wrapper';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.innerHTML = `
        <input type="radio" name="q${qIndex}_correct" value="${optCount}" required>
        <input type="text" class="q-opt" data-opt="${optCount}" required placeholder="ตัวเลือก ${radios.length + 1}" style="flex:1;">
        <button type="button" class="btn-text text-sm" style="color:var(--danger); padding:0 0.5rem;" onclick="this.parentElement.remove()">✕</button>
    `;
    grid.appendChild(div);
}

function handleCreateExam(e) {
    e.preventDefault();
    const editId = document.getElementById('editing-exam-id').value;
    let title = document.getElementById('exam-title').value;
    const teacher = document.getElementById('exam-teacher').value;
    const subjectCode = document.getElementById('exam-subject').value;

    const qItems = document.querySelectorAll('.question-item');
    const questions = Array.from(qItems).map((item, index) => {
        const text = item.querySelector('.q-text').value;
        const opts = Array.from(item.querySelectorAll('.q-opt')).map(opt => opt.value);
        const allRadios = Array.from(item.querySelectorAll(`input[type="radio"]`));
        const checkedIndex = allRadios.findIndex(r => r.checked);

        return {
            id: `q_${Date.now()}_${index}`,
            text,
            options: opts,
            correct: checkedIndex > -1 ? checkedIndex : 0
        };
    });

    const startTime = document.getElementById('exam-start-time').value;
    const endTime = document.getElementById('exam-end-time').value;
    const finalTitle = title.startsWith('[') ? title : `[${subjectCode}] ${title} (โดย ${teacher})`;

    const newExam = {
        id: editId ? editId : `exam_${Date.now()}`,
        title: finalTitle,
        questions,
        startTime: startTime || null,
        endTime: endTime || null,
        createdAt: new Date().toISOString()
    };

    showLoading();

    callApi('saveExam', { examObject: newExam })
        .then(() => {
            if (editId) {
                const idx = exams.findIndex(ex => ex.id === editId);
                if (idx > -1) exams[idx] = newExam;
                alert('อัปเดตชุดข้อสอบสำเร็จ!');
            } else {
                exams.push(newExam);
                alert('บันทึกชุดข้อสอบสำเร็จ!');
            }
            cancelEdit();
            renderAdminExamList();
            hideLoading();
        })
        .catch(error => {
            hideLoading();
            alert('เกิดข้อผิดพลาดในการบันทึก: ' + error.message);
        });
}

function editExam(id) {
    const exam = exams.find(e => e.id === id);
    if (!exam) return;

    document.getElementById('editing-exam-id').value = exam.id;
    document.getElementById('btn-cancel-edit').classList.remove('hidden');
    document.getElementById('btn-save-exam').innerHTML = '💾 อัปเดตชุดข้อสอบ';

    let pureTitle = exam.title;
    const match = pureTitle.match(/^\[.*?\] (.*?) \(โดย.*?\)$/);
    if (match) {
        pureTitle = match[1];
    }

    document.getElementById('exam-title').value = pureTitle;

    const codeMatch = exam.title.match(/^\[(.*?)\]/);
    if (codeMatch) {
        document.getElementById('exam-subject').value = codeMatch[1];
    }

    document.getElementById('exam-start-time').value = exam.startTime || '';
    document.getElementById('exam-end-time').value = exam.endTime || '';

    const container = document.getElementById('questions-container');
    container.innerHTML = '';

    exam.questions.forEach(q => {
        addQuestionField(q);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    document.getElementById('editing-exam-id').value = '';
    document.getElementById('btn-cancel-edit').classList.add('hidden');
    document.getElementById('btn-save-exam').innerHTML = '💾 บันทึกชุดข้อสอบ';
    document.getElementById('exam-form').reset();
    document.getElementById('exam-start-time').value = '';
    document.getElementById('exam-end-time').value = '';
    document.getElementById('questions-container').innerHTML = '';
    addQuestionField();
}

function deleteExam(id) {
    if (confirm('คุณต้องการลบชุดข้อสอบนี้ใช่หรือไม่?')) {
        showLoading();
        callApi('deleteExam', { examId: id })
            .then(() => {
                exams = exams.filter(e => e.id !== id);
                renderAdminExamList();
                hideLoading();
            })
            .catch(error => {
                hideLoading();
                alert('ลบไม่สำเร็จ: ' + error.message);
            });
    }
}

function renderAdminExamList() {
    const list = document.getElementById('admin-exam-list');
    
    // กรองเฉพาะข้อสอบที่เป็นของครูผู้สอนที่ Login อยู่
    const myExams = exams.filter(exam => exam.title.includes(`(โดย ${currentAdmin})`));

    if (myExams.length === 0) {
        list.innerHTML = `<div class="empty-state">ยังไม่มีชุดข้อสอบของคุณในระบบ</div>`;
        return;
    }

    list.innerHTML = myExams.map(exam => {
        let timeStr = '';
        if (exam.startTime || exam.endTime) {
            const start = exam.startTime ? new Date(exam.startTime).toLocaleString('th-TH') : 'ไม่กำหนด';
            const end = exam.endTime ? new Date(exam.endTime).toLocaleString('th-TH') : 'ไม่กำหนด';
            timeStr = `<p class="subtitle text-sm" style="color: var(--primary);">🕒 เปิด: ${start} - ปิด: ${end}</p>`;
        }

        return `
        <div class="exam-card">
            <div>
                <h4>${exam.title}</h4>
                <p class="subtitle text-sm">จำนวน ${exam.questions.length} ข้อ</p>
                ${timeStr}
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">
                <button class="btn-secondary" onclick="exportCSV('${exam.id}')">📥 ส่งออก CSV</button>
                <button class="btn-secondary" onclick="editExam('${exam.id}')">แก้ไข</button>
                <button class="btn-remove" onclick="deleteExam('${exam.id}')">ลบ</button>
            </div>
        </div>
    `}).join('');
}

function refreshAdminExams() {
    showLoading();
    callApi('getExams')
        .then(serverExams => {
            exams = serverExams || [];
            renderAdminExamList();
            hideLoading();
        })
        .catch(error => {
            hideLoading();
            alert('เกิดข้อผิดพลาดในการโหลดข้อสอบ: ' + error.message);
        });
}

// ==========================================
// CSV IMPORT / EXPORT LOGIC
// ==========================================

function exportCSV(examId) {
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;

    const rows = [];
    exam.questions.forEach(q => {
        const row = [];
        row.push(escapeCSV(q.text));
        q.options.forEach(opt => row.push(escapeCSV(opt)));
        row.push(q.correct + 1);
        rows.push(row.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + rows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);

    const safeTitle = exam.title.replace(/[^a-z0-9ก-๙]/gi, '_').toLowerCase();
    link.setAttribute('download', `${safeTitle}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function escapeCSV(str) {
    if (str == null) return '';
    let stringified = String(str);
    if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
        stringified = '"' + stringified.replace(/"/g, '""') + '"';
    }
    return stringified;
}

function handleImportCSV(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
        const text = event.target.result;
        parseCSVAndPopulate(text);
        e.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
}

function parseCSVAndPopulate(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return;

    const container = document.getElementById('questions-container');
    container.innerHTML = '';

    lines.forEach((line, index) => {
        const row = parseCSVLine(line);
        if (row.length < 3) return;

        const qText = row[0];
        const correctValRaw = parseInt(row[row.length - 1]);
        if (index === 0 && isNaN(correctValRaw)) return;

        const correctVal = isNaN(correctValRaw) ? 0 : Math.max(0, correctValRaw - 1);
        const options = row.slice(1, row.length - 1);

        addQuestionField({
            text: qText,
            options: options,
            correct: correctVal
        });
    });
    alert('นำเข้าชุดข้อสอบจาก CSV สำเร็จ! โปรดตรวจสอบความถูกต้องและกดบันทึก');
}

function parseCSVLine(text) {
    let ret = [];
    let state = 0;
    let value = "";
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (state === 0) {
            if (char === ',') {
                ret.push(value);
                value = "";
            } else if (char === '"') {
                state = 1;
            } else {
                value += char;
            }
        } else if (state === 1) {
            if (char === '"') {
                if (i + 1 < text.length && text[i + 1] === '"') {
                    value += '"';
                    i++;
                } else {
                    state = 0;
                }
            } else {
                value += char;
            }
        }
    }
    ret.push(value);
    return ret;
}

// ==========================================
// STUDENT EXAM LOGIC
// ==========================================

let studentCurrentQuestionIndex = 0;
let studentAnswers = [];
let examTimerInterval = null;
let timeLeftSeconds = 60;
let currentShuffledOptions = [];
let isCheatingHandled = false;

function renderStudentExamList() {
    const list = document.getElementById('student-exam-list');

    if (exams.length === 0) {
        list.innerHTML = `<div class="empty-state">ยังไม่มีชุดข้อสอบเปิดให้ทำในขณะนี้</div>`;
        return;
    }

    const now = new Date();
    let hasTakenAny = false;

    list.innerHTML = exams.map(exam => {
        const isTaken = currentStudent && currentStudent.takenExams && currentStudent.takenExams.includes(exam.title);
        if (isTaken) hasTakenAny = true;

        let buttonHtml = '';
        let statusHtml = '';

        const startTime = exam.startTime ? new Date(exam.startTime) : null;
        const endTime = exam.endTime ? new Date(exam.endTime) : null;

        if (isTaken) {
            buttonHtml = `<button class="btn-secondary" disabled>ทำข้อสอบแล้ว</button>`;
        } else if (startTime && now < startTime) {
            const openTimeStr = startTime.toLocaleString('th-TH');
            statusHtml = `<p class="subtitle text-sm mt-1" style="color: var(--primary);">⏳ เปิดให้ทำเวลา: ${openTimeStr}</p>`;
            buttonHtml = `<button class="btn-secondary" disabled style="opacity: 0.7;">ยังไม่ถึงเวลาสอบ</button>`;
        } else if (endTime && now > endTime) {
            statusHtml = `<p class="subtitle text-sm mt-1" style="color: var(--danger);">❌ หมดเวลาทำข้อสอบแล้ว</p>`;
            buttonHtml = `<button class="btn-secondary" disabled style="opacity: 0.7;">หมดเวลา</button>`;
        } else {
            if (endTime) {
                const closeTimeStr = endTime.toLocaleString('th-TH');
                statusHtml = `<p class="subtitle text-sm mt-1" style="color: var(--primary);">⚠️ ปิดรับคำตอบ: ${closeTimeStr}</p>`;
            }
            buttonHtml = `<button class="btn-primary" onclick="startExam('${exam.id}')">เริ่มทำข้อสอบ</button>`;
        }

        return `
        <div class="exam-card">
            <div>
                <h4>${exam.title}</h4>
                <p class="subtitle text-sm">จำนวน ${exam.questions.length} ข้อ</p>
                ${statusHtml}
            </div>
            ${buttonHtml}
        </div>
    `}).join('');

    const backBtn = document.getElementById('btn-student-back-home');
    if (backBtn) {
        if (hasTakenAny) {
            backBtn.classList.add('hidden');
        } else {
            backBtn.classList.remove('hidden');
        }
    }
}

function startExam(examId) {
    currentExamTaking = exams.find(e => e.id === examId);
    if (!currentExamTaking) return;

    document.getElementById('student-exam-selection').classList.add('hidden');
    document.getElementById('student-exam-taking').classList.remove('hidden');
    document.getElementById('taking-exam-title').textContent = currentExamTaking.title;

    const backHomeBtn = document.getElementById('btn-student-back-home');
    if (backHomeBtn) backHomeBtn.classList.add('hidden');

    const dashboardTitle = document.getElementById('student-dashboard-title');
    if (dashboardTitle) dashboardTitle.classList.add('hidden');

    const examWarning = document.getElementById('student-exam-warning');
    if (examWarning) examWarning.classList.remove('hidden');

    studentCurrentQuestionIndex = 0;
    studentAnswers = [];
    isCheatingHandled = false;
    cheatWarnings = 0;
    examStartTime = Date.now(); // SET START TIME HERE
    
    updatePendingExamSubmission();
    requestFullscreen();
    renderCurrentQuestion();
}

function requestFullscreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => console.log(err));
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
    }
}

function exitFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.log(err));
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
}

function renderCurrentQuestion() {
    if (examTimerInterval) clearInterval(examTimerInterval);

    const totalQuestions = currentExamTaking.questions.length;
    document.getElementById('question-count-badge').textContent = `ข้อ ${studentCurrentQuestionIndex + 1} / ${totalQuestions}`;

    const q = currentExamTaking.questions[studentCurrentQuestionIndex];

    let optionsWithOriginalIndices = q.options.map((text, idx) => ({ originalIndex: idx, text }));
    for (let i = optionsWithOriginalIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsWithOriginalIndices[i], optionsWithOriginalIndices[j]] = [optionsWithOriginalIndices[j], optionsWithOriginalIndices[i]];
    }
    currentShuffledOptions = optionsWithOriginalIndices;

    const container = document.getElementById('taking-questions-container');
    container.innerHTML = `
        <div class="question-item slide-up" style="border:none; box-shadow:none; background:transparent;">
            <h4>${studentCurrentQuestionIndex + 1}. ${q.text}</h4>
            <div class="options-wrapper mt-4">
                ${currentShuffledOptions.map((optObj, optIndex) => `
                    <label class="option-label" onclick="selectOption(this)">
                        <input type="radio" name="current_ans" value="${optObj.originalIndex}" class="hidden" required>
                        <span class="radio-custom"></span>
                        ${optObj.text}
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    const btnNext = document.getElementById('btn-next-question');
    if (studentCurrentQuestionIndex === totalQuestions - 1) {
        btnNext.innerHTML = '✅ ส่งคำตอบ';
        btnNext.className = 'btn-primary btn-lg shadow-glow';
    } else {
        btnNext.innerHTML = 'ถัดไป ➔';
        btnNext.className = 'btn-secondary btn-lg';
    }

    btnNext.disabled = true;
    btnNext.style.opacity = '0.5';
    btnNext.style.cursor = 'not-allowed';

    timeLeftSeconds = 60;
    updateTimerDisplay();
    examTimerInterval = setInterval(() => {
        timeLeftSeconds--;
        updateTimerDisplay();

        if (timeLeftSeconds <= 0) {
            clearInterval(examTimerInterval);
            handleNextOrSubmit(null, true);
        }
    }, 1000);
}

function updateTimerDisplay() {
    const mins = Math.floor(timeLeftSeconds / 60).toString().padStart(2, '0');
    const secs = (timeLeftSeconds % 60).toString().padStart(2, '0');
    const badge = document.getElementById('timer-badge');
    badge.textContent = `⏱️ ${mins}:${secs}`;

    if (timeLeftSeconds <= 10) {
        badge.style.background = 'var(--danger)';
        badge.style.boxShadow = '0 0 10px var(--danger)';
    } else {
        badge.style.background = 'var(--primary)';
        badge.style.boxShadow = 'none';
    }
}

function selectOption(labelElement) {
    const siblings = labelElement.closest('.options-wrapper').querySelectorAll('.option-label');
    siblings.forEach(sib => sib.classList.remove('selected'));

    labelElement.classList.add('selected');
    labelElement.querySelector('input[type="radio"]').checked = true;

    const btnNext = document.getElementById('btn-next-question');
    if (btnNext) {
        btnNext.disabled = false;
        btnNext.style.opacity = '1';
        btnNext.style.cursor = 'pointer';
    }
}

function handleNextOrSubmit(e, isTimeout = false) {
    if (e) e.preventDefault();

    let selectedValue = null;
    const selectedRadio = document.querySelector('input[name="current_ans"]:checked');
    if (selectedRadio) {
        selectedValue = parseInt(selectedRadio.value);
    }

    if (!isTimeout && selectedValue === null) {
        return;
    }

    studentAnswers.push(selectedValue);
    updatePendingExamSubmission();

    if (studentCurrentQuestionIndex < currentExamTaking.questions.length - 1) {
        studentCurrentQuestionIndex++;
        renderCurrentQuestion();
    } else {
        clearInterval(examTimerInterval);
        submitFinalExam();
    }
}

function submitFinalExam() {
    document.getElementById('student-exam-taking').classList.add('hidden');
    sessionStorage.removeItem('pendingExamSubmit');
    exitFullscreen();

    let score = 0;
    const total = currentExamTaking.questions.length;

    currentExamTaking.questions.forEach((q, index) => {
        const ans = studentAnswers[index];
        if (ans !== null && ans === q.correct) {
            score++;
        }
    });

    const percentage = Math.round((score / total) * 100);
    const submissionData = {
        student: currentStudent,
        examTitle: currentExamTaking.title,
        score: score,
        total: total,
        percentage: percentage
    };

    showLoading();

    function attemptSubmission(attemptCount = 1) {
        const loadingEl = document.getElementById('loading-overlay');
        const textEl = loadingEl.querySelector('p');
        if (textEl) {
            if (attemptCount > 1) {
                textEl.innerHTML = `กำลังบันทึกคำตอบ...<br><span style="color:var(--danger); font-size:0.9rem;">(การเชื่อมต่อมีปัญหา กำลังลองใหม่ครั้งที่ ${attemptCount}...)</span>`;
            } else {
                textEl.innerHTML = `กำลังบันทึกคำตอบ...`;
            }
        }

        callApi('submitExamScore', { data: submissionData })
            .then(() => {
                if (textEl) textEl.innerHTML = `กำลังโหลดข้อมูล...`;
                hideLoading();
                if (currentStudent && !currentStudent.takenExams) currentStudent.takenExams = [];
                currentStudent.takenExams.push(currentExamTaking.title);
                showResult(score, total, percentage);
            })
            .catch(() => {
                setTimeout(() => attemptSubmission(attemptCount + 1), 5000);
            });
    }

    attemptSubmission();
}

function showResult(score, total, percentage) {
    document.getElementById('student-exam-taking').classList.add('hidden');
    const resultView = document.getElementById('student-exam-result');
    resultView.classList.remove('hidden');

    document.getElementById('score-display').textContent = `${score}/${total}`;
    document.getElementById('score-percentage').textContent = `${percentage}%`;

    const circle = document.querySelector('.score-circle');
    circle.style.setProperty('--progress', `${percentage}%`);

    const msg = document.getElementById('score-message');
    if (percentage >= 80) {
        msg.textContent = 'ยอดเยี่ยมมาก! 🎉 (บันทึกคะแนนลงระบบแล้ว)';
    } else if (percentage >= 50) {
        msg.textContent = 'ทำได้ดี ผ่านเกณฑ์ 👍 (บันทึกคะแนนลงระบบแล้ว)';
    } else {
        msg.textContent = 'พยายามใหม่อีกนิดนะ 💪 (บันทึกคะแนนลงระบบแล้ว)';
    }
}

function backToStudentDashboard() {
    currentExamTaking = null;
    document.getElementById('student-exam-result').classList.add('hidden');
    document.getElementById('student-exam-selection').classList.remove('hidden');

    const backHomeBtn = document.getElementById('btn-student-back-home');
    if (backHomeBtn) backHomeBtn.classList.remove('hidden');

    const dashboardTitle = document.getElementById('student-dashboard-title');
    if (dashboardTitle) dashboardTitle.classList.remove('hidden');

    const examWarning = document.getElementById('student-exam-warning');
    if (examWarning) examWarning.classList.add('hidden');

    if (currentStudent && currentStudent.takenExams) {
        renderStudentExamList();
    }
}

// ==========================================
// ANTI-CHEAT LOGIC
// ==========================================

document.addEventListener("visibilitychange", function () {
    if (document.hidden && currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        if (Date.now() - examStartTime > 3000) {
            handleCheatingAttempt('ตรวจพบการพับหน้าจอหรือเปลี่ยนแท็บ');
        }
    }
});

window.addEventListener("blur", function () {
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        if (Date.now() - examStartTime > 3000) {
            handleCheatingAttempt('ตรวจพบการเปลี่ยนหน้าจอ');
        }
    }
});

['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(eventName => {
    document.addEventListener(eventName, function () {
        const isFull = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        if (!isFull && currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
            if (Date.now() - examStartTime > 3000) {
                handleCheatingAttempt('ออกจากโหมดเต็มหน้าจอ หรือเปิดใช้งานแบ่งหน้าจอ');
            }
        }
    });
});

window.addEventListener("resize", function () {
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        const isFull = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        if (!isFull) {
            if (Date.now() - examStartTime > 3000) {
                handleCheatingAttempt('ตรวจพบการแบ่งหน้าจอ (Split Screen) หรือการปรับขนาดหน้าต่าง');
            }
        }
    }
});

let examStartTime = 0; // Grace period tracking
let lastTickTime = Date.now();
setInterval(function () {
    const now = Date.now();
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        // Grace period of 3 seconds after starting the exam to allow fullscreen transitions
        if (now - examStartTime < 3000) {
            lastTickTime = now;
            return;
        }

        if (now - lastTickTime > 3500) {
            handleCheatingAttempt('ตรวจพบการพักหน้าจอ หรือสลับแท็บ (Tab Suspended)');
            lastTickTime = now;
            return;
        }

        if (!document.hasFocus()) {
            handleCheatingAttempt('ตรวจพบการเปลี่ยนหน้าจอ หรือเปิดแอปซ้อน (Focus Lost)');
            lastTickTime = now;
            return;
        }

        const isFull = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        const screenW = window.screen.availWidth || window.screen.width;
        const screenH = window.screen.availHeight || window.screen.height;

        const widthRatio = window.innerWidth / screenW;
        const heightRatio = window.innerHeight / screenH;

        if (!isFull && (widthRatio < 0.85 || heightRatio < 0.70)) {
            handleCheatingAttempt('ตรวจพบการใช้งานในโหมดหน้าต่าง (DeX) หรือแบ่งหน้าจอ (Split Screen)');
        }
    }
    lastTickTime = now;
}, 1500);

document.addEventListener("mouseleave", function (e) {
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        if (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
            handleCheatingAttempt('ตรวจพบเมาส์ออกนอกหน้าจอ (อาจกำลังสลับแท็บหรือโปรแกรมอื่น)');
        }
    }
});

document.addEventListener('contextmenu', event => {
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        event.preventDefault();
    }
});

document.addEventListener('copy', event => {
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        event.preventDefault();
        alert('ไม่อนุญาตให้คัดลอกข้อความ');
    }
});

document.addEventListener('dragstart', function (e) {
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        e.preventDefault();
        handleCheatingAttempt('ตรวจพบการกดลากข้อความหรือรูปภาพ');
    }
});

document.addEventListener('selectionchange', function () {
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        const selection = window.getSelection();
        if (selection.toString().length > 0) {
            selection.removeAllRanges();
            handleCheatingAttempt('ไม่อนุญาตให้คลุมดำเลือกข้อความ (ป้องกันการคัดลอกหรือแปลภาษา)');
        }
    }
});

let interactionTimer;
let isLongPressActive = false;
let startX = 0, startY = 0;

function handlePressStart(e) {
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        isLongPressActive = false;
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        startY = e.touches ? e.touches[0].clientY : e.clientY;

        interactionTimer = setTimeout(() => {
            isLongPressActive = true;
        }, 600);
    }
}

function handlePressMove(e) {
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        if (isLongPressActive) {
            handleCheatingAttempt('ตรวจพบการกดค้างแล้วลาก (ป้องกันการเรียกใช้ตัวช่วยค้นหา)');
        } else {
            const currentX = e.touches ? e.touches[0].clientX : e.clientX;
            const currentY = e.touches ? e.touches[0].clientY : e.clientY;
            if (Math.abs(currentX - startX) > 15 || Math.abs(currentY - startY) > 15) {
                clearTimeout(interactionTimer);
            }
        }
    }
}

function handlePressEnd() {
    clearTimeout(interactionTimer);
    isLongPressActive = false;
}

document.addEventListener('touchstart', handlePressStart, { passive: true });
document.addEventListener('touchmove', handlePressMove, { passive: true });
document.addEventListener('touchend', handlePressEnd);
document.addEventListener('touchcancel', handlePressEnd);

document.addEventListener('mousedown', handlePressStart);
document.addEventListener('mousemove', handlePressMove);
document.addEventListener('mouseup', handlePressEnd);

document.addEventListener('keydown', function (e) {
    if (!currentExamTaking || document.getElementById('student-exam-taking').classList.contains('hidden')) return;

    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'i') || (e.ctrlKey && e.key.toLowerCase() === 'u')) {
        e.preventDefault();
    }

    if (e.ctrlKey && (e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 's')) {
        e.preventDefault();
    }

    if (e.key === 'PrintScreen') {
        navigator.clipboard.writeText('');
        handleCheatingAttempt('ไม่อนุญาตให้แคปหน้าจอ (Print Screen)');
    }
});

document.addEventListener('keyup', function (e) {
    if (!currentExamTaking || document.getElementById('student-exam-taking').classList.contains('hidden')) return;
    if (e.key === 'PrintScreen') {
        navigator.clipboard.writeText('');
        handleCheatingAttempt('ไม่อนุญาตให้แคปหน้าจอ (Print Screen)');
    }
});

let cheatWarnings = 0;
let lastWarningTime = 0;

function handleCheatingAttempt(reason = 'ตรวจพบการทุจริต') {
    if (isCheatingHandled) return;

    const now = Date.now();
    if (now - lastWarningTime < 2000) return;
    lastWarningTime = now;

    if (cheatWarnings === 0) {
        cheatWarnings++;
        document.getElementById('anti-cheat-reason').textContent = `สาเหตุ: ${reason}`;
        document.getElementById('student-exam-taking').classList.add('hidden');
        document.getElementById('anti-cheat-overlay').classList.remove('hidden');
    } else {
        isCheatingHandled = true;
        alert(`🚨 ${reason} (กระทำซ้ำ): ระบบจะทำการบังคับส่งข้อสอบของคุณทันทีเพื่อป้องกันการทุจริต!`);

        clearInterval(examTimerInterval);

        while (studentAnswers.length < currentExamTaking.questions.length) {
            studentAnswers.push(null);
        }

        submitFinalExam();
    }
}

function resumeExamAfterWarning() {
    document.getElementById('anti-cheat-overlay').classList.add('hidden');
    document.getElementById('student-exam-taking').classList.remove('hidden');
    requestFullscreen();
}

function updatePendingExamSubmission() {
    if (!currentStudent || !currentExamTaking) return;

    let score = 0;
    const total = currentExamTaking.questions.length;

    currentExamTaking.questions.forEach((q, index) => {
        if (index < studentAnswers.length) {
            const ans = studentAnswers[index];
            if (ans !== null && ans === q.correct) {
                score++;
            }
        }
    });

    const percentage = Math.round((score / total) * 100);

    const submissionData = {
        student: currentStudent,
        examTitle: currentExamTaking.title,
        score: score,
        total: total,
        percentage: percentage
    };

    sessionStorage.setItem('pendingExamSubmit', JSON.stringify(submissionData));
}

window.addEventListener('beforeunload', function (e) {
    if (currentExamTaking && !document.getElementById('student-exam-taking').classList.contains('hidden')) {
        e.preventDefault();
        e.returnValue = 'หากรีเฟรชหรือออกจากหน้านี้ ระบบจะทำการส่งข้อสอบของคุณทันที!';
        return 'หากรีเฟรชหรือออกจากหน้านี้ ระบบจะทำการส่งข้อสอบของคุณทันที!';
    }
});
