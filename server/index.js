require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { db, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(uploadsDir));

// Helper: Get Settings as an object
async function getSettingsMap() {
  const sql = db.isMySQL() 
    ? 'SELECT `key`, `value` FROM settings' 
    : 'SELECT key, value FROM settings';
  const rows = await db.all(sql);
  const map = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

// Helper: Save setting item
async function setSettingItem(key, value) {
  if (db.isMySQL()) {
    await db.run('INSERT INTO settings (`key`, `value`, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()', [key, String(value)]);
  } else {
    await db.run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\', \'localtime\'))', [key, String(value)]);
  }
}

// Helper to save base64 uploaded file
function saveBase64File(base64Data, prefix = 'file') {
  if (!base64Data || !base64Data.startsWith('data:')) {
    return base64Data || null;
  }
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return null;
  }
  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  let ext = 'jpg';
  if (mimeType.includes('png')) ext = 'png';
  else if (mimeType.includes('pdf')) ext = 'pdf';
  else if (mimeType.includes('webp')) ext = 'webp';

  const filename = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
  const filepath = path.join(uploadsDir, filename);
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${filename}`;
}

// ==========================================
// 1. PUBLIC & STUDENT ENDPOINTS
// ==========================================

// GET System Status and Public Info
app.get('/api/status', async (req, res) => {
  try {
    const settings = await getSettingsMap();
    const announcements = await db.all('SELECT * FROM announcements WHERE is_active = 1 ORDER BY id DESC');
    const totalCapacity = await db.get(`
      SELECT 
        SUM(r.max_capacity) as total_beds,
        COUNT(a.id) as occupied_beds
      FROM rooms r
      LEFT JOIN applications a ON r.id = a.room_id AND a.status IN ('approved', 'pending')
    `);

    res.json({
      success: true,
      settings: {
        registration_open: settings.registration_open === 'true',
        announcement_open: settings.announcement_open === 'true',
        system_semester: settings.system_semester || 'ภาคการศึกษาที่ 1/2569',
        registration_start: settings.registration_start || '1 พ.ค. 2569',
        registration_end: settings.registration_end || '15 มิ.ย. 2569',
        announcement_date: settings.announcement_date || '20 มิ.ย. 2569',
        min_activity_points: parseInt(settings.min_activity_points || '80', 10),
        closed_message: settings.closed_message || 'ระบบปิดรับสมัครชั่วคราว'
      },
      stats: {
        total_beds: totalCapacity?.total_beds || 246,
        occupied_beds: totalCapacity?.occupied_beds || 0,
        available_beds: Math.max(0, (totalCapacity?.total_beds || 246) - (totalCapacity?.occupied_beds || 0))
      },
      announcements
    });
  } catch (err) {
    console.error('Status endpoint error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET All Dormitories with Room & Occupancy Stats
app.get('/api/dormitories', async (req, res) => {
  try {
    const dorms = await db.all('SELECT * FROM dormitories ORDER BY id ASC');
    const dormStats = [];

    for (const dorm of dorms) {
      const stats = await db.get(`
        SELECT 
          SUM(r.max_capacity) as total_beds,
          COUNT(a.id) as occupied_beds
        FROM rooms r
        LEFT JOIN applications a ON r.id = a.room_id AND a.status IN ('approved', 'pending')
        WHERE r.dormitory_id = ?
      `, [dorm.id]);

      dormStats.push({
        ...dorm,
        total_beds: stats?.total_beds || 0,
        occupied_beds: stats?.occupied_beds || 0,
        available_beds: Math.max(0, (stats?.total_beds || 0) - (stats?.occupied_beds || 0))
      });
    }

    res.json({ success: true, dormitories: dormStats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET Rooms for a specific dormitory with bed availability
app.get('/api/dormitories/:id/rooms', async (req, res) => {
  try {
    const dormId = req.params.id;
    const dorm = await db.get('SELECT * FROM dormitories WHERE id = ?', [dormId]);
    if (!dorm) {
      return res.status(404).json({ success: false, message: 'ไม่พบหอพักที่ระบุ' });
    }

    const rooms = await db.all('SELECT * FROM rooms WHERE dormitory_id = ? ORDER BY floor ASC, room_number ASC', [dormId]);
    
    // Get all applicants (pending and approved)
    const occupants = await db.all(`
      SELECT 
        a.id, a.room_id, a.bed_number, a.first_name, a.last_name, a.prefix, a.faculty, a.status, a.citizen_id
      FROM applications a
      WHERE a.dormitory_id = ? AND a.status IN ('approved', 'pending')
    `, [dormId]);

    const occupantsByRoom = {};
    for (const occ of occupants) {
      if (!occupantsByRoom[occ.room_id]) {
        occupantsByRoom[occ.room_id] = [];
      }
      occupantsByRoom[occ.room_id].push({
        bed_number: occ.bed_number,
        full_name: `${occ.prefix} ${occ.first_name} ${occ.last_name ? occ.last_name.charAt(0) : ''}.`,
        faculty: occ.faculty,
        status: occ.status
      });
    }

    const roomDetails = rooms.map(room => {
      const roomOccupants = occupantsByRoom[room.id] || [];
      const beds = [];
      for (let b = 1; b <= room.max_capacity; b++) {
        const occ = roomOccupants.find(o => o.bed_number === b);
        beds.push({
          bed_number: b,
          is_occupied: !!occ,
          occupant: occ || null
        });
      }

      return {
        id: room.id,
        room_number: room.room_number,
        floor: room.floor,
        max_capacity: room.max_capacity,
        occupied_count: roomOccupants.length,
        available_count: room.max_capacity - roomOccupants.length,
        is_full: roomOccupants.length >= room.max_capacity,
        beds
      };
    });

    res.json({
      success: true,
      dormitory: dorm,
      rooms: roomDetails
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST Submit Application (สมัครเข้าหอพัก - ผู้ใช้สร้างรหัสเอง และสถานะเริ่มต้นเป็น pending รออนุมัติ)
app.post('/api/applications', async (req, res) => {
  try {
    const settings = await getSettingsMap();
    if (settings.registration_open !== 'true') {
      return res.status(403).json({
        success: false,
        message: settings.closed_message || 'ขณะนี้ระบบปิดรับสมัครเข้าหอพัก'
      });
    }

    const {
      citizen_id,
      password,
      prefix,
      first_name,
      last_name,
      gender,
      birth_date,
      phone,
      email,
      faculty,
      major,
      address,
      province,
      parent_name,
      parent_phone,
      parent_relation,
      emergency_contact,
      chronic_disease,
      id_card_file,
      dormitory_id,
      room_id,
      bed_number
    } = req.body;

    if (!citizen_id || citizen_id.length !== 13) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกเลขบัตรประจำตัวประชาชน 13 หลักให้ถูกต้อง' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, message: 'กรุณากำหนดรหัสผ่านอย่างน้อย 4 ตัวอักษร' });
    }
    if (!first_name || !last_name || !phone || !gender || !dormitory_id || !room_id) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    }

    // Check duplicate
    const existing = await db.get('SELECT id FROM applications WHERE citizen_id = ?', [citizen_id]);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `เลขบัตรประจำตัวประชาชนนี้ (${citizen_id}) ได้ทำการสมัครไว้แล้ว หากต้องการแก้ไขข้อมูล กรุณาเข้าสู่ระบบตรวจสอบข้อมูล`
      });
    }

    // Gender check
    const dorm = await db.get('SELECT * FROM dormitories WHERE id = ?', [dormitory_id]);
    if (!dorm || dorm.gender !== gender) {
      return res.status(400).json({
        success: false,
        message: `ไม่อนุญาตให้เลือกหอพักข้ามเพศ (${gender === 'male' ? 'นักศึกษาชายเลือกได้เฉพาะหอพักชาย' : 'นักศึกษาหญิงเลือกได้เฉพาะหอพักหญิง'})`
      });
    }

    // Check capacity
    const room = await db.get('SELECT * FROM rooms WHERE id = ? AND dormitory_id = ?', [room_id, dormitory_id]);
    if (!room) {
      return res.status(400).json({ success: false, message: 'ไม่พบห้องพักที่เลือก' });
    }

    const currentOccupants = await db.get(`
      SELECT COUNT(*) as count FROM applications 
      WHERE room_id = ? AND status IN ('approved', 'pending')
    `, [room_id]);

    if (currentOccupants.count >= room.max_capacity) {
      return res.status(400).json({ success: false, message: `ห้องพัก ${room.room_number} เต็มแล้ว (จุได้สูงสุด ${room.max_capacity} คน) กรุณาเลือกห้องอื่น` });
    }

    // Check specific bed
    const chosenBed = parseInt(bed_number || 1, 10);
    const bedTaken = await db.get(`
      SELECT id FROM applications 
      WHERE room_id = ? AND bed_number = ? AND status IN ('approved', 'pending')
    `, [room_id, chosenBed]);

    let finalBed = chosenBed;
    if (bedTaken) {
      const takenRows = await db.all(`
        SELECT bed_number FROM applications 
        WHERE room_id = ? AND status IN ('approved', 'pending')
      `, [room_id]);
      const takenBeds = takenRows.map(r => r.bed_number);

      for (let b = 1; b <= room.max_capacity; b++) {
        if (!takenBeds.includes(b)) {
          finalBed = b;
          break;
        }
      }
    }

    // Save ID card file
    let savedFile = null;
    if (id_card_file) {
      savedFile = saveBase64File(id_card_file, `idcard_${citizen_id}`);
    }

    // Insert Application with initial status 'pending' (รอการอนุมัติ)
    const result = await db.run(`
      INSERT INTO applications (
        citizen_id, password, prefix, first_name, last_name, gender, birth_date,
        phone, email, faculty, major, address, province, parent_name, parent_phone,
        parent_relation, emergency_contact, chronic_disease, id_card_file,
        dormitory_id, room_id, bed_number, status, activity_points
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)
    `, [
      citizen_id,
      password,
      prefix,
      first_name,
      last_name,
      gender,
      birth_date || null,
      phone,
      email || null,
      faculty || null,
      major || null,
      address || null,
      province || null,
      parent_name || null,
      parent_phone || null,
      parent_relation || null,
      emergency_contact || null,
      chronic_disease || null,
      savedFile,
      dormitory_id,
      room_id,
      finalBed
    ]);

    res.json({
      success: true,
      message: 'ส่งใบสมัครเข้าหอพักเรียบร้อยแล้ว! ข้อมูลของคุณอยู่ระหว่างรอการตรวจสอบและอนุมัติจากผู้ดูแลระบบ',
      application_id: result.lastInsertRowid,
      data: {
        citizen_id,
        name: `${prefix} ${first_name} ${last_name}`,
        dormitory_name: dorm.name,
        room_number: room.room_number,
        floor: room.floor,
        bed_number: finalBed,
        status: 'pending'
      }
    });
  } catch (err) {
    console.error('Submit application error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Student Login (เข้าสู่ระบบด้วยเลขบัตรประชาชน 13 หลัก + รหัสผ่าน)
app.post('/api/applications/login', async (req, res) => {
  try {
    const { citizen_id, password } = req.body;
    if (!citizen_id || !password) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุเลขประจำตัวประชาชน 13 หลักและรหัสผ่าน' });
    }

    const appRecord = await db.get(`
      SELECT 
        a.*,
        d.name as dormitory_name,
        d.gender as dorm_gender,
        d.fee_per_term,
        r.room_number,
        r.floor,
        r.max_capacity
      FROM applications a
      LEFT JOIN dormitories d ON a.dormitory_id = d.id
      LEFT JOIN rooms r ON a.room_id = r.id
      WHERE a.citizen_id = ?
    `, [citizen_id]);

    if (!appRecord) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการสมัครของเลขบัตรประชาชนนี้' });
    }

    if (appRecord.password !== password) {
      return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' });
    }

    const settings = await getSettingsMap();
    const isAnnounced = settings.announcement_open === 'true';

    // Roommates (only approved if announced, or pending roommates)
    const roommates = await db.all(`
      SELECT 
        prefix, first_name, last_name, faculty, major, bed_number, status
      FROM applications
      WHERE room_id = ? AND citizen_id != ? AND status IN ('approved', 'pending')
      ORDER BY bed_number ASC
    `, [appRecord.room_id, citizen_id]);

    res.json({
      success: true,
      is_announced: isAnnounced,
      application: {
        ...appRecord,
        roommates
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Edit Application (แก้ไขข้อมูลการสมัครของตนเอง)
app.put('/api/applications/me', async (req, res) => {
  try {
    const {
      citizen_id,
      password,
      prefix,
      first_name,
      last_name,
      phone,
      email,
      faculty,
      major,
      address,
      province,
      parent_name,
      parent_phone,
      parent_relation,
      emergency_contact,
      chronic_disease,
      id_card_file,
      dormitory_id,
      room_id,
      bed_number
    } = req.body;

    const existing = await db.get('SELECT * FROM applications WHERE citizen_id = ?', [citizen_id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการสมัคร' });
    }

    if (existing.password !== password) {
      return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง ไม่สามารถแก้ไขได้' });
    }

    let finalDormId = existing.dormitory_id;
    let finalRoomId = existing.room_id;
    let finalBedNumber = existing.bed_number;

    if (room_id && (room_id !== existing.room_id || dormitory_id !== existing.dormitory_id)) {
      const dorm = await db.get('SELECT * FROM dormitories WHERE id = ?', [dormitory_id || existing.dormitory_id]);
      if (dorm.gender !== existing.gender) {
        return res.status(400).json({ success: false, message: 'ไม่สามารถเปลี่ยนไปหอพักต่างเพศได้' });
      }

      const room = await db.get('SELECT * FROM rooms WHERE id = ?', [room_id]);
      const occupants = await db.get(`
        SELECT COUNT(*) as count FROM applications 
        WHERE room_id = ? AND citizen_id != ? AND status IN ('approved', 'pending')
      `, [room_id, citizen_id]);

      if (occupants.count >= room.max_capacity) {
        return res.status(400).json({ success: false, message: `ห้องพัก ${room.room_number} เต็มแล้ว กรุณาเลือกห้องอื่น` });
      }

      finalDormId = dorm.id;
      finalRoomId = room.id;
      finalBedNumber = parseInt(bed_number || 1, 10);
    }

    let savedFile = existing.id_card_file;
    if (id_card_file && id_card_file.startsWith('data:')) {
      savedFile = saveBase64File(id_card_file, `idcard_${citizen_id}`);
    }

    const updateSql = db.isMySQL()
      ? `
        UPDATE applications SET
          prefix = ?, first_name = ?, last_name = ?, phone = ?, email = ?,
          faculty = ?, major = ?, address = ?, province = ?, parent_name = ?,
          parent_phone = ?, parent_relation = ?, emergency_contact = ?, chronic_disease = ?,
          id_card_file = ?, dormitory_id = ?, room_id = ?, bed_number = ?,
          updated_at = NOW()
        WHERE citizen_id = ?
      `
      : `
        UPDATE applications SET
          prefix = ?, first_name = ?, last_name = ?, phone = ?, email = ?,
          faculty = ?, major = ?, address = ?, province = ?, parent_name = ?,
          parent_phone = ?, parent_relation = ?, emergency_contact = ?, chronic_disease = ?,
          id_card_file = ?, dormitory_id = ?, room_id = ?, bed_number = ?,
          updated_at = datetime('now', 'localtime')
        WHERE citizen_id = ?
      `;

    await db.run(updateSql, [
      prefix || existing.prefix,
      first_name || existing.first_name,
      last_name || existing.last_name,
      phone || existing.phone,
      email || existing.email,
      faculty || existing.faculty,
      major || existing.major,
      address || existing.address,
      province || existing.province,
      parent_name || existing.parent_name,
      parent_phone || existing.parent_phone,
      parent_relation || existing.parent_relation,
      emergency_contact || existing.emergency_contact,
      chronic_disease || existing.chronic_disease,
      savedFile,
      finalDormId,
      finalRoomId,
      finalBedNumber,
      citizen_id
    ]);

    res.json({ success: true, message: 'อัปเดตข้อมูลการสมัครเรียบร้อยแล้ว!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Application (ยกเลิกการสมัครเข้าหอพัก)
app.delete('/api/applications/me', async (req, res) => {
  try {
    const { citizen_id, password } = req.body;
    const existing = await db.get('SELECT * FROM applications WHERE citizen_id = ?', [citizen_id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการสมัคร' });
    }

    if (existing.password !== password) {
      return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง ไม่สามารถยกเลิกได้' });
    }

    await db.run('DELETE FROM activity_submissions WHERE citizen_id = ?', [citizen_id]);
    await db.run('DELETE FROM applications WHERE citizen_id = ?', [citizen_id]);

    res.json({ success: true, message: 'ยกเลิกการสมัครและคืนสิทธิ์ห้องพักเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Public list of applicants (แสดงเฉพาะผู้ที่กำลังสมัครและรออนุมัติ status = 'pending')
app.get('/api/applications/public-list', async (req, res) => {
  try {
    const settings = await getSettingsMap();
    const isAnnounced = settings.announcement_open === 'true';

    if (isAnnounced) {
      return res.json({
        success: true,
        is_announced: true,
        message: 'การรับสมัครรอบนี้ได้ประกาศผลรายชื่อเรียบร้อยแล้ว ข้อมูลผู้ผ่านการคัดเลือกได้ถูกย้ายไปที่เมนู "ประกาศรายชื่อผู้มีสิทธิ์"',
        applicants: []
      });
    }

    const { dorm_id, search } = req.query;
    let query = `
      SELECT 
        a.id,
        a.prefix,
        a.first_name,
        a.last_name,
        a.faculty,
        a.major,
        a.dormitory_id,
        d.name as dormitory_name,
        r.room_number,
        r.floor,
        a.bed_number,
        a.status,
        a.applied_at
      FROM applications a
      JOIN dormitories d ON a.dormitory_id = d.id
      JOIN rooms r ON a.room_id = r.id
      WHERE a.status = 'pending'
    `;
    const params = [];

    if (dorm_id && dorm_id !== 'all') {
      query += ' AND a.dormitory_id = ?';
      params.push(dorm_id);
    }
    if (search) {
      query += ' AND (a.first_name LIKE ? OR a.last_name LIKE ? OR r.room_number LIKE ? OR a.faculty LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY a.dormitory_id ASC, r.floor ASC, r.room_number ASC, a.bed_number ASC';

    const rows = await db.all(query, params);
    res.json({ success: true, is_announced: false, applicants: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Official Announcement List (แสดงเฉพาะผู้ที่ผ่านการอนุมัติ status = 'approved' เมื่อถึงวันประกาศผล)
app.get('/api/announcements/passed-list', async (req, res) => {
  try {
    const settings = await getSettingsMap();
    if (settings.announcement_open !== 'true') {
      return res.json({
        success: true,
        is_open: false,
        message: `ยังไม่ถึงกำหนดการประกาศรายชื่อผู้มีสิทธิ์เข้าพักอย่างเป็นทางการ (กำหนดการประกาศผล: ${settings.announcement_date || '20 มิถุนายน 2569'})`,
        announcement_date: settings.announcement_date
      });
    }

    const { dorm_id, search } = req.query;
    let query = `
      SELECT 
        a.id,
        a.prefix,
        a.first_name,
        a.last_name,
        a.faculty,
        a.major,
        d.name as dormitory_name,
        r.room_number,
        r.floor,
        a.bed_number,
        a.status,
        a.applied_at,
        a.approved_at
      FROM applications a
      JOIN dormitories d ON a.dormitory_id = d.id
      JOIN rooms r ON a.room_id = r.id
      WHERE a.status = 'approved'
    `;
    const params = [];

    if (dorm_id && dorm_id !== 'all') {
      query += ' AND a.dormitory_id = ?';
      params.push(dorm_id);
    }
    if (search) {
      query += ' AND (a.first_name LIKE ? OR a.last_name LIKE ? OR r.room_number LIKE ? OR a.faculty LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY a.dormitory_id ASC, r.floor ASC, r.room_number ASC';

    const rows = await db.all(query, params);
    res.json({
      success: true,
      is_open: true,
      announcement_date: settings.announcement_date,
      semester: settings.system_semester,
      list: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. DORMITORY ACTIVITY & POINTS ENDPOINTS
// ==========================================

app.get('/api/activities', async (req, res) => {
  try {
    const activities = await db.all('SELECT * FROM activities WHERE is_open = 1 ORDER BY id ASC');
    res.json({ success: true, activities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Student Submit Activity Proof
app.post('/api/activities/submit', async (req, res) => {
  try {
    const { activity_id, citizen_id, proof_image, student_notes } = req.body;
    if (!activity_id || !citizen_id) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุกิจกรรมและเลขบัตรประจำตัวประชาชน' });
    }

    const student = await db.get(`
      SELECT a.*, d.name as dormitory_name, r.room_number
      FROM applications a
      LEFT JOIN dormitories d ON a.dormitory_id = d.id
      LEFT JOIN rooms r ON a.room_id = r.id
      WHERE a.citizen_id = ?
    `, [citizen_id]);

    if (!student) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลนักศึกษาในระบบหอพัก' });
    }

    // Must be approved resident to check activities
    if (student.status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'ไม่อนุญาตให้ส่งกิจกรรม: สถานะของคุณยังอยู่ระหว่างรอการอนุมัติเข้าพักหอใน'
      });
    }

    const activity = await db.get('SELECT * FROM activities WHERE id = ?', [activity_id]);
    if (!activity) {
      return res.status(404).json({ success: false, message: 'ไม่พบกิจกรรมที่ระบุ' });
    }

    const existing = await db.get(`
      SELECT id, status FROM activity_submissions 
      WHERE activity_id = ? AND citizen_id = ?
    `, [activity_id, citizen_id]);

    if (existing && existing.status === 'approved') {
      return res.status(400).json({ success: false, message: 'ท่านได้รับการอนุมัติคะแนนในกิจกรรมนี้เรียบร้อยแล้ว' });
    }

    let savedImage = null;
    if (proof_image) {
      savedImage = saveBase64File(proof_image, `activity_${activity_id}_${citizen_id}`);
    }

    if (existing) {
      const updateSql = db.isMySQL()
        ? `UPDATE activity_submissions SET proof_image = COALESCE(?, proof_image), student_notes = ?, status = 'pending', submitted_at = NOW() WHERE id = ?`
        : `UPDATE activity_submissions SET proof_image = COALESCE(?, proof_image), student_notes = ?, status = 'pending', submitted_at = datetime('now', 'localtime') WHERE id = ?`;

      await db.run(updateSql, [savedImage, student_notes || '', existing.id]);
    } else {
      await db.run(`
        INSERT INTO activity_submissions (
          activity_id, citizen_id, student_name, dormitory_name, room_number,
          proof_image, student_notes, status, granted_points
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)
      `, [
        activity_id,
        citizen_id,
        `${student.prefix} ${student.first_name} ${student.last_name}`,
        student.dormitory_name || '-',
        student.room_number || '-',
        savedImage,
        student_notes || ''
      ]);
    }

    res.json({
      success: true,
      message: 'ส่งหลักฐานการเข้าร่วมกิจกรรมสำเร็จ! อยู่ระหว่างรอผู้ดูแลระบบตรวจสอบและอนุมัติคะแนน'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Student Edit Activity Submission (แก้ไขได้เฉพาะเมื่อยังไม่ได้ตรวจสอบ)
app.put('/api/activities/submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { activity_id, citizen_id, proof_image, student_notes } = req.body;

    const sub = await db.get('SELECT * FROM activity_submissions WHERE id = ? AND citizen_id = ?', [id, citizen_id]);
    if (!sub) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการส่งกิจกรรม' });
    }

    // Check if already reviewed
    if (sub.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'ไม่สามารถแก้ไขข้อมูลได้ เนื่องจากผู้ดูแลระบบได้ทำการตรวจสอบรายการนี้แล้ว'
      });
    }

    let savedImage = sub.proof_image;
    if (proof_image && proof_image.startsWith('data:')) {
      savedImage = saveBase64File(proof_image, `activity_${activity_id || sub.activity_id}_${citizen_id}`);
    }

    const updateSql = db.isMySQL()
      ? `UPDATE activity_submissions SET activity_id = COALESCE(?, activity_id), proof_image = ?, student_notes = ?, status = 'pending', submitted_at = NOW() WHERE id = ?`
      : `UPDATE activity_submissions SET activity_id = COALESCE(?, activity_id), proof_image = ?, student_notes = ?, status = 'pending', submitted_at = datetime('now', 'localtime') WHERE id = ?`;

    await db.run(updateSql, [activity_id || sub.activity_id, savedImage, student_notes !== undefined ? student_notes : sub.student_notes, id]);

    res.json({ success: true, message: 'แก้ไขข้อมูลและส่งหลักฐานกิจกรรมใหม่เรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Student / Admin Delete Activity Submission
app.delete('/api/activities/submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM activity_submissions WHERE id = ?', [id]);
    res.json({ success: true, message: 'ลบรายการกิจกรรมเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Student View My Points & Activity Dashboard
app.get('/api/activities/my-points', async (req, res) => {
  try {
    const { citizen_id } = req.query;
    if (!citizen_id) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุเลขบัตรประจำตัวประชาชน' });
    }

    const student = await db.get(`
      SELECT a.*, d.name as dormitory_name, r.room_number
      FROM applications a
      LEFT JOIN dormitories d ON a.dormitory_id = d.id
      LEFT JOIN rooms r ON a.room_id = r.id
      WHERE a.citizen_id = ?
    `, [citizen_id]);

    if (!student) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลนักศึกษาในระบบ' });
    }

    if (student.status !== 'approved') {
      return res.status(403).json({
        success: false,
        is_pending: true,
        message: 'คุณยังไม่สามารถเข้าใช้งานระบบกิจกรรมได้ เนื่องจากใบสมัครของคุณอยู่ระหว่างรอการอนุมัติเข้าพักหอใน'
      });
    }

    const settings = await getSettingsMap();
    const minPoints = parseInt(settings.min_activity_points || '80', 10);

    const submissions = await db.all(`
      SELECT 
        s.*,
        act.title as activity_title,
        act.points as max_points,
        act.category as activity_category,
        act.event_date
      FROM activity_submissions s
      JOIN activities act ON s.activity_id = act.id
      WHERE s.citizen_id = ?
      ORDER BY s.id DESC
    `, [citizen_id]);

    let earnedFromSubs = 0;
    const pointsByCategory = {
      mandatory: 0,
      cleanliness: 0,
      meeting: 0,
      voluntary: 0
    };

    for (const sub of submissions) {
      if (sub.status === 'approved') {
        earnedFromSubs += (sub.granted_points || 0);
        const cat = sub.activity_category || 'voluntary';
        pointsByCategory[cat] = (pointsByCategory[cat] || 0) + (sub.granted_points || 0);
      }
    }

    const totalPoints = Math.max(student.activity_points || 0, earnedFromSubs);
    const isPassed = totalPoints >= minPoints;
    const progressPercent = Math.min(100, Math.round((totalPoints / minPoints) * 100));

    res.json({
      success: true,
      student: {
        citizen_id: student.citizen_id,
        name: `${student.prefix} ${student.first_name} ${student.last_name}`,
        dormitory_name: student.dormitory_name,
        room_number: student.room_number,
        faculty: student.faculty,
        major: student.major
      },
      summary: {
        total_points: totalPoints,
        min_points_required: minPoints,
        progress_percent: progressPercent,
        is_passed: isPassed,
        points_needed: Math.max(0, minPoints - totalPoints),
        by_category: pointsByCategory
      },
      submissions
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. ADMIN PORTAL ENDPOINTS
// ==========================================

const loginAttempts = {};

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const ip = req.ip || 'localhost';

    if (loginAttempts[ip] && loginAttempts[ip].count >= 5 && Date.now() - loginAttempts[ip].lastAttempt < 300000) {
      return res.status(429).json({
        success: false,
        message: 'คุณพยายามเข้าสู่ระบบผิดพลาดเกิน 5 ครั้ง กรุณารอ 5 นาทีก่อนลองใหม่อีกครั้งเพื่อความปลอดภัย'
      });
    }

    const admin = await db.get('SELECT * FROM admins WHERE username = ? AND password = ?', [username, password]);
    if (!admin) {
      if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, lastAttempt: Date.now() };
      loginAttempts[ip].count += 1;
      loginAttempts[ip].lastAttempt = Date.now();
      return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้งานหรือรหัสผ่านผู้ดูแลระบบไม่ถูกต้อง' });
    }

    delete loginAttempts[ip];

    res.json({
      success: true,
      message: 'เข้าสู่ระบบผู้ดูแลระบบสำเร็จ',
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalApps = (await db.get('SELECT COUNT(*) as count FROM applications'))?.count || 0;
    const pendingApps = (await db.get("SELECT COUNT(*) as count FROM applications WHERE status = 'pending'"))?.count || 0;
    const approvedApps = (await db.get("SELECT COUNT(*) as count FROM applications WHERE status = 'approved'"))?.count || 0;
    const maleApps = (await db.get("SELECT COUNT(*) as count FROM applications WHERE gender = 'male'"))?.count || 0;
    const femaleApps = (await db.get("SELECT COUNT(*) as count FROM applications WHERE gender = 'female'"))?.count || 0;

    const dormDistribution = await db.all(`
      SELECT 
        d.id, d.name, d.gender,
        SUM(r.max_capacity) as total_beds,
        COUNT(a.id) as occupied_beds
      FROM dormitories d
      LEFT JOIN rooms r ON d.id = r.dormitory_id
      LEFT JOIN applications a ON r.id = a.room_id AND a.status IN ('approved', 'pending')
      GROUP BY d.id, d.name, d.gender
    `);

    const pendingSubmissions = (await db.get("SELECT COUNT(*) as count FROM activity_submissions WHERE status = 'pending'"))?.count || 0;
    const settings = await getSettingsMap();

    res.json({
      success: true,
      stats: {
        total_applicants: totalApps,
        pending_applicants: pendingApps,
        approved_applicants: approvedApps,
        male_applicants: maleApps,
        female_applicants: femaleApps,
        pending_activity_reviews: pendingSubmissions,
        registration_open: settings.registration_open === 'true',
        announcement_open: settings.announcement_open === 'true',
        dorm_distribution: dormDistribution
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Get All Applications
app.get('/api/admin/applications', async (req, res) => {
  try {
    const { dorm_id, status, search } = req.query;
    let query = `
      SELECT 
        a.*,
        d.name as dormitory_name,
        r.room_number,
        r.floor
      FROM applications a
      JOIN dormitories d ON a.dormitory_id = d.id
      JOIN rooms r ON a.room_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (dorm_id && dorm_id !== 'all') {
      query += ' AND a.dormitory_id = ?';
      params.push(dorm_id);
    }
    if (status && status !== 'all') {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (a.first_name LIKE ? OR a.last_name LIKE ? OR a.citizen_id LIKE ? OR a.phone LIKE ? OR r.room_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY CASE WHEN a.status = \'pending\' THEN 0 ELSE 1 END, a.id DESC';

    const applications = await db.all(query, params);
    res.json({ success: true, applications });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Approve / Update Application Status
app.put('/api/admin/applications/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, room_id, bed_number } = req.body;

    const appRecord = await db.get('SELECT * FROM applications WHERE id = ?', [id]);
    if (!appRecord) {
      return res.status(404).json({ success: false, message: 'ไม่พบใบสมัคร' });
    }

    const statusVal = status !== undefined ? status : appRecord.status;
    const roomIdVal = room_id !== undefined ? room_id : appRecord.room_id;
    const bedNumVal = bed_number !== undefined ? bed_number : appRecord.bed_number;
    const approvedAt = statusVal === 'approved' ? (appRecord.approved_at || new Date().toISOString()) : null;

    const updateSql = db.isMySQL()
      ? `UPDATE applications SET status = ?, room_id = ?, bed_number = ?, approved_at = ?, updated_at = NOW() WHERE id = ?`
      : `UPDATE applications SET status = ?, room_id = ?, bed_number = ?, approved_at = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`;

    await db.run(updateSql, [statusVal, roomIdVal, bedNumVal, approvedAt, id]);

    res.json({
      success: true,
      message: status === 'approved' ? 'อนุมัติใบสมัครเข้าหอพักเรียบร้อยแล้ว!' : 'อัปเดตสถานะใบสมัครเรียบร้อยแล้ว'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Delete Application
app.delete('/api/admin/applications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const appRecord = await db.get('SELECT citizen_id FROM applications WHERE id = ?', [id]);
    if (appRecord) {
      await db.run('DELETE FROM activity_submissions WHERE citizen_id = ?', [appRecord.citizen_id]);
    }
    await db.run('DELETE FROM applications WHERE id = ?', [id]);
    res.json({ success: true, message: 'ลบข้อมูลใบสมัครเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Update System Settings
app.post('/api/admin/settings', async (req, res) => {
  try {
    const {
      registration_open,
      announcement_open,
      system_semester,
      registration_start,
      registration_end,
      announcement_date,
      min_activity_points,
      closed_message
    } = req.body;

    if (registration_open !== undefined) await setSettingItem('registration_open', registration_open);
    if (announcement_open !== undefined) await setSettingItem('announcement_open', announcement_open);
    if (system_semester !== undefined) await setSettingItem('system_semester', system_semester);
    if (registration_start !== undefined) await setSettingItem('registration_start', registration_start);
    if (registration_end !== undefined) await setSettingItem('registration_end', registration_end);
    if (announcement_date !== undefined) await setSettingItem('announcement_date', announcement_date);
    if (min_activity_points !== undefined) await setSettingItem('min_activity_points', min_activity_points);
    if (closed_message !== undefined) await setSettingItem('closed_message', closed_message);

    res.json({ success: true, message: 'บันทึกการตั้งค่าระบบเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Activities CRUD
app.get('/api/admin/activities', async (req, res) => {
  try {
    const activities = await db.all(`
      SELECT 
        act.*,
        COUNT(sub.id) as total_submissions,
        SUM(CASE WHEN sub.status = 'approved' THEN 1 ELSE 0 END) as approved_submissions,
        SUM(CASE WHEN sub.status = 'pending' THEN 1 ELSE 0 END) as pending_submissions
      FROM activities act
      LEFT JOIN activity_submissions sub ON act.id = sub.activity_id
      GROUP BY act.id
      ORDER BY act.id DESC
    `);
    res.json({ success: true, activities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/activities', async (req, res) => {
  try {
    const { title, description, points, category, event_date, deadline } = req.body;
    if (!title || !points) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อกิจกรรมและคะแนน' });
    }

    const result = await db.run(`
      INSERT INTO activities (title, description, points, category, event_date, deadline, is_open)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, [title, description || '', points, category || 'voluntary', event_date || '', deadline || '']);

    res.json({ success: true, message: 'สร้างกิจกรรมหอพักเรียบร้อยแล้ว', activity_id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/activities/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM activity_submissions WHERE activity_id = ?', [id]);
    await db.run('DELETE FROM activities WHERE id = ?', [id]);
    res.json({ success: true, message: 'ลบกิจกรรมเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Review Submissions (Default to pending queue)
app.get('/api/admin/submissions', async (req, res) => {
  try {
    const { activity_id, status, search } = req.query;
    let query = `
      SELECT 
        s.*,
        act.title as activity_title,
        act.points as max_points,
        act.category as activity_category
      FROM activity_submissions s
      JOIN activities act ON s.activity_id = act.id
      WHERE 1=1
    `;
    const params = [];

    if (activity_id && activity_id !== 'all') {
      query += ' AND s.activity_id = ?';
      params.push(activity_id);
    }
    
    const filterStatus = status || 'pending';
    if (filterStatus !== 'all') {
      query += ' AND s.status = ?';
      params.push(filterStatus);
    }

    if (search) {
      query += ' AND (s.student_name LIKE ? OR s.citizen_id LIKE ? OR s.dormitory_name LIKE ? OR s.room_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY s.id DESC';

    const submissions = await db.all(query, params);
    res.json({ success: true, submissions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Review Submission (เมื่อตรวจแล้ว เพิ่มคะแนนให้นักศึกษาถาวร)
app.put('/api/admin/submissions/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, granted_points, admin_comment, checked_by } = req.body;

    const sub = await db.get(`
      SELECT s.*, act.points as default_points 
      FROM activity_submissions s 
      JOIN activities act ON s.activity_id = act.id 
      WHERE s.id = ?
    `, [id]);

    if (!sub) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการส่งกิจกรรม' });
    }

    const points = status === 'approved' ? (granted_points !== undefined ? parseInt(granted_points, 10) : sub.default_points) : 0;

    // Permanently credit points to the student record
    if (status === 'approved' && points > 0) {
      await db.run(`
        UPDATE applications SET 
          activity_points = COALESCE(activity_points, 0) + ?
        WHERE citizen_id = ?
      `, [points, sub.citizen_id]);
    }

    const updateSql = db.isMySQL()
      ? `UPDATE activity_submissions SET status = ?, granted_points = ?, admin_comment = ?, checked_by = ?, checked_at = NOW() WHERE id = ?`
      : `UPDATE activity_submissions SET status = ?, granted_points = ?, admin_comment = ?, checked_by = ?, checked_at = datetime('now', 'localtime') WHERE id = ?`;

    await db.run(updateSql, [
      status,
      points,
      admin_comment || '',
      checked_by || 'ผู้ดูแลระบบหอพัก',
      id
    ]);

    res.json({
      success: true,
      message: status === 'approved' 
        ? `อนุมัติกิจกรรมและเพิ่ม ${points} คะแนนเรียบร้อยแล้ว! (ข้อมูลจะถูกนำออกจากคิวตรวจอัตโนมัติ)` 
        : 'บันทึกการไม่อนุมัติเรียบร้อยแล้ว'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Delete / Clear Reviewed Submission from Queue
app.delete('/api/admin/submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM activity_submissions WHERE id = ?', [id]);
    res.json({ success: true, message: 'ลบรายการกิจกรรมเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Get Residents by Specific Dormitory (จัดกลุ่มตามห้องและเตียง)
app.get('/api/admin/dorm-residents/:dorm_id', async (req, res) => {
  try {
    const { dorm_id } = req.params;
    const dorm = await db.get('SELECT * FROM dormitories WHERE id = ?', [dorm_id]);
    if (!dorm) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลหอพัก' });
    }

    const rooms = await db.all('SELECT * FROM rooms WHERE dormitory_id = ? ORDER BY floor ASC, room_number ASC', [dorm_id]);

    const residents = await db.all(`
      SELECT 
        a.*,
        r.room_number,
        r.floor,
        r.max_capacity,
        a.activity_points
      FROM applications a
      JOIN rooms r ON a.room_id = r.id
      WHERE a.dormitory_id = ?
      ORDER BY r.floor ASC, r.room_number ASC, a.bed_number ASC
    `, [dorm_id]);

    res.json({
      success: true,
      dormitory: dorm,
      rooms,
      residents
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Comprehensive Residents Directory & Activity Points Stats by Dormitory
app.get('/api/admin/residents-summary', async (req, res) => {
  try {
    const { dorm_id, floor, status, search, activity_status } = req.query;

    let query = `
      SELECT 
        a.*,
        d.name as dormitory_name,
        d.gender as dorm_gender,
        r.room_number,
        r.floor,
        COALESCE(a.activity_points, 0) as activity_points,
        COALESCE(points_summary.approved_count, 0) as approved_activities_count,
        COALESCE(points_summary.pending_count, 0) as pending_activities_count
      FROM applications a
      JOIN dormitories d ON a.dormitory_id = d.id
      JOIN rooms r ON a.room_id = r.id
      LEFT JOIN (
        SELECT 
          citizen_id,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
        FROM activity_submissions
        GROUP BY citizen_id
      ) points_summary ON a.citizen_id = points_summary.citizen_id
      WHERE 1=1
    `;
    const params = [];

    if (dorm_id && dorm_id !== 'all') {
      query += ' AND a.dormitory_id = ?';
      params.push(dorm_id);
    }
    if (floor && floor !== 'all') {
      query += ' AND r.floor = ?';
      params.push(floor);
    }
    if (status && status !== 'all') {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (activity_status === 'passed') {
      query += ' AND a.activity_points >= 80';
    } else if (activity_status === 'failed') {
      query += ' AND a.activity_points < 80';
    }
    if (search) {
      query += ' AND (a.first_name LIKE ? OR a.last_name LIKE ? OR a.citizen_id LIKE ? OR a.phone LIKE ? OR r.room_number LIKE ? OR a.faculty LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY a.dormitory_id ASC, r.floor ASC, r.room_number ASC, a.bed_number ASC';

    const residents = await db.all(query, params);

    const dormSummaries = await db.all(`
      SELECT 
        d.id as dorm_id,
        d.name as dorm_name,
        d.gender as dorm_gender,
        COUNT(a.id) as total_residents,
        SUM(CASE WHEN a.status = 'approved' THEN 1 ELSE 0 END) as approved_residents,
        SUM(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END) as pending_residents,
        SUM(CASE WHEN a.activity_points >= 80 THEN 1 ELSE 0 END) as passed_activity_count,
        SUM(r.max_capacity) as total_capacity
      FROM dormitories d
      LEFT JOIN rooms r ON d.id = r.dormitory_id
      LEFT JOIN applications a ON r.id = a.room_id
      GROUP BY d.id, d.name, d.gender
    `);

    res.json({
      success: true,
      residents,
      dorm_summaries: dormSummaries
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback to SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Server after DB Init
async function startServer() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`===========================================================`);
    console.log(`🏰 SRU Dormitory Web System is running on http://localhost:${PORT}`);
    console.log(`===========================================================`);
  });
}

startServer();
