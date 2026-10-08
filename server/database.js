require('dotenv').config();
const path = require('path');
const fs = require('fs');

let isMySQL = false;
let mysqlPool = null;
let sqliteDb = null;

// Determine DB Mode (TiDB Cloud / MySQL vs SQLite)
const dbUrl = process.env.DATABASE_URL || process.env.TIDB_DATABASE_URL;
const tidbHost = process.env.TIDB_HOST || process.env.DB_HOST;

if (dbUrl || tidbHost) {
  isMySQL = true;
  const mysql = require('mysql2/promise');

  if (dbUrl) {
    // Parse URL with SSL
    mysqlPool = mysql.createPool({
      uri: dbUrl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      }
    });
  } else {
    mysqlPool = mysql.createPool({
      host: process.env.TIDB_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.TIDB_PORT || process.env.DB_PORT || '4000', 10),
      user: process.env.TIDB_USER || process.env.DB_USER || 'root',
      password: process.env.TIDB_PASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.TIDB_DATABASE || process.env.DB_DATABASE || 'sru_dormitory',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: process.env.TIDB_ENABLE_SSL === 'false' ? undefined : {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      }
    });
  }
  console.log('🌐 Database Mode: TiDB Cloud / MySQL Connected');
} else {
  // Local SQLite Fallback
  const { DatabaseSync } = require('node:sqlite');
  const dbDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, 'sru_dormitory.db');
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  console.log('📁 Database Mode: Local SQLite Connected (' + dbPath + ')');
}

// Unified Database Adapter
const db = {
  isMySQL: () => isMySQL,

  async all(sql, params = []) {
    if (isMySQL) {
      const [rows] = await mysqlPool.execute(sql, params);
      return rows;
    } else {
      return sqliteDb.prepare(sql).all(...params);
    }
  },

  async get(sql, params = []) {
    if (isMySQL) {
      const [rows] = await mysqlPool.execute(sql, params);
      return rows[0] || null;
    } else {
      return sqliteDb.prepare(sql).get(...params) || null;
    }
  },

  async run(sql, params = []) {
    if (isMySQL) {
      const [result] = await mysqlPool.execute(sql, params);
      return {
        lastInsertRowid: result.insertId,
        changes: result.affectedRows
      };
    } else {
      const res = sqliteDb.prepare(sql).run(...params);
      return {
        lastInsertRowid: res.lastInsertRowid,
        changes: res.changes
      };
    }
  },

  async exec(sql) {
    if (isMySQL) {
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        await mysqlPool.query(stmt);
      }
    } else {
      sqliteDb.exec(sql);
    }
  }
};

// Initialize Schema & Seed Data
async function initDatabase() {
  try {
    if (isMySQL) {
      await initMySQLSchema();
    } else {
      initSQLiteSchema();
    }
    await seedInitialData();
    console.log('✅ Database Schema & Seed initialized successfully');
  } catch (err) {
    console.error('❌ Database init error:', err);
  }
}

