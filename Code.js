var SPREADSHEET_ID = '1dDAE5YSpQyL8zW8b-nhaybpzMFx--QUVSHbUI8-hmT4';

/**
 * ตอบสนองต่อการเรียกใช้งาน Web App (GET Request)
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
      .setTitle('ระบบสอบออนไลน์ (Online Exam System)')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ฟังก์ชันสำหรับรวมไฟล์ HTML ย่อย
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ==========================================
 * SHEET INTEGRATION FUNCTIONS
 * ==========================================
 */

/**
 * ดึงข้อมูลนักเรียนจากรหัสนักเรียน (แผ่นงาน 'รายชื่อนักเรียน')
 * @param {string} studentCode รหัสนักเรียน
 * @return {Object|null} ข้อมูลนักเรียน หรือ null ถ้าไม่พบ
 */
function getStudentByCode(studentCode) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('รายชื่อนักเรียน');
    if (!sheet) return { error: 'ไม่พบแผ่นงาน "รายชื่อนักเรียน"' };
    
    var data = sheet.getDataRange().getValues();
    var foundStudent = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(studentCode).trim()) {
        foundStudent = {
          code: data[i][0],
          name: data[i][1],
          room: data[i][2],
          number: data[i][3]
        };
        break;
      }
    }
    
    if (foundStudent) {
      // Fetch taken exams
      var takenExams = [];
      var ansSheet = ss.getSheetByName('ส่งคำตอบ');
      if (ansSheet) {
        var ansData = ansSheet.getDataRange().getValues();
        // Student Code is index 1, Exam Title is index 5
        for (var k = 1; k < ansData.length; k++) {
          if (String(ansData[k][1]).trim() === String(studentCode).trim()) {
             takenExams.push(String(ansData[k][5]).trim());
          }
        }
      }
      foundStudent.takenExams = takenExams;
      return foundStudent;
    }
    
    return null; // ไม่พบ
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * ดึงข้อมูลรายวิชาทั้งหมด (รวมถึงครูผู้สอนและหน่วยกิต) เพื่อไปสร้าง Dropdown
 * @return {Array} รายการออบเจกต์รายวิชา
 */
function getTeachersAndSubjects() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var subjectSheet = ss.getSheetByName('รายวิชา');
    
    if (!subjectSheet) throw new Error('ไม่พบแผ่นงาน "รายวิชา"');
    
    var data = subjectSheet.getDataRange().getValues();
    if (data.length < 2) return [];
    
    // หาตำแหน่งคอลัมน์จาก Header
    var header = data[0];
    var codeIdx = -1, nameIdx = -1, creditIdx = -1, teacherIdx = -1;
    
    for (var j = 0; j < header.length; j++) {
      var hName = String(header[j]).trim();
      if (hName === 'รหัสวิชา') codeIdx = j;
      if (hName === 'รายวิชา' || hName === 'ชื่อวิชา') nameIdx = j;
      if (hName === 'จำนวนหน่วยกิต' || hName === 'หน่วยกิต') creditIdx = j;
      if (hName === 'ครูผู้สอน') teacherIdx = j;
    }
    
    // ตั้งค่าปริยายถ้าไม่เจอคอลัมน์
    if (codeIdx === -1) codeIdx = 0;
    if (nameIdx === -1) nameIdx = 1;
    if (creditIdx === -1) creditIdx = 2;
    if (teacherIdx === -1) teacherIdx = 3;

    var subjects = [];
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][codeIdx]) {
        subjects.push({
          code: String(data[i][codeIdx]).trim(),
          name: data[i][nameIdx] ? String(data[i][nameIdx]).trim() : '',
          credit: data[i][creditIdx] ? String(data[i][creditIdx]).trim() : '',
          teacher: data[i][teacherIdx] ? String(data[i][teacherIdx]).trim() : 'ไม่ระบุ'
        });
      }
    }
    
    return subjects;
  } catch (error) {
    throw new Error('ไม่สามารถดึงข้อมูลจาก Sheet ได้: ' + error.message);
  }
}

/**
 * ดึงรายชื่อครูจากแผ่นงาน 'รายชื่อครูนำเข้า' เพื่อแสดงใน Dropdown ตอน Login
 * @return {Array} รายชื่อครู
 */