function initSQLiteSchema() {
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      name TEXT,
      role TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS dormitories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      gender TEXT,
      floors TEXT,
      description TEXT,
      fee_per_term INTEGER DEFAULT 2500,
      image_url TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dormitory_id INTEGER,
      room_number TEXT,
      floor TEXT,
      max_capacity INTEGER DEFAULT 4,
      FOREIGN KEY (dormitory_id) REFERENCES dormitories (id),
      UNIQUE(dormitory_id, room_number)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      citizen_id TEXT UNIQUE,
      password TEXT,
      prefix TEXT,
      first_name TEXT,
      last_name TEXT,
      gender TEXT,
      birth_date TEXT,
      phone TEXT,
      email TEXT,
      faculty TEXT,
      major TEXT,
      address TEXT,
      province TEXT,
      parent_name TEXT,
      parent_phone TEXT,
      parent_relation TEXT,
      emergency_contact TEXT,
      chronic_disease TEXT,
      id_card_file TEXT,
      dormitory_id INTEGER,
      room_id INTEGER,
      bed_number INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',
      activity_points INTEGER DEFAULT 0,
      applied_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      approved_at TEXT,
      FOREIGN KEY (dormitory_id) REFERENCES dormitories (id),
      FOREIGN KEY (room_id) REFERENCES rooms (id)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      category TEXT DEFAULT 'general',
      published_date TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      points INTEGER DEFAULT 10,
      category TEXT DEFAULT 'voluntary',
      event_date TEXT,
      deadline TEXT,
      is_open INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS activity_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER,
      citizen_id TEXT,
      student_name TEXT,
      dormitory_name TEXT,
      room_number TEXT,
      proof_image TEXT,
      student_notes TEXT,
      status TEXT DEFAULT 'pending',
      granted_points INTEGER DEFAULT 0,
      admin_comment TEXT,
      checked_by TEXT,
      checked_at TEXT,
      submitted_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (activity_id) REFERENCES activities (id),
      FOREIGN KEY (citizen_id) REFERENCES applications (citizen_id)
    );
  `);

  try {
    sqliteDb.exec("ALTER TABLE applications ADD COLUMN activity_points INTEGER DEFAULT 0;");
  } catch (e) {}
}

async function initMySQLSchema() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(100) PRIMARY KEY,
      \`value\` TEXT,
      description VARCHAR(255),
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE,
      password VARCHAR(255),
      name VARCHAR(255),
      role VARCHAR(50) DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dormitories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) UNIQUE,
      gender VARCHAR(20),
      floors VARCHAR(50),
      description TEXT,
      fee_per_term INT DEFAULT 2500,
      image_url VARCHAR(255),
      status VARCHAR(50) DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dormitory_id INT,
      room_number VARCHAR(50),
      floor VARCHAR(20),
      max_capacity INT DEFAULT 4,
      FOREIGN KEY (dormitory_id) REFERENCES dormitories (id),
      UNIQUE KEY unique_dorm_room (dormitory_id, room_number)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      citizen_id VARCHAR(50) UNIQUE,
      password VARCHAR(255),
      prefix VARCHAR(50),
      first_name VARCHAR(150),
      last_name VARCHAR(150),
      gender VARCHAR(20),
      birth_date VARCHAR(50),
      phone VARCHAR(50),
      email VARCHAR(150),
      faculty VARCHAR(150),
      major VARCHAR(150),
      address TEXT,
      province VARCHAR(100),
      parent_name VARCHAR(150),
      parent_phone VARCHAR(50),
      parent_relation VARCHAR(100),
      emergency_contact VARCHAR(100),
      chronic_disease TEXT,
      id_card_file LONGTEXT,
      dormitory_id INT,
      room_id INT,
      bed_number INT DEFAULT 1,
      status VARCHAR(50) DEFAULT 'pending',
      activity_points INT DEFAULT 0,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      approved_at DATETIME,
      FOREIGN KEY (dormitory_id) REFERENCES dormitories (id),
      FOREIGN KEY (room_id) REFERENCES rooms (id)
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255),
      content TEXT,
      category VARCHAR(50) DEFAULT 'general',
      published_date VARCHAR(50),
      is_active INT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255),
      description TEXT,
      points INT DEFAULT 10,
      category VARCHAR(50) DEFAULT 'voluntary',
      event_date VARCHAR(100),
      deadline VARCHAR(100),
      is_open INT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_submissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      activity_id INT,
      citizen_id VARCHAR(50),
      student_name VARCHAR(200),
      dormitory_name VARCHAR(150),
      room_number VARCHAR(50),
      proof_image LONGTEXT,
      student_notes TEXT,
      status VARCHAR(50) DEFAULT 'pending',
      granted_points INT DEFAULT 0,
      admin_comment TEXT,
      checked_by VARCHAR(150),
      checked_at DATETIME,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (activity_id) REFERENCES activities (id),
      FOREIGN KEY (citizen_id) REFERENCES applications (citizen_id)
    );
  `);
}

async function seedInitialData() {
  // Check Admin
  const checkAdmin = await db.get('SELECT COUNT(*) as count FROM admins');
  if (checkAdmin && checkAdmin.count == 0) {
    await db.run('INSERT INTO admins (username, password, name, role) VALUES (?, ?, ?, ?)', [
      'admin',
      'admin123',
      'ผู้ดูแลระบบหอพัก มรภ.สุรินทร์',
      'superadmin'
    ]);
  }

  // Check Settings
  const checkSettings = await db.get('SELECT COUNT(*) as count FROM settings');
  if (checkSettings && checkSettings.count == 0) {
    const settings = [
      ['registration_open', 'true', 'สถานะเปิด/ปิดรับสมัครเข้าหอพัก (true=เปิด, false=ปิด)'],
      ['announcement_open', 'false', 'สถานะเปิดเผยรายชื่อผู้มีสิทธิ์เข้าพัก (true=เปิดประกาศแล้ว, false=ยังไม่ถึงกำหนดประกาศ)'],
      ['system_semester', 'ภาคการศึกษาที่ 1/2569', 'ภาคการศึกษาปัจจุบัน'],
      ['registration_start', '1 พฤษภาคม 2569', 'วันเริ่มต้นรับสมัคร'],
      ['registration_end', '15 มิถุนายน 2569', 'วันสิ้นสุดรับสมัคร'],
      ['announcement_date', '20 มิถุนายน 2569', 'วันประกาศรายชื่อผู้มีสิทธิ์เข้าพัก'],
      ['min_activity_points', '80', 'คะแนนกิจกรรมขั้นต่ำในการผ่านเกณฑ์หอพัก (80 คะแนน)'],
      ['closed_message', 'ขณะนี้ระบบรับสมัครเข้าหอพักปิดให้บริการชั่วคราว เนื่องจากสิ้นสุดกำหนดเวลาการรับสมัคร หรืออยู่ในช่วงประมวลผลข้อมูล', 'ข้อความแจ้งเตือนเมื่อระบบปิดรับสมัคร']
    ];
    for (const [k, v, desc] of settings) {
      if (isMySQL) {
        await db.run('INSERT INTO settings (\`key\`, \`value\`, description) VALUES (?, ?, ?)', [k, v, desc]);
      } else {
        await db.run('INSERT INTO settings (key, value, description) VALUES (?, ?, ?)', [k, v, desc]);
      }
    }
  }

  // Check Dormitories & Rooms (Structure Only, Zero Mock Students)
  const checkDorm = await db.get('SELECT COUNT(*) as count FROM dormitories');
  if (checkDorm && checkDorm.count == 0) {
    const dorms = [
      [1, 'หอพักชายผกากรอง', 'male', 'A,B', 'หอพักนักศึกษาชาย อาคาร 2 ชั้น พร้อมสิ่งอำนวยความสะดวกครบครัน ปลอดภัย อบอุ่น', 2500],
      [2, 'หอพักหญิงแสงจันทร์', 'female', 'A,B', 'หอพักนักศึกษาหญิง อาคาร 2 ชั้น มีกล้องวงจรปิดและรปภ.ดูแล 24 ชม.', 2500],
      [3, 'หอพักหญิงบานชื่น', 'female', 'A,B', 'หอพักนักศึกษาหญิง บรรยากาศร่มรื่น ใกล้สนามกีฬามหาวิทยาลัยและโรงอาหาร', 2500],
      [4, 'หอพักหญิงดาวเรือง', 'female', 'A,B', 'หอพักนักศึกษาหญิง ใกล้สำนักวิทยบริการและอาคารเรียนรวม สะดวกสบาย', 2500],
      [5, 'หอพักหญิงเฟื่องฟ้า', 'female', 'A,B', 'หอพักนักศึกษาหญิง สะดวกสบาย พร้อมพื้นที่กิจกรรมและห้องอ่านหนังสือ', 2500]
    ];
    for (const d of dorms) {
      await db.run('INSERT INTO dormitories (id, name, gender, floors, description, fee_per_term) VALUES (?, ?, ?, ?, ?, ?)', d);
    }

    // Insert rooms
    // Male Dorm (1): A1-A7 (cap 4), B1-B6 (cap 4), B7 (cap 2)
    for (let i = 1; i <= 7; i++) {
      await db.run('INSERT INTO rooms (dormitory_id, room_number, floor, max_capacity) VALUES (?, ?, ?, ?)', [1, `A${i}`, 'A', 4]);
    }
    for (let i = 1; i <= 6; i++) {
      await db.run('INSERT INTO rooms (dormitory_id, room_number, floor, max_capacity) VALUES (?, ?, ?, ?)', [1, `B${i}`, 'B', 4]);
    }
    await db.run('INSERT INTO rooms (dormitory_id, room_number, floor, max_capacity) VALUES (?, ?, ?, ?)', [1, 'B7', 'B', 2]);

    // Female Dorms (2, 3, 4, 5): A1-A6 (cap 4), B1-B6 (cap 4)
    for (let dormId = 2; dormId <= 5; dormId++) {
      for (let i = 1; i <= 6; i++) {
        await db.run('INSERT INTO rooms (dormitory_id, room_number, floor, max_capacity) VALUES (?, ?, ?, ?)', [dormId, `A${i}`, 'A', 4]);
      }
      for (let i = 1; i <= 6; i++) {
        await db.run('INSERT INTO rooms (dormitory_id, room_number, floor, max_capacity) VALUES (?, ?, ?, ?)', [dormId, `B${i}`, 'B', 4]);
      }
    }
  }

  // Seed Announcements
  const checkAnnounce = await db.get('SELECT COUNT(*) as count FROM announcements');
  if (checkAnnounce && checkAnnounce.count == 0) {
    const announcements = [
      [
        'ประกาศกำหนดการยื่นความประสงค์ขอเข้าพักในหอพักนักศึกษา ภาคการศึกษาที่ 1/2569',
        'กองพัฒนานักศึกษา มหาวิทยาลัยราชภัฏสุรินทร์ เปิดรับสมัครนักศึกษาใหม่ระดับปริญญาตรี ประจำปีการศึกษา 2569 เข้าพักอาศัยในหอพักของมหาวิทยาลัย ทั้ง 5 หอพัก นักศึกษาสามารถกรอกข้อมูลและเลือกห้องพักได้ด้วยตนเองผ่านระบบออนไลน์',
        'general',
        '2026-05-01'
      ],
      [
        'ข้อบังคับและการสะสมคะแนนกิจกรรมหอพัก (เกณฑ์ผ่าน 80 คะแนนขึ้นไป)',
        'นักศึกษาหอพักทุกคนต้องเข้าร่วมกิจกรรมของหอพักและมหาวิทยาลัยเพื่อสะสมคะแนนกิจกรรมไม่ต่ำกว่า 80 คะแนนในแต่ละภาคการศึกษา โดยสามารถส่งหลักฐานรูปถ่ายและเช็คคะแนนสะสมแบบเรียลไทม์ได้ในระบบ',
        'general',
        '2026-05-15'
      ],
      [
        'ประกาศรายชื่อผู้ผ่านการคัดเลือกและมีสิทธิ์เข้าพักในหอพักนักศึกษา ประจำภาคเรียนที่ 1/2569',
        'ตรวจสอบรายชื่อและห้องพักที่ได้รับการจัดสรร ขอให้นักศึกษาที่มีรายชื่อรายงานตัวและเตรียมเอกสารตามที่มหาวิทยาลัยกำหนด',
        'announcement_list',
        '2026-06-20'
      ]
    ];
    for (const a of announcements) {
      await db.run('INSERT INTO announcements (title, content, category, published_date) VALUES (?, ?, ?, ?)', a);
    }
  }

  // Seed Standard Activities
  const checkAct = await db.get('SELECT COUNT(*) as count FROM activities');
  if (checkAct && checkAct.count == 0) {
    const activities = [
      ['ปฐมนิเทศนักศึกษาหอพัก ประจำปีการศึกษา 2569', 'เข้าร่วมรับฟังระเบียบและชี้แจงแนวปฏิบัติการใช้ชีวิตในหอพักร่วมกัน ณ หอประชุมใหญ่', 25, 'meeting', '25 มิ.ย. 2569 09:00', '25 มิ.ย. 2569 18:00', 1],
      ['กิจกรรม Big Cleaning Day รวมพลังพัฒนาหอพัก', 'ทำความสะอาดห้องพัก พื้นที่ส่วนกลาง และทางเดินอาคารหอพักให้น่าอยู่และถูกสุขลักษณะ', 20, 'cleanliness', '15 ก.ค. 2569 08:30', '16 ก.ค. 2569 23:59', 1],
      ['การฝึกอบรมการป้องกันและระงับอัคคีภัยในหอพัก', 'เรียนรู้และฝึกปฏิบัติการใช้อุปกรณ์ดับเพลิง การเอาตัวรอด และการอพยพหนีไฟ', 20, 'mandatory', '5 ส.ค. 2569 13:00', '6 ส.ค. 2569 20:00', 1],
      ['กิจกรรมบำเพ็ญประโยชน์และจิตอาสาเพื่อสังคม มรภ.สุรินทร์', 'ร่วมปลูกต้นไม้ พัฒนาภูมิทัศน์รอบมหาวิทยาลัย หรือกิจกรรมจิตอาสาช่วยเหลือชุมชน', 20, 'voluntary', '20 ส.ค. 2569 09:00', '22 ส.ค. 2569 23:59', 1],
      ['การตรวจประเมินความสะอาดและความเป็นระเบียบเรียบร้อยของห้องพัก ครั้งที่ 1', 'การตรวจห้องพักประจำเดือนเพื่อสุขอนามัยและความปลอดภัย', 15, 'cleanliness', '10 ก.ย. 2569 17:00', '12 ก.ย. 2569 23:59', 1]
    ];
    for (const act of activities) {
      await db.run('INSERT INTO activities (title, description, points, category, event_date, deadline, is_open) VALUES (?, ?, ?, ?, ?, ?, ?)', act);
    }
  }
}

module.exports = {
  db,
  initDatabase
};