function getTeachersForLogin() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('รายชื่อครูนำเข้า');
    if (!sheet) throw new Error('ไม่พบแผ่นงาน "รายชื่อครูนำเข้า"');
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return []; // ไม่มีข้อมูล
    
    // หาตำแหน่งคอลัมน์ "ชื่อ_สกุล"
    var header = data[0];
    var nameIndex = -1;
    for (var j = 0; j < header.length; j++) {
      if (String(header[j]).trim() === 'ชื่อ_สกุล') {
        nameIndex = j;
        break;
      }
    }
    
    // ถ้าไม่เจอหัวคอลัมน์ชื่อ_สกุล ให้ใช้คอลัมน์ A (index 0) เป็นค่าเริ่มต้น
    if (nameIndex === -1) nameIndex = 0;
    
    var teachers = [];
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][nameIndex]) {
        teachers.push(String(data[i][nameIndex]).trim());
      }
    }
    
    return teachers;
  } catch (error) {
    throw new Error('ไม่สามารถดึงรายชื่อครูได้: ' + error.message);
  }
}

/**
 * ตรวจสอบรหัสผ่านครูผู้สอน
 * @param {string} teacherName ชื่อครูที่เลือก
 * @param {string} password รหัสผ่านที่กรอก
 * @return {boolean} true ถ้าถูกต้อง, false ถ้าไม่ถูกต้อง
 */
function verifyTeacherLogin(teacherName, password) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('รายชื่อครูนำเข้า');
    if (!sheet) return false;
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return false;
    
    // หาตำแหน่งคอลัมน์
    var header = data[0];
    var nameIndex = -1;
    var passIndex = -1;
    
    for (var j = 0; j < header.length; j++) {
      var hName = String(header[j]).trim();
      if (hName === 'ชื่อ_สกุล') nameIndex = j;
      if (hName === 'รหัสสร้างข้อมสอบ' || hName === 'รหัสสร้างข้อสอบ') passIndex = j;
    }
    
    // ถ้าไม่เจอหัวคอลัมน์ ใช้ค่าปริยาย (A = 0, B = 1)
    if (nameIndex === -1) nameIndex = 0;
    if (passIndex === -1) passIndex = 1;
    
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][nameIndex]).trim() === String(teacherName).trim()) {
        if (String(data[i][passIndex]).trim() === String(password).trim()) {
          return true;
        } else {
          return false;
        }
      }
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * บันทึกผลสอบลงแผ่นงาน 'ส่งคำตอบ'
 * @param {Object} data ข้อมูลผลสอบ
 */
function submitExamScore(data) {
  var lock = LockService.getScriptLock();
  try {
    // Wait up to 15 seconds for other processes to finish writing
    lock.waitLock(15000);
    
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('ส่งคำตอบ');
    
    if (!sheet) {
      // สร้างชีตใหม่ถ้ายังไม่มี
      sheet = ss.insertSheet('ส่งคำตอบ');
      sheet.appendRow(['Timestamp', 'รหัสนักเรียน', 'ชื่อ_นามสกุล', 'ห้อง', 'เลขที่', 'ชุดข้อสอบ', 'คะแนนที่ได้', 'คะแนนเต็ม', 'ร้อยละ']);
    }
    
    var timestamp = new Date();
    sheet.appendRow([
      timestamp,
      data.student.code,
      data.student.name,
      data.student.room,
      data.student.number,
      data.examTitle,
      data.score,
      data.total,
      data.percentage + '%'
    ]);
    
    // Force write to happen before releasing the lock
    SpreadsheetApp.flush();
    
    return true;
  } catch (error) {
    throw new Error('ไม่สามารถบันทึกผลสอบได้: ' + error.message);
  } finally {
    lock.releaseLock();
  }
}


/**
 * ==========================================
 * EXAM MANAGEMENT (PROPERTIES SERVICE)
 * ==========================================
 */

function getExams() {
  var props = PropertiesService.getScriptProperties();
  var examsData = props.getProperty('online_exams');
  
  if (examsData) {
    return examsData;
  }
  return JSON.stringify([]);
}

function saveExam(examObject) {
  var props = PropertiesService.getScriptProperties();
  var examsData = props.getProperty('online_exams');
  var exams = [];
  
  if (examsData) {
    exams = JSON.parse(examsData);
  }
  
  var existingIndex = -1;
  for (var i = 0; i < exams.length; i++) {
    if (exams[i].id === examObject.id) {
      existingIndex = i;
      break;
    }
  }
  
  if (existingIndex > -1) {
    // อัปเดตข้อมูลเดิม
    exams[existingIndex] = examObject;
  } else {
    // เพิ่มใหม่
    exams.push(examObject);
  }
  
  props.setProperty('online_exams', JSON.stringify(exams));
  
  return true;
}

function deleteExam(examId) {
  var props = PropertiesService.getScriptProperties();
  var examsData = props.getProperty('online_exams');
  
  if (!examsData) return false;
  
  var exams = JSON.parse(examsData);
  var filteredExams = exams.filter(function(e) {
    return e.id !== examId;
  });
  
  props.setProperty('online_exams', JSON.stringify(filteredExams));
  return true;
}
