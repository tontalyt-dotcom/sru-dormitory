// Application State & Main Controller
const AppState = {
  currentView: 'home',
  systemStatus: null,
  dormitories: [],
  activities: [],
  loggedInStudent: null,
  loggedInAdmin: null,
  loginFailCount: 0,
  lockoutUntil: 0
};

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// Convert file input to Base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Navigation & View Switching
function navigateTo(viewId) {
  if (viewId === 'admin' && !AppState.loggedInAdmin) {
    openAdminLoginModal();
    return;
  }

  AppState.currentView = viewId;

  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-view') === viewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });

  const targetSection = document.getElementById(`view-${viewId}`);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  const titles = {
    home: 'หน้าหลักและประชาสัมพันธ์',
    register: 'ระบบสมัครเข้าหอพักนักศึกษา (สร้างรหัสผ่านในใบสมัคร)',
    manage: 'ติดตามสถานะและแก้ไขข้อมูลใบสมัคร',
    directory: 'รายชื่อผู้สมัครที่อยู่ระหว่างรอการอนุมัติ',
    announcements: 'ประกาศรายชื่อผู้มีสิทธิ์เข้าพักในหอพัก',
    resident: 'ข้อมูลสมาชิกหอพักของฉัน (สำหรับผู้ผ่านการอนุมัติแล้ว)',
    activities: 'ระบบเช็คกิจกรรมและสะสมคะแนนหอพัก (เต็ม 100 คะแนน)',
    admin: 'ระบบจัดการผู้ดูแลระบบ (Admin Control Center)'
  };

  const titleElem = document.getElementById('top-bar-title');
  if (titleElem) titleElem.textContent = titles[viewId] || 'ระบบจองห้องพักหอใน';

  if (viewId === 'home') loadHomeData();
  if (viewId === 'register') loadRegisterView();
  if (viewId === 'manage') loadManageView();
  if (viewId === 'directory') loadDirectoryData();
  if (viewId === 'announcements') loadAnnouncementsData();
  if (viewId === 'resident') loadResidentProfileView();
  if (viewId === 'activities') loadActivitiesView();
  if (viewId === 'admin') loadAdminView();

  const sidebar = document.getElementById('app-sidebar');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    sidebar.classList.remove('mobile-open');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Initial Bootstrapping
async function initApp() {
  try {
    const savedStudent = localStorage.getItem('sru_student_session');
    if (savedStudent) {
      AppState.loggedInStudent = JSON.parse(savedStudent);
    }
    const savedAdmin = localStorage.getItem('sru_admin_session');
    if (savedAdmin) {
      AppState.loggedInAdmin = JSON.parse(savedAdmin);
    }

    updateUserStatusWidget();
    await refreshSystemStatus();
    navigateTo('home');
  } catch (err) {
    console.error('App init error:', err);
  }
}

async function refreshSystemStatus() {
  try {
    const res = await API.getStatus();
    if (res.success) {
      AppState.systemStatus = res.settings;
      renderSystemStatusBadge(res.settings);
    }
  } catch (e) {
    console.error('Failed to get status:', e);
  }
}

function renderSystemStatusBadge(settings) {
  const pill = document.getElementById('system-status-pill');
  if (!pill) return;

  if (settings.registration_open) {
    pill.className = 'system-status-pill open';
    pill.innerHTML = `<span class="status-dot"></span><span>ระบบเปิดรับสมัคร (${settings.system_semester})</span>`;
  } else {
    pill.className = 'system-status-pill closed';
    pill.innerHTML = `<span class="status-dot"></span><span>ระบบปิดรับสมัคร</span>`;
  }
}

function updateUserStatusWidget() {
  const userWidget = document.getElementById('user-status-card');
  const adminNav = document.getElementById('admin-nav-section');
  const headerAuth = document.getElementById('header-auth-buttons');

  if (adminNav) {
    adminNav.style.display = AppState.loggedInAdmin ? 'block' : 'none';
  }

  if (headerAuth) {
    if (AppState.loggedInAdmin || AppState.loggedInStudent) {
      headerAuth.innerHTML = `
        <button class="btn-header btn-header-outline" onclick="confirmLogout()" title="ออกจากระบบ">
          ออกจากระบบ (Logout)
        </button>
      `;
    } else {
      headerAuth.innerHTML = `
        <button class="btn-header btn-header-outline" onclick="openLoginModal()">
          เข้าสู่ระบบ
        </button>
      `;
    }
  }

  if (!userWidget) return;

  if (AppState.loggedInAdmin) {
    userWidget.innerHTML = `
      <div class="user-avatar" style="background: linear-gradient(135deg, #10b981, #059669); font-weight:700;">A</div>
      <div class="user-info">
        <div class="user-name">${AppState.loggedInAdmin.name}</div>
        <div class="user-role">ผู้ดูแลระบบหอพัก (Admin)</div>
      </div>
      <button onclick="confirmLogout()" title="ออกจากระบบ" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:0.8rem; font-weight:600; padding:2px 6px;">ออก</button>
    `;
  } else if (AppState.loggedInStudent) {
    const st = AppState.loggedInStudent;
    const isApproved = st.status === 'approved';

    userWidget.innerHTML = `
      <div class="user-avatar" style="background: ${isApproved ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #f59e0b, #d97706)'};">
        ${st.first_name ? st.first_name.charAt(0) : 'น'}
      </div>
      <div class="user-info">
        <div class="user-name">${st.prefix} ${st.first_name} ${st.last_name}</div>
        <div class="user-role" style="color: ${isApproved ? '#34d399' : '#fcd34d'};">
          ${isApproved ? ' สมาชิกหอใน' : '⏳ รอการอนุมัติ'}
        </div>
      </div>
      <button onclick="confirmLogout()" title="ออกจากระบบ" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:0.8rem; font-weight:600; padding:2px 6px;">ออก</button>
    `;
  } else {
    userWidget.innerHTML = `
      <div class="user-avatar" style="background: rgba(255,255,255,0.15); font-weight:700;">U</div>
      <div class="user-info">
        <div class="user-name">ผู้ใช้ทั่วไป</div>
        <div class="user-role">ยังไม่ได้เข้าสู่ระบบ</div>
      </div>
      <button onclick="openLoginModal()" title="เข้าสู่ระบบ" style="background:none; border:none; color:#e5a93b; cursor:pointer; font-size:0.8rem; font-weight:600; padding:2px 6px;">เข้าสู่ระบบ</button>
    `;
  }
}

// 1. Logout with Modern Confirmation Modal
function confirmLogout() {
  openLogoutModal();
}

function openLogoutModal() {
  const modal = document.getElementById('logout-confirm-modal');
  if (modal) modal.classList.add('active');
}

function closeLogoutModal() {
  const modal = document.getElementById('logout-confirm-modal');
  if (modal) modal.classList.remove('active');
}

function executeLogout() {
  closeLogoutModal();
  AppState.loggedInStudent = null;
  AppState.loggedInAdmin = null;
  localStorage.removeItem('sru_student_session');
  localStorage.removeItem('sru_admin_session');
  updateUserStatusWidget();
  showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
  navigateTo('home');
}

// =========================================================
// 1. HOME VIEW
// =========================================================
async function loadHomeData() {
  try {
    const [statusRes, dormsRes] = await Promise.all([
      API.getStatus(),
      API.getDormitories()
    ]);

    if (dormsRes.success) {
      AppState.dormitories = dormsRes.dormitories;
      renderDormitoriesGrid(dormsRes.dormitories);
    }

    if (statusRes.success) {
      AppState.systemStatus = statusRes.settings;
      renderAnnouncementsBanner(statusRes.settings, statusRes.announcements);
      renderHomeStats(statusRes.stats);
    }

    renderStudentPortalBanner();
  } catch (err) {
    console.error('Error loading home data:', err);
  }
}

function renderStudentPortalBanner() {
  const container = document.getElementById('home-student-banner-container');
  if (!container) return;

  if (AppState.loggedInStudent) {
    const st = AppState.loggedInStudent;
    const isApproved = st.status === 'approved';

    container.innerHTML = `
      <div class="sru-profile-banner">
        <div class="profile-banner-header" style="background: ${isApproved ? 'linear-gradient(90deg, #164e63 0%, #047857 100%)' : 'linear-gradient(90deg, #381250 0%, #521a75 100%)'};">
          <div class="profile-banner-header-left">
            <span class="profile-status-indicator" style="background: ${isApproved ? '#10b981' : '#f59e0b'}; box-shadow: 0 0 8px ${isApproved ? '#10b981' : '#f59e0b'};"></span>
            <span>ข้อมูลการสมัครเข้าหอในของคุณ</span>
          </div>
          <span style="font-size:0.8rem; background:rgba(255,255,255,0.22); padding:3px 12px; border-radius:12px; font-weight:700;">
            ${isApproved ? ' ได้รับการอนุมัติเข้าพักแล้ว' : '⏳ อยู่ระหว่างรอการตรวจสอบและอนุมัติจากผู้ดูแลระบบ'}
          </span>
        </div>
        <div class="profile-banner-body">
          <div class="info-row">
            <div class="info-label">สถานะใบสมัคร :</div>
            <div class="info-val ${isApproved ? 'success' : 'highlight'}">
              ${isApproved ? ' ผ่านการอนุมัติแล้ว (เป็นสมาชิกหอพัก)' : '⏳ ส่งใบสมัครแล้ว (รอแอดมินอนุมัติ & รอประกาศรายชื่อ)'}
            </div>
          </div>
          <div class="info-row">
            <div class="info-label">ชื่อ - สกุล :</div>
            <div class="info-val">${st.prefix} ${st.first_name} ${st.last_name}</div>
          </div>
          <div class="info-row">
            <div class="info-label">เลขบัตรประชาชน :</div>
            <div class="info-val">${st.citizen_id.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5')}</div>
          </div>
          <div class="info-row">
            <div class="info-label">หอพักที่เลือก :</div>
            <div class="info-val highlight">${st.dormitory_name || '-'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">ห้องพัก / เตียง :</div>
            <div class="info-val highlight">ห้อง ${st.room_number || '-'} (ชั้น ${st.floor || '-'}) เตียง ${st.bed_number || '-'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">คณะ / สาขาวิชา :</div>
            <div class="info-val">${st.faculty || '-'} (${st.major || '-'})</div>
          </div>
          <div class="info-row">
            <div class="info-label">การดำเนินการ :</div>
            <div class="info-val">
              <a href="javascript:void(0)" onclick="navigateTo('manage')" style="color:#471764; font-weight:700; text-decoration:underline;">
                ดูรายละเอียดใบสมัคร / แก้ไขข้อมูล 
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="sru-profile-banner">
        <div class="profile-banner-header">
          <div class="profile-banner-header-left">
            <span class="profile-status-indicator"></span>
            <span>ระบบรับสมัครและจองห้องพักในหอพัก มหาวิทยาลัยราชภัฏสุรินทร์</span>
          </div>
          <span style="font-size:0.8rem; background:rgba(255,255,255,0.18); padding:3px 10px; border-radius:12px;">
            ยินดีต้อนรับนักศึกษาใหม่
          </span>
        </div>
        <div class="profile-banner-body">
          <div class="info-row">
            <div class="info-label">สถานะการเปิดรับสมัคร :</div>
            <div class="info-val ${AppState.systemStatus && AppState.systemStatus.registration_open ? 'success' : 'highlight'}">
              ${AppState.systemStatus && AppState.systemStatus.registration_open ? 'เปิดรับสมัครจองห้องพักออนไลน์' : 'ปิดรับสมัคร'}
            </div>
          </div>
          <div class="info-row">
            <div class="info-label">ภาคการศึกษา :</div>
            <div class="info-val">${AppState.systemStatus ? AppState.systemStatus.system_semester : 'ภาคการศึกษาที่ 1/2569'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">ขั้นตอนการสมัคร :</div>
            <div class="info-val highlight">กรอกข้อมูลและสร้างรหัสผ่านในใบสมัคร  รอแอดมินอนุมัติ  ประกาศรายชื่อ</div>
          </div>
          <div class="info-row">
            <div class="info-label">เกณฑ์กิจกรรมหอพัก :</div>
            <div class="info-val">คะแนนเต็มรวม 100 คะแนน (เกณฑ์ผ่านขั้นต่ำ 80 คะแนน)</div>
          </div>
        </div>
      </div>
    `;
  }
}

function renderAnnouncementsBanner(settings, announcements) {
  const container = document.getElementById('home-hero-banner');
  if (!container) return;

  const topAnnounce = announcements && announcements.length > 0 ? announcements[0] : {
    title: 'กำหนดการยื่นคำร้องขอเข้าพักในหอพักนักศึกษา ประจำภาคเรียนที่ 1/2569',
    content: 'เปิดรับสมัครนักศึกษาใหม่ระดับปริญญาตรี สามารถเลือกหอพักและห้องพักที่ต้องการได้ทันที พร้อมแนบหลักฐานเอกสารยืนยันตัวตน'
  };

  container.innerHTML = `
    <div class="hero-left">
      <div class="hero-tag"> ข่าวประชาสัมพันธ์หอพักล่าสุด</div>
      <h2 class="hero-title">${topAnnounce.title}</h2>
      <p class="hero-desc">${topAnnounce.content}</p>
      <div class="hero-actions">
        ${settings.registration_open ? `
          <button class="btn btn-gold" onclick="navigateTo('register')">
            ️ กรอกใบสมัครเข้าหอพักทันที
          </button>
        ` : `
          <button class="btn btn-secondary" style="cursor:not-allowed;" title="ระบบปิดรับสมัคร">
             ระบบปิดรับสมัคร
          </button>
        `}
        <button class="btn btn-secondary" onclick="navigateTo('directory')">
           รายชื่อผู้สมัคร (รออนุมัติ)
        </button>
        <button class="btn btn-primary" onclick="navigateTo('announcements')">
           ประกาศรายชื่อผู้มีสิทธิ์
        </button>
      </div>
    </div>
    <div class="hero-badge-dates">
      <div class="term">${settings.system_semester}</div>
      <div class="date-range">${settings.registration_start} - ${settings.registration_end}</div>
      <div style="font-size:0.8rem; color:#059669; font-weight:600; margin-top:6px;">
         กำหนดประกาศผล: ${settings.announcement_date}
      </div>
    </div>
  `;
}

function renderHomeStats(stats) {
  const statsContainer = document.getElementById('home-stats-boxes');
  if (!statsContainer || !stats) return;

  statsContainer.innerHTML = `
    <div class="form-row" style="margin-bottom: 24px;">
      <div style="background:#ffffff; padding:18px 20px; border-radius:12px; border:1px solid #e5e7eb; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; align-items:center; gap:14px;">
        <div style="width:48px; height:48px; border-radius:10px; background:#eff6ff; color:#3b82f6; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">️</div>
        <div>
          <div style="font-size:0.82rem; color:#6b7280;">ความจุเตียงพักทั้งหมด</div>
          <div style="font-size:1.4rem; font-weight:700; color:#1e293b;">${stats.total_beds} <span style="font-size:0.9rem; font-weight:400; color:#9ca3af;">เตียง</span></div>
        </div>
      </div>
      <div style="background:#ffffff; padding:18px 20px; border-radius:12px; border:1px solid #e5e7eb; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; align-items:center; gap:14px;">
        <div style="width:48px; height:48px; border-radius:10px; background:#ecfdf5; color:#10b981; display:flex; align-items:center; justify-content:center; font-size:1.5rem;"></div>
        <div>
          <div style="font-size:0.82rem; color:#6b7280;">เตียงว่างคงเหลือ</div>
          <div style="font-size:1.4rem; font-weight:700; color:#059669;">${stats.available_beds} <span style="font-size:0.9rem; font-weight:400; color:#9ca3af;">เตียง</span></div>
        </div>
      </div>
      <div style="background:#ffffff; padding:18px 20px; border-radius:12px; border:1px solid #e5e7eb; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; align-items:center; gap:14px;">
        <div style="width:48px; height:48px; border-radius:10px; background:#fef3c7; color:#d97706; display:flex; align-items:center; justify-content:center; font-size:1.5rem;"></div>
        <div>
          <div style="font-size:0.82rem; color:#6b7280;">ผู้ยื่นสมัคร / จองแล้ว</div>
          <div style="font-size:1.4rem; font-weight:700; color:#d97706;">${stats.occupied_beds} <span style="font-size:0.9rem; font-weight:400; color:#9ca3af;">คน</span></div>
        </div>
      </div>
    </div>
  `;
}

function renderDormitoriesGrid(dorms) {
  const container = document.getElementById('home-dormitories-grid');
  if (!container) return;

  let html = '';
  for (const dorm of dorms) {
    const isMale = dorm.gender === 'male';
    const percent = dorm.total_beds > 0 ? Math.round((dorm.occupied_beds / dorm.total_beds) * 100) : 0;

    html += `
      <div class="dorm-card">
        <div class="dorm-card-header ${dorm.gender}">
          <div>
            <div class="dorm-name">${dorm.name}</div>
            <div style="font-size:0.75rem; opacity:0.85;">อาคาร 2 ชั้น (${isMale ? 'ห้อง A1-A7, B1-B7' : 'ห้อง A1-A6, B1-B6'})</div>
          </div>
          <span class="dorm-tag">${isMale ? 'หอพักชาย' : 'หอพักหญิง'}</span>
        </div>
        <div class="dorm-card-body">
          <p class="dorm-desc">${dorm.description}</p>
          <div class="dorm-capacity-box">
            <div class="capacity-labels">
              <span>สถานะที่พัก</span>
              <span class="capacity-val">${dorm.occupied_beds} / ${dorm.total_beds} เตียง</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${percent}%;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:#6b7280; margin-top:4px;">
              <span>ว่าง ${dorm.available_beds} เตียง</span>
              <span>จองแล้ว ${percent}%</span>
            </div>
          </div>
        </div>
        <div class="dorm-card-footer">
          <div class="dorm-fee">
            ฿${dorm.fee_per_term.toLocaleString()} <span>/ ภาคการศึกษา</span>
          </div>
          <button class="btn btn-sm btn-secondary" onclick="viewDormRoomsModal(${dorm.id})">
             ดูผังห้องพัก
          </button>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// =========================================================
// 2. REGISTRATION VIEW
// =========================================================
let selectedRegRoomData = null;

async function loadRegisterView() {
  const container = document.getElementById('view-register');
  if (!container) return;

  const status = AppState.systemStatus || {};
  if (!status.registration_open) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; background: #ffffff; border-radius: 18px; border: 1px solid #e5e7eb; box-shadow: 0 4px 12px rgba(0,0,0,0.05); max-width: 650px; margin: 40px auto;">
        <div style="font-size: 3.5rem; margin-bottom: 16px;"></div>
        <h2 style="color: #471764; font-size: 1.5rem; font-weight: 700; margin-bottom: 12px;">ระบบปิดรับสมัครเข้าหอพัก</h2>
        <p style="color: #6b7280; line-height: 1.6; margin-bottom: 24px;">${status.closed_message || 'ขณะนี้อยู่นอกช่วงเวลารับสมัคร หรือระบบอยู่ระหว่างประมวลผลข้อมูล'}</p>
        <button class="btn btn-primary" onclick="navigateTo('home')">กลับสู่หน้าหลัก</button>
      </div>
    `;
    return;
  }

  const res = await API.getDormitories();
  if (res.success) {
    AppState.dormitories = res.dormitories;
  }

  renderRegisterForm();
}

function renderRegisterForm() {
  const container = document.getElementById('view-register');
  if (!container) return;

  if (AppState.loggedInStudent && AppState.loggedInStudent.status === 'approved') {
    const st = AppState.loggedInStudent;
    container.innerHTML = `
      <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 18px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.06);">
        <div style="background: linear-gradient(135deg, #164e63 0%, #047857 100%); color: #ffffff; padding: 28px; text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 1.6rem; font-weight: 700;">
            
          </div>
          <h2 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 6px;">คุณเป็นสมาชิกหอพักนักศึกษาแล้ว</h2>
          <p style="font-size: 0.92rem; color: #a7f3d0;">ใบสมัครของคุณได้รับการตรวจสอบและอนุมัติเข้าพักในหอพักเรียบร้อยแล้ว</p>
        </div>
        <div style="padding: 32px 28px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <div style="font-size: 0.85rem; font-weight: 700; color: #471764; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">
              ข้อมูลการเข้าพักที่ได้รับการอนุมัติ
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
              <div>
                <span style="font-size: 0.8rem; color: #64748b;">ชื่อ - สกุล :</span>
                <div style="font-weight: 600; color: #1e293b;">${st.prefix} ${st.first_name} ${st.last_name}</div>
              </div>
              <div>
                <span style="font-size: 0.8rem; color: #64748b;">หอพัก :</span>
                <div style="font-weight: 600; color: #059669;">${st.dormitory_name || '-'}</div>
              </div>
              <div>
                <span style="font-size: 0.8rem; color: #64748b;">ห้องพัก / ชั้น :</span>
                <div style="font-weight: 600; color: #059669;">ห้อง ${st.room_number || '-'} (ชั้น ${st.floor || '-'})</div>
              </div>
              <div>
                <span style="font-size: 0.8rem; color: #64748b;">เตียงนอน :</span>
                <div style="font-weight: 600; color: #059669;">เตียงที่ ${st.bed_number || '-'}</div>
              </div>
            </div>
          </div>
          
          <div style="background: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; padding: 14px 18px; margin-bottom: 28px; font-size: 0.9rem; color: #1e40af; line-height: 1.6;">
            <strong>คำชี้แจง:</strong> ระบบสงวนสิทธิ์การสมัคร 1 บัญชีต่อ 1 สิทธิ์การเข้าพัก เพื่อป้องกันการจองห้องพักซ้ำซ้อน หากต้องการตรวจสอบข้อมูลส่วนตัว หรือส่งหลักฐานกิจกรรมหอพัก สามารถใช้เมนูทางด้านซ้ายได้ทันที
          </div>

          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-primary" onclick="navigateTo('resident')" style="min-width: 170px;">
              ดูข้อมูลสมาชิกหอพัก
            </button>
            <button type="button" class="btn btn-gold" onclick="navigateTo('activities')" style="min-width: 180px;">
              เช็คกิจกรรม & คะแนนหอ
            </button>
            <button type="button" class="btn btn-secondary" onclick="navigateTo('home')" style="min-width: 130px;">
              กลับหน้าหลัก
            </button>
          </div>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #381250 0%, #521a75 100%); color: #ffffff; padding: 24px 28px; border-radius: 18px 18px 0 0; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <h2 style="font-size: 1.35rem; font-weight: 700; margin-bottom: 4px;"> แบบฟอร์มสมัครเข้าพักในหอพักนักศึกษา</h2>
          <p style="font-size: 0.85rem; color: #e9d5ff;">กรอกข้อมูลให้ครบถ้วนและสร้างรหัสผ่านเพื่อใช้ติดตามผล (สถานะเริ่มต้น: รอการอนุมัติ)</p>
        </div>
        <span style="background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 12px; font-size: 0.8rem; font-weight: 600;">
          ภาคเรียนที่ 1/2569
        </span>
      </div>

      <form id="dorm-registration-form" onsubmit="handleRegistrationSubmit(event)" style="background: #ffffff; border-radius: 0 0 18px 18px; border: 1px solid #e5e7eb; border-top: none; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
        
        <!-- Part 1: Personal Info & Password Creation -->
        <div style="margin-bottom: 28px;">
          <h3 style="font-size: 1.1rem; font-weight: 700; color: #471764; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #f3ebf9; padding-bottom: 8px;">
            <span>1. ข้อมูลผู้สมัครและกำหนดรหัสผ่านเข้าสู่ระบบ</span>
          </h3>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label required">เพศ (ตามบัตรประชาชน)</label>
              <select id="reg-gender" class="form-select" required onchange="handleRegGenderChange(this.value)">
                <option value="">-- เลือกเพศ --</option>
                <option value="male">ชาย (หอพักชายผกากรอง)</option>
                <option value="female">หญิง (หอพักหญิง 4 หอพัก)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label required">คำนำหน้าชื่อ</label>
              <select id="reg-prefix" class="form-select" required>
                <option value="นาย">นาย</option>
                <option value="นางสาว">นางสาว</option>
                <option value="นาง">นาง</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label required">ชื่อ</label>
              <input type="text" id="reg-firstname" class="form-input" placeholder="เช่น กิตติศักดิ์" required>
            </div>
            <div class="form-group">
              <label class="form-label required">นามสกุล</label>
              <input type="text" id="reg-lastname" class="form-input" placeholder="เช่น สายสุวรรณ" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label required">เลขประจำตัวประชาชน (13 หลัก)</label>
              <input type="text" id="reg-citizen-id" class="form-input" maxlength="13" pattern="[0-9]{13}" placeholder="เลขบัตร ปชช. 13 หลัก" required>
              <div class="form-hint">ใช้เป็นบัญชีเข้าสู่ระบบ</div>
            </div>
            <div class="form-group">
              <label class="form-label required">สร้างรหัสผ่าน (Password สำหรับเข้าสู่ระบบ)</label>
              <input type="password" id="reg-password" class="form-input" placeholder="กำหนดรหัสผ่าน (อย่างน้อย 4 ตัว)" required minlength="4">
              <div class="form-hint">สร้างรหัสผ่านเพื่อใช้เข้าสู่ระบบตรวจสถานะภายหลัง</div>
            </div>
            <div class="form-group">
              <label class="form-label required">เบอร์โทรศัพท์มือถือ</label>
              <input type="tel" id="reg-phone" class="form-input" maxlength="10" placeholder="เช่น 0812345678" required>
            </div>
            <div class="form-group">
              <label class="form-label">อีเมล</label>
              <input type="email" id="reg-email" class="form-input" placeholder="example@email.com">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label required">คณะที่เข้าศึกษา</label>
              <select id="reg-faculty" class="form-select" required>
                <option value="">-- เลือกคณะ --</option>
                <option value="คณะครุศาสตร์">คณะครุศาสตร์</option>
                <option value="คณะวิทยาศาสตร์และเทคโนโลยี">คณะวิทยาศาสตร์และเทคโนโลยี</option>
                <option value="คณะมนุษยศาสตร์และสังคมศาสตร์">คณะมนุษยศาสตร์และสังคมศาสตร์</option>
                <option value="คณะวิทยาการจัดการ">คณะวิทยาการจัดการ</option>
                <option value="คณะเทคโนโลยีอุตสาหกรรม">คณะเทคโนโลยีอุตสาหกรรม</option>
                <option value="คณะเกษตรและอุตสาหกรรมเกษตร">คณะเกษตรและอุตสาหกรรมเกษตร</option>
                <option value="คณะพยาบาลศาสตร์">คณะพยาบาลศาสตร์</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label required">สาขาวิชา</label>
              <input type="text" id="reg-major" class="form-input" placeholder="เช่น วิทยาการคอมพิวเตอร์" required>
            </div>
            <div class="form-group">
              <label class="form-label">โรคประจำตัว / ข้อจำกัดด้านสุขภาพ</label>
              <input type="text" id="reg-disease" class="form-input" placeholder="เช่น หอบหืด, ภูมิแพ้ หรือระบุ 'ไม่มี'">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" style="grid-column: span 2;">
              <label class="form-label">ที่อยู่ตามทะเบียนบ้าน</label>
              <input type="text" id="reg-address" class="form-input" placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ">
            </div>
            <div class="form-group">
              <label class="form-label required">จังหวัด</label>
              <input type="text" id="reg-province" class="form-input" placeholder="เช่น สุรินทร์, บุรีรัมย์" required>
            </div>
          </div>
        </div>

        <!-- Part 2: Parent & Emergency -->
        <div style="margin-bottom: 28px;">
          <h3 style="font-size: 1.1rem; font-weight: 700; color: #471764; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #f3ebf9; padding-bottom: 8px;">
            <span>2. ข้อมูลผู้ปกครองและการติดต่อฉุกเฉิน</span>
          </h3>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label required">ชื่อ-สกุล ผู้ปกครอง</label>
              <input type="text" id="reg-parent-name" class="form-input" placeholder="ชื่อและนามสกุลผู้ปกครอง" required>
            </div>
            <div class="form-group">
              <label class="form-label required">ความสัมพันธ์</label>
              <select id="reg-parent-relation" class="form-select" required>
                <option value="บิดา">บิดา</option>
                <option value="มารดา">มารดา</option>
                <option value="ผู้ปกครองตามกฎหมาย">ผู้ปกครองตามกฎหมาย</option>
                <option value="ญาติ">ญาติ</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label required">เบอร์โทรศัพท์ผู้ปกครอง</label>
              <input type="tel" id="reg-parent-phone" class="form-input" maxlength="10" placeholder="เช่น 0898765432" required>
            </div>
            <div class="form-group">
              <label class="form-label required">เบอร์ติดต่อฉุกเฉิน 24 ชม.</label>
              <input type="tel" id="reg-emergency" class="form-input" maxlength="10" placeholder="เบอร์โทรติดต่อฉุกเฉิน" required>
            </div>
          </div>
        </div>

        <!-- Part 3: ID Card Upload -->
        <div style="margin-bottom: 28px;">
          <h3 style="font-size: 1.1rem; font-weight: 700; color: #471764; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #f3ebf9; padding-bottom: 8px;">
            <span>3. แนบหลักฐานสำเนาบัตรประชาชน / เอกสารยืนยันตัวตน</span>
          </h3>
          <div class="form-group">
            <div class="file-upload-box" onclick="document.getElementById('reg-file-input').click()">
              <div style="font-size: 2rem; margin-bottom: 6px;"></div>
              <div style="font-weight: 600; color: #471764;">คลิกเพื่ออัปโหลดสำเนาบัตรประชาชน (รูปถ่ายหรือ PDF)</div>
              <div class="form-hint">รองรับไฟล์ JPG, PNG หรือ PDF ขนาดไม่เกิน 10MB</div>
              <input type="file" id="reg-file-input" accept="image/*,application/pdf" style="display: none;" onchange="previewUploadFile(this)">
            </div>
            <div id="file-preview-wrapper" style="display: none; text-align: center; margin-top: 10px;">
              <img id="file-preview-img" class="file-preview" src="" alt="ตัวอย่างสำเนาบัตรประชาชน">
              <div id="file-preview-name" style="font-size: 0.85rem; color: #059669; font-weight: 600; margin-top: 4px;"></div>
            </div>
          </div>
        </div>

        <!-- Part 4: Dormitory & Interactive Room Picker -->
        <div style="margin-bottom: 32px;">
          <h3 style="font-size: 1.1rem; font-weight: 700; color: #471764; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #f3ebf9; padding-bottom: 8px;">
            <span>4. เลือกหอพักและระบุห้องพัก/เตียงนอน</span>
          </h3>

          <div class="form-group">
            <label class="form-label required">เลือกหอพัก</label>
            <select id="reg-dorm-select" class="form-select" required onchange="handleRegDormSelect(this.value)">
              <option value="">-- กรุณาเลือกเพศก่อน --</option>
            </select>
          </div>

          <div id="reg-room-selector-mount" style="margin-top: 18px;">
            <div style="background: #f8fafc; border: 1px dashed #cbd5e1; padding: 30px; text-align: center; border-radius: 12px; color: #6b7280;">
               กรุณาเลือกหอพักด้านบนเพื่อเปิดผังห้องพักและเลือกเตียงนอน
            </div>
          </div>

          <div id="selected-room-banner" style="display: none; margin-top: 18px; background: #fffdf7; border: 2px solid #e5a93b; border-radius: 12px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-size: 0.8rem; color: #92400e; font-weight: 700; text-transform: uppercase;">ห้องพักและเตียงที่คุณเลือก :</div>
              <div id="selected-room-text" style="font-size: 1.15rem; font-weight: 700; color: #471764; margin-top: 2px;">-</div>
            </div>
            <div style="font-size: 1.5rem;"></div>
          </div>
        </div>

        <!-- Submit Button -->
        <div style="display: flex; gap: 16px; justify-content: flex-end; border-top: 1px solid #e5e7eb; padding-top: 24px;">
          <button type="button" class="btn btn-secondary" onclick="navigateTo('home')">ยกเลิก</button>
          <button type="submit" id="reg-submit-btn" class="btn btn-gold" style="min-width: 240px; font-size: 1rem;">
             ส่งใบสมัคร (สถานะ: รออนุมัติ)
          </button>
        </div>

      </form>
    </div>
  `;

  window.activeRoomSelector = new RoomSelector('reg-room-selector-mount', {
    onSelect: (roomData) => {
      selectedRegRoomData = roomData;
      const banner = document.getElementById('selected-room-banner');
      const text = document.getElementById('selected-room-text');
      if (banner && text) {
        banner.style.display = 'flex';
        text.textContent = `${roomData.dormitoryName} | ห้อง ${roomData.roomNumber} (ชั้น ${roomData.floor}) | เตียงที่ ${roomData.bedNumber}`;
      }
    }
  });
}

function handleRegGenderChange(gender) {
  const dormSelect = document.getElementById('reg-dorm-select');
  if (!dormSelect) return;

  const prefixSelect = document.getElementById('reg-prefix');
  if (prefixSelect) {
    if (gender === 'male') prefixSelect.value = 'นาย';
    if (gender === 'female') prefixSelect.value = 'นางสาว';
  }

  if (!gender) {
    dormSelect.innerHTML = '<option value="">-- กรุณาเลือกเพศก่อน --</option>';
    return;
  }

  const filteredDorms = AppState.dormitories.filter(d => d.gender === gender);
  let options = '<option value="">-- เลือกหอพัก --</option>';
  for (const d of filteredDorms) {
    options += `<option value="${d.id}">${d.name} (${d.gender === 'male' ? 'หอชาย' : 'หอหญิง'} - ว่าง ${d.available_beds} เตียง)</option>`;
  }
  dormSelect.innerHTML = options;

  if (filteredDorms.length > 0) {
    dormSelect.value = filteredDorms[0].id;
    handleRegDormSelect(filteredDorms[0].id);
  }
}

function handleRegDormSelect(dormId) {
  if (!dormId) return;
  selectedRegRoomData = null;
  const banner = document.getElementById('selected-room-banner');
  if (banner) banner.style.display = 'none';

  if (window.activeRoomSelector) {
    window.activeRoomSelector.loadDormitory(dormId);
  }
}

let uploadedFileBase64 = null;
async function previewUploadFile(input) {
  const file = input.files[0];
  if (!file) return;

  try {
    uploadedFileBase64 = await fileToBase64(file);
    const previewWrapper = document.getElementById('file-preview-wrapper');
    const previewImg = document.getElementById('file-preview-img');
    const previewName = document.getElementById('file-preview-name');

    if (file.type.startsWith('image/')) {
      previewImg.src = uploadedFileBase64;
      previewImg.style.display = 'block';
    } else {
      previewImg.style.display = 'none';
    }

    previewName.textContent = ` แนบไฟล์สำเร็จ: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    previewWrapper.style.display = 'block';
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการอ่านไฟล์', 'error');
  }
}

async function handleRegistrationSubmit(event) {
  event.preventDefault();

  if (!selectedRegRoomData || !selectedRegRoomData.roomId || !selectedRegRoomData.bedNumber) {
    showToast('กรุณาคลิกเลือกห้องพักและเตียงนอนที่ต้องการ', 'error');
    const mount = document.getElementById('reg-room-selector-mount');
    if (mount) mount.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const citizenId = document.getElementById('reg-citizen-id').value.trim();
  const password = document.getElementById('reg-password').value;

  const payload = {
    citizen_id: citizenId,
    password: password,
    prefix: document.getElementById('reg-prefix').value,
    first_name: document.getElementById('reg-firstname').value.trim(),
    last_name: document.getElementById('reg-lastname').value.trim(),
    gender: document.getElementById('reg-gender').value,
    phone: document.getElementById('reg-phone').value.trim(),
    email: document.getElementById('reg-email').value.trim(),
    faculty: document.getElementById('reg-faculty').value,
    major: document.getElementById('reg-major').value.trim(),
    disease: document.getElementById('reg-disease').value.trim(),
    address: document.getElementById('reg-address').value.trim(),
    province: document.getElementById('reg-province').value.trim(),
    parent_name: document.getElementById('reg-parent-name').value.trim(),
    parent_relation: document.getElementById('reg-parent-relation').value,
    parent_phone: document.getElementById('reg-parent-phone').value.trim(),
    emergency_contact: document.getElementById('reg-emergency').value.trim(),
    id_card_file: uploadedFileBase64,
    dormitory_id: parseInt(document.getElementById('reg-dorm-select').value, 10),
    room_id: selectedRegRoomData.roomId,
    bed_number: selectedRegRoomData.bedNumber
  };

  const btn = document.getElementById('reg-submit-btn');
  btn.disabled = true;
  btn.textContent = '⏳ กำลังส่งใบสมัคร...';

  try {
    const res = await API.submitApplication(payload);
    if (res.success) {
      showToast(res.message, 'success');
      const loginRes = await API.loginStudent(citizenId, password);
      if (loginRes.success) {
        AppState.loggedInStudent = loginRes.application;
        localStorage.setItem('sru_student_session', JSON.stringify(loginRes.application));
        updateUserStatusWidget();
      }
      navigateTo('manage');
    } else {
      showToast(res.message || 'ไม่สามารถสมัครได้', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = ' ส่งใบสมัคร (สถานะ: รออนุมัติ)';
  }
}

// =========================================================
// 3. MANAGE VIEW
// =========================================================
async function loadManageView() {
  const container = document.getElementById('view-manage');
  if (!container) return;

  if (AppState.loggedInStudent) {
    try {
      const res = await API.loginStudent(AppState.loggedInStudent.citizen_id, AppState.loggedInStudent.password);
      if (res.success) {
        AppState.loggedInStudent = res.application;
        localStorage.setItem('sru_student_session', JSON.stringify(res.application));
      }
    } catch (e) {}

    renderStudentManageDashboard(AppState.loggedInStudent);
  } else {
    renderStudentLoginForm();
  }
}

function renderStudentLoginForm() {
  const container = document.getElementById('view-manage');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 500px; margin: 40px auto; background: #ffffff; border-radius: 18px; border: 1px solid #e5e7eb; box-shadow: var(--shadow-md); overflow: hidden;">
      <div style="background: linear-gradient(135deg, #381250 0%, #521a75 100%); color: #ffffff; padding: 22px 24px; text-align: center;">
        <div style="font-size: 2.2rem; margin-bottom: 6px;"></div>
        <h3 style="font-size: 1.25rem; font-weight: 700;">ติดตามสถานะและตรวจสอบใบสมัคร</h3>
        <p style="font-size: 0.85rem; color: #d8b4fe; margin-top: 4px;">เข้าสู่ระบบด้วยเลขบัตรประชาชน 13 หลักและรหัสผ่านที่คุณสร้างไว้</p>
      </div>

      <form onsubmit="handleStudentLogin(event)" style="padding: 28px;">
        <div class="form-group">
          <label class="form-label required">เลขประจำตัวประชาชน (13 หลัก)</label>
          <input type="text" id="login-citizen-id" class="form-input" maxlength="13" pattern="[0-9]{13}" placeholder="เลขบัตร ปชช. 13 หลัก" required>
        </div>
        <div class="form-group">
          <label class="form-label required">รหัสผ่าน (Password)</label>
          <input type="password" id="login-password" class="form-input" placeholder="รหัสผ่านที่กำหนดตอนสมัคร" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block" style="margin-top: 20px;">
           เข้าสู่ระบบตรวจสอบข้อมูล
        </button>
        <div style="text-align: center; margin-top: 16px; font-size: 0.85rem; color: #6b7280;">
          ยังไม่ได้ส่งใบสมัคร? <a href="javascript:void(0)" onclick="navigateTo('register')" style="color: #471764; font-weight: 700;">สมัครเข้าหอในที่นี่</a>
        </div>
      </form>
    </div>
  `;
}

async function handleStudentLogin(event) {
  event.preventDefault();
  const citizenId = document.getElementById('login-citizen-id').value.trim();
  const password = document.getElementById('login-password').value;

  if (AppState.lockoutUntil && Date.now() < AppState.lockoutUntil) {
    const waitSec = Math.ceil((AppState.lockoutUntil - Date.now()) / 1000);
    showToast(`ระบบถูกระงับชั่วคราวเนื่องจากใส่รหัสผิดหลายครั้ง กรุณารออีก ${waitSec} วินาที`, 'error');
    return;
  }

  try {
    const res = await API.loginStudent(citizenId, password);
    if (res.success) {
      AppState.loginFailCount = 0;
      AppState.loggedInStudent = res.application;
      localStorage.setItem('sru_student_session', JSON.stringify(res.application));
      updateUserStatusWidget();
      showToast('เข้าสู่ระบบสำเร็จ!', 'success');
      renderStudentManageDashboard(res.application);
    } else {
      AppState.loginFailCount += 1;
      if (AppState.loginFailCount >= 5) {
        AppState.lockoutUntil = Date.now() + 300000;
        showToast('ใส่รหัสผ่านผิดเกิน 5 ครั้ง ระบบถูกล็อกชั่วคราว 5 นาที', 'error');
      } else {
        showToast(res.message || `รหัสผ่านไม่ถูกต้อง (ผิดครั้งที่ ${AppState.loginFailCount}/5)`, 'error');
      }
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการเข้าสู่ระบบ', 'error');
  }
}

function renderStudentManageDashboard(st) {
  const container = document.getElementById('view-manage');
  if (!container) return;

  const isApproved = st.status === 'approved';

  container.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto;">
      
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
        <h2 style="font-size:1.3rem; font-weight:700; color:#471764;"> ข้อมูลใบสมัครและการจองห้องพักของคุณ</h2>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary btn-sm" onclick="printApplicationSlip()">
            ️ พิมพ์ใบสมัคร
          </button>
          <button class="btn btn-primary btn-sm" onclick="openEditApplicationModal()">
            ️ แก้ไขข้อมูล / ย้ายห้อง
          </button>
          <button class="btn btn-danger btn-sm" onclick="confirmCancelApplication()">
            ️ ยกเลิกการสมัคร
          </button>
        </div>
      </div>

      <div class="sru-profile-banner" style="margin-bottom:24px;">
        <div class="profile-banner-header" style="background: ${isApproved ? 'linear-gradient(90deg, #164e63 0%, #047857 100%)' : 'linear-gradient(90deg, #381250 0%, #521a75 100%)'};">
          <div class="profile-banner-header-left">
            <span class="profile-status-indicator" style="background: ${isApproved ? '#10b981' : '#f59e0b'};"></span>
            <span>สถานะใบสมัคร : ${isApproved ? ' ได้รับการอนุมัติแล้ว (เป็นสมาชิกหอพัก)' : '⏳ รอการตรวจสอบและอนุมัติจากผู้ดูแลระบบ'}</span>
          </div>
          <span>ยื่นสมัครเมื่อ: ${st.applied_at || '-'}</span>
        </div>
        <div class="profile-banner-body">
          <div class="info-row">
            <div class="info-label">ชื่อ - สกุล :</div>
            <div class="info-val">${st.prefix} ${st.first_name} ${st.last_name}</div>
          </div>
          <div class="info-row">
            <div class="info-label">เลขบัตรประชาชน :</div>
            <div class="info-val">${st.citizen_id.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5')}</div>
          </div>
          <div class="info-row">
            <div class="info-label">หอพักที่เลือก :</div>
            <div class="info-val highlight">${st.dormitory_name}</div>
          </div>
          <div class="info-row">
            <div class="info-label">ห้องพัก / เตียง :</div>
            <div class="info-val highlight">ห้อง ${st.room_number} (ชั้น ${st.floor}) | เตียงที่ ${st.bed_number}</div>
          </div>
          <div class="info-row">
            <div class="info-label">คณะ / สาขาวิชา :</div>
            <div class="info-val">${st.faculty} (${st.major})</div>
          </div>
          <div class="info-row">
            <div class="info-label">เบอร์โทรศัพท์ :</div>
            <div class="info-val">${st.phone}</div>
          </div>
          <div class="info-row">
            <div class="info-label">ผู้ปกครอง :</div>
            <div class="info-val">${st.parent_name || '-'} (${st.parent_relation || '-'}) โทร. ${st.parent_phone || '-'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">เอกสารสำเนาบัตร :</div>
            <div class="info-val">
              ${st.id_card_file ? `<a href="${st.id_card_file}" target="_blank" style="color:#3b82f6; text-decoration:underline;"> ดูเอกสารที่แนบไว้</a>` : '<span style="color:#ef4444;">ยังไม่ได้แนบ</span>'}
            </div>
          </div>
        </div>
      </div>

      ${isApproved ? `
        <div style="background:#ecfdf5; border:1px solid #10b981; border-radius:14px; padding:18px 24px; margin-bottom:20px; color:#065f46;">
          <h4 style="font-weight:700; font-size:1rem; margin-bottom:4px;"> ยินดีด้วย! ใบสมัครของคุณได้รับการอนุมัติเรียบร้อยแล้ว</h4>
          <p style="font-size:0.85rem;">ท่านสามารถใช้งานระบบเช็คกิจกรรมและสะสมคะแนน 80 แต้มได้ที่เมนู "เช็คกิจกรรม & คะแนนหอ"</p>
        </div>
      ` : `
        <div style="background:#fffbeb; border:1px solid #f59e0b; border-radius:14px; padding:18px 24px; margin-bottom:20px; color:#92400e;">
          <h4 style="font-weight:700; font-size:1rem; margin-bottom:4px;">⏳ ใบสมัครของคุณอยู่ระหว่างรอการอนุมัติ</h4>
          <p style="font-size:0.85rem;">เมื่อผู้ดูแลระบบทำการตรวจสอบและอนุมัติแล้ว และถึงวันประกาศรายชื่อ ข้อมูลจะปรากฏในหน้าประกาศรายชื่อผู้มีสิทธิ์เข้าพัก และท่านจะสามารถใช้งานระบบกิจกรรมหอพักได้</p>
        </div>
      `}

    </div>
  `;
}

// Edit Application Modal
let selectedEditRoomData = null;

async function openEditApplicationModal() {
  const st = AppState.loggedInStudent;
  if (!st) return;

  const modal = document.getElementById('generic-modal');
  const modalTitle = document.getElementById('generic-modal-title');
  const modalBody = document.getElementById('generic-modal-body');

  modalTitle.textContent = '️ แก้ไขข้อมูลการสมัคร / เปลี่ยนห้องพัก';
  modalBody.innerHTML = `
    <form id="edit-app-form" onsubmit="handleEditApplicationSubmit(event)">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">คำนำหน้า</label>
          <select id="edit-prefix" class="form-select">
            <option value="นาย" ${st.prefix === 'นาย' ? 'selected' : ''}>นาย</option>
            <option value="นางสาว" ${st.prefix === 'นางสาว' ? 'selected' : ''}>นางสาว</option>
            <option value="นาง" ${st.prefix === 'นาง' ? 'selected' : ''}>นาง</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">ชื่อ</label>
          <input type="text" id="edit-firstname" class="form-input" value="${st.first_name}" required>
        </div>
        <div class="form-group">
          <label class="form-label required">นามสกุล</label>
          <input type="text" id="edit-lastname" class="form-input" value="${st.last_name}" required>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">เบอร์โทรศัพท์</label>
          <input type="tel" id="edit-phone" class="form-input" value="${st.phone}" required>
        </div>
        <div class="form-group">
          <label class="form-label">อีเมล</label>
          <input type="email" id="edit-email" class="form-input" value="${st.email || ''}">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">คณะ</label>
          <input type="text" id="edit-faculty" class="form-input" value="${st.faculty || ''}" required>
        </div>
        <div class="form-group">
          <label class="form-label required">สาขาวิชา</label>
          <input type="text" id="edit-major" class="form-input" value="${st.major || ''}" required>
        </div>
      </div>

      <div style="margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
        <h4 style="font-size: 1rem; font-weight: 700; color: #471764; margin-bottom: 12px;"> เปลี่ยนห้องพัก / หอพัก (เพศ ${st.gender === 'male' ? 'ชาย' : 'หญิง'})</h4>
        
        <div class="form-group">
          <label class="form-label">เลือกหอพัก</label>
          <select id="edit-dorm-select" class="form-select" onchange="handleEditDormSelect(this.value)">
            ${AppState.dormitories.filter(d => d.gender === st.gender).map(d => `<option value="${d.id}" ${d.id === st.dormitory_id ? 'selected' : ''}>${d.name}</option>`).join('')}
          </select>
        </div>

        <div id="edit-room-selector-mount" style="margin-top: 14px;"></div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px;">
        <button type="button" class="btn btn-secondary" onclick="closeGenericModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-gold"> บันทึกการเปลี่ยนแปลง</button>
      </div>
    </form>
  `;

  modal.classList.add('active');

  selectedEditRoomData = {
    dormitoryId: st.dormitory_id,
    roomId: st.room_id,
    bedNumber: st.bed_number
  };

  window.activeRoomSelector = new RoomSelector('edit-room-selector-mount', {
    dormitoryId: st.dormitory_id,
    selectedRoomId: st.room_id,
    selectedBed: st.bed_number,
    onSelect: (data) => {
      selectedEditRoomData = data;
    }
  });

  window.activeRoomSelector.loadDormitory(st.dormitory_id, st.room_id, st.bed_number);
}

function handleEditDormSelect(dormId) {
  if (window.activeRoomSelector) {
    window.activeRoomSelector.loadDormitory(dormId);
  }
}

async function handleEditApplicationSubmit(event) {
  event.preventDefault();
  const st = AppState.loggedInStudent;
  if (!st) return;

  const payload = {
    citizen_id: st.citizen_id,
    password: st.password,
    prefix: document.getElementById('edit-prefix').value,
    first_name: document.getElementById('edit-firstname').value.trim(),
    last_name: document.getElementById('edit-lastname').value.trim(),
    phone: document.getElementById('edit-phone').value.trim(),
    email: document.getElementById('edit-email').value.trim(),
    faculty: document.getElementById('edit-faculty').value.trim(),
    major: document.getElementById('edit-major').value.trim(),
    dormitory_id: selectedEditRoomData ? selectedEditRoomData.dormitoryId : st.dormitory_id,
    room_id: selectedEditRoomData ? selectedEditRoomData.roomId : st.room_id,
    bed_number: selectedEditRoomData ? selectedEditRoomData.bedNumber : st.bed_number
  };

  try {
    const res = await API.updateApplication(payload);
    if (res.success) {
      showToast(res.message, 'success');
      closeGenericModal();
      const refresh = await API.loginStudent(st.citizen_id, st.password);
      if (refresh.success) {
        AppState.loggedInStudent = refresh.application;
        localStorage.setItem('sru_student_session', JSON.stringify(refresh.application));
        updateUserStatusWidget();
        renderStudentManageDashboard(refresh.application);
      }
    } else {
      showToast(res.message || 'ไม่สามารถอัปเดตได้', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
  }
}

async function confirmCancelApplication() {
  const st = AppState.loggedInStudent;
  if (!st) return;

  if (!confirm(`️ คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการสมัครเข้าหอพัก?\n\nสิทธิ์การจองห้องพัก ${st.dormitory_name} ห้อง ${st.room_number} เตียง ${st.bed_number} จะถูกคืนให้ระบบทันที`)) {
    return;
  }

  try {
    const res = await API.deleteApplication(st.citizen_id, st.password);
    if (res.success) {
      showToast(res.message, 'success');
      logoutUser();
    } else {
      showToast(res.message || 'ไม่สามารถยกเลิกได้', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการยกเลิก', 'error');
  }
}

function printApplicationSlip() {
  const st = AppState.loggedInStudent;
  if (!st) return;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ใบสมัครเข้าพักในหอพักนักศึกษา - มหาวิทยาลัยราชภัฏสุรินทร์</title>
      <style>
        body { font-family: 'Sarabun', sans-serif; padding: 40px; color: #111; line-height: 1.6; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .title { font-size: 20px; font-weight: bold; }
        .subtitle { font-size: 15px; margin-top: 5px; }
        .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .table td { padding: 8px 12px; border: 1px solid #ccc; font-size: 14px; }
        .table td.label { font-weight: bold; width: 35%; background: #f5f5f5; }
        .footer { margin-top: 50px; display: flex; justify-content: space-between; }
        .signature { text-align: center; width: 220px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header">
        <div class="title">มหาวิทยาลัยราชภัฏสุรินทร์</div>
        <div class="subtitle">ใบสมัครและจองห้องพักในหอพักนักศึกษา (ภาคการศึกษาที่ 1/2569)</div>
      </div>
      <table class="table">
        <tr><td class="label">ชื่อ - นามสกุล :</td><td>${st.prefix} ${st.first_name} ${st.last_name}</td></tr>
        <tr><td class="label">เลขประจำตัวประชาชน :</td><td>${st.citizen_id}</td></tr>
        <tr><td class="label">คณะ / สาขาวิชา :</td><td>${st.faculty} (${st.major})</td></tr>
        <tr><td class="label">เบอร์โทรศัพท์ :</td><td>${st.phone}</td></tr>
        <tr><td class="label">หอพักที่ระบุ :</td><td><strong>${st.dormitory_name}</strong></td></tr>
        <tr><td class="label">ห้องพัก / ชั้น / เตียง :</td><td><strong>ห้อง ${st.room_number} (ชั้น ${st.floor}) เตียงที่ ${st.bed_number}</strong></td></tr>
        <tr><td class="label">สถานะใบสมัคร :</td><td>${st.status === 'approved' ? 'ผ่านการอนุมัติแล้ว' : 'รอการตรวจสอบและอนุมัติจากผู้ดูแลระบบ'}</td></tr>
        <tr><td class="label">วันที่ยื่นสมัคร :</td><td>${st.applied_at || new Date().toLocaleString('th-TH')}</td></tr>
      </table>
      <div class="footer">
        <div class="signature">
          <br><br>
          (......................................................)<br>
          ลงชื่อนักศึกษาผู้สมัคร
        </div>
        <div class="signature">
          <br><br>
          (......................................................)<br>
          ผู้ดูแลระบบหอพัก
        </div>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// =========================================================
// 4. PUBLIC DIRECTORY
// =========================================================
async function loadDirectoryData() {
  const container = document.getElementById('view-directory');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 1000px; margin: 0 auto;">
      <div class="section-heading">
        <div>
          <h2 class="section-title"> รายชื่อผู้สมัครเข้าหอพัก (กำลังรอการอนุมัติ)</h2>
          <p style="font-size:0.85rem; color:#6b7280; margin-top:2px;">
            แสดงเฉพาะรายชื่อผู้ที่กำลังยื่นสมัครเข้าหอในในรอบปัจจุบัน (เมื่อถึงวันประกาศรายชื่อ ข้อมูลจะถูกย้ายไปที่เมนูประกาศรายชื่อ)
          </p>
        </div>
      </div>

      <div class="data-table-card">
        <div class="data-table-header">
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <select id="dir-dorm-filter" class="form-select" style="width:220px;" onchange="filterDirectoryList()">
              <option value="all">ทุกหอพัก (ทั้งหมด)</option>
              <option value="1">หอพักชายผกากรอง</option>
              <option value="2">หอพักหญิงแสงจันทร์</option>
              <option value="3">หอพักหญิงบานชื่น</option>
              <option value="4">หอพักหญิงดาวเรือง</option>
              <option value="5">หอพักหญิงเฟื่องฟ้า</option>
            </select>
            <input type="text" id="dir-search-input" class="form-input" style="width:240px;" placeholder=" ค้นหาชื่อ หรือ ห้อง..." oninput="filterDirectoryList()">
          </div>
          <div id="dir-count-tag" style="font-size:0.88rem; color:#6b7280; font-weight:600;">
            กำลังโหลดข้อมูล...
          </div>
        </div>

        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>ชื่อ - นามสกุล</th>
                <th>คณะ / สาขาวิชา</th>
                <th>หอพักที่สมัคร</th>
                <th>ห้องพัก / เตียง</th>
                <th>สถานะ</th>
                <th>วันที่ยื่นสมัคร</th>
              </tr>
            </thead>
            <tbody id="dir-table-body">
              <tr><td colspan="7" style="text-align:center; padding:30px;">⏳ กำลังโหลด...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  filterDirectoryList();
}

async function filterDirectoryList() {
  const dormId = document.getElementById('dir-dorm-filter')?.value || 'all';
  const search = document.getElementById('dir-search-input')?.value || '';
  const tbody = document.getElementById('dir-table-body');
  const countTag = document.getElementById('dir-count-tag');
  if (!tbody) return;

  try {
    const res = await API.getPublicList(dormId, search);
    if (res.is_announced) {
      if (countTag) countTag.textContent = 'ประกาศผลรายชื่อรอบนี้เรียบร้อยแล้ว';
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:45px; color:#471764;">
            <div style="font-size: 2rem; margin-bottom:8px;"></div>
            <div style="font-size:1.05rem; font-weight:700;">การรับสมัครรอบนี้ได้ประกาศผลรายชื่อเรียบร้อยแล้ว</div>
            <div style="color:#6b7280; font-size:0.85rem; margin-top:4px;">รายชื่อผู้ผ่านการคัดเลือกได้ถูกย้ายไปที่เมนู "ประกาศรายชื่อผู้มีสิทธิ์" แล้ว เพื่อรอรับรายชื่อผู้สมัครในรอบถัดไป</div>
            <button class="btn btn-primary btn-sm" style="margin-top:14px;" onclick="navigateTo('announcements')">ไปที่หน้าประกาศรายชื่อ </button>
          </td>
        </tr>
      `;
      return;
    }

    if (res.applicants) {
      if (countTag) countTag.textContent = `พบผู้สมัครรอการอนุมัติ ${res.applicants.length} คน`;

      if (res.applicants.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#9ca3af;">ยังไม่มีผู้สมัครที่อยู่ระหว่างรอการอนุมัติในขณะนี้</td></tr>`;
        return;
      }

      tbody.innerHTML = res.applicants.map((a, index) => `
        <tr>
          <td>${index + 1}</td>
          <td style="font-weight:600; color:#1e293b;">${a.prefix} ${a.first_name} ${a.last_name}</td>
          <td style="font-size:0.85rem; color:#4b5563;">${a.faculty || '-'} (${a.major || '-'})</td>
          <td><span style="font-weight:600; color:#471764;">${a.dormitory_name}</span></td>
          <td><span style="background:#f3ebf9; color:#471764; padding:3px 8px; border-radius:6px; font-weight:700; font-size:0.82rem;">ห้อง ${a.room_number} (เตียง ${a.bed_number})</span></td>
          <td><span class="status-badge pending">⏳ รอการอนุมัติ</span></td>
          <td style="font-size:0.8rem; color:#6b7280;">${a.applied_at ? a.applied_at.substring(0, 10) : '-'}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:30px;">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
  }
}

// =========================================================
// 5. OFFICIAL ANNOUNCEMENTS VIEW
// =========================================================
async function loadAnnouncementsData() {
  const container = document.getElementById('view-announcements');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 1000px; margin: 0 auto;">
      <div style="background:linear-gradient(135deg, #1b0729 0%, #3b1252 100%); color:#ffffff; padding:28px 32px; border-radius:18px; margin-bottom:24px; box-shadow:var(--shadow-md);">
        <div style="font-size:0.85rem; color:#e5a93b; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px;">ประกาศผลอย่างเป็นทางการ</div>
        <h2 style="font-size:1.45rem; font-weight:700; line-height:1.3;"> ประกาศรายชื่อผู้มีสิทธิ์เข้าพักในหอพักนักศึกษา มรภ.สุรินทร์</h2>
        <p style="font-size:0.9rem; color:#e2d4ec; margin-top:6px;">ประจำภาคการศึกษาที่ 1/2569 (แสดงเฉพาะผู้ที่ผ่านการอนุมัติแล้ว)</p>
      </div>

      <div class="data-table-card">
        <div class="data-table-header">
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <select id="announce-dorm-filter" class="form-select" style="width:220px;" onchange="filterAnnounceList()">
              <option value="all">ทุกหอพัก</option>
              <option value="1">หอพักชายผกากรอง</option>
              <option value="2">หอพักหญิงแสงจันทร์</option>
              <option value="3">หอพักหญิงบานชื่น</option>
              <option value="4">หอพักหญิงดาวเรือง</option>
              <option value="5">หอพักหญิงเฟื่องฟ้า</option>
            </select>
            <input type="text" id="announce-search-input" class="form-input" style="width:240px;" placeholder=" ค้นหาชื่อ-นามสกุล..." oninput="filterAnnounceList()">
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.print()">
            ️ พิมพ์ประกาศ
          </button>
        </div>

        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>ชื่อ - นามสกุล</th>
                <th>คณะ</th>
                <th>หอพัก</th>
                <th>ห้องพัก</th>
                <th>เตียง</th>
                <th>ผลการคัดเลือก</th>
              </tr>
            </thead>
            <tbody id="announce-table-body">
              <tr><td colspan="7" style="text-align:center; padding:30px;">⏳ กำลังโหลดประกาศ...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  filterAnnounceList();
}

async function filterAnnounceList() {
  const dormId = document.getElementById('announce-dorm-filter')?.value || 'all';
  const search = document.getElementById('announce-search-input')?.value || '';
  const tbody = document.getElementById('announce-table-body');
  if (!tbody) return;

  try {
    const res = await API.getAnnouncementList(dormId, search);
    if (!res.is_open) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:50px; color:#d97706;">
            <div style="font-size:2.2rem; margin-bottom:8px;"></div>
            <div style="font-size:1.1rem; font-weight:700;">${res.message}</div>
            <div style="font-size:0.85rem; color:#6b7280; margin-top:4px;">รายชื่อผู้ผ่านการอนุมัติจะเปิดเผยในหน้านี้ตามกำหนดการประกาศผล</div>
          </td>
        </tr>
      `;
      return;
    }

    if (res.list && res.list.length > 0) {
      tbody.innerHTML = res.list.map((a, index) => `
        <tr>
          <td>${index + 1}</td>
          <td style="font-weight:700; color:#1e293b;">${a.prefix} ${a.first_name} ${a.last_name}</td>
          <td>${a.faculty || '-'}</td>
          <td><span style="font-weight:600; color:#471764;">${a.dormitory_name}</span></td>
          <td><span style="font-weight:700;">ห้อง ${a.room_number}</span> (ชั้น ${a.floor})</td>
          <td>เตียง ${a.bed_number}</td>
          <td><span class="status-badge approved"> ผ่านการคัดเลือก</span></td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px; color:#9ca3af;">ยังไม่มีรายชื่อผู้ผ่านการคัดเลือกในระบบ</td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:30px;">เกิดข้อผิดพลาด</td></tr>`;
  }
}

// =========================================================
// 6. RESIDENT PROFILE VIEW (สำหรับนักศึกษา & แอดมินตรวจสอบแต่ละหอ)
// =========================================================
let currentAdminDormInspectorId = 1;
let currentAdminDormFloorFilter = 'all';

async function loadResidentProfileView() {
  const container = document.getElementById('view-resident');
  if (!container) return;

  // 1. If Admin is logged in, show Admin Dorm Residents Inspector
  if (AppState.loggedInAdmin) {
    await renderAdminDormResidentsInspector(currentAdminDormInspectorId, currentAdminDormFloorFilter);
    return;
  }

  // 2. If no student logged in
  if (!AppState.loggedInStudent) {
    container.innerHTML = `
      <div style="max-width: 600px; margin: 40px auto; background:#ffffff; border-radius:18px; border:1px solid #e5e7eb; padding:36px; text-align:center; box-shadow:var(--shadow-md);">
        <div style="font-size:3rem; margin-bottom:10px;"></div>
        <h3 style="font-size:1.3rem; font-weight:700; color:#471764; margin-bottom:8px;">เข้าสู่ระบบสมาชิกหอพัก</h3>
        <p style="font-size:0.88rem; color:#6b7280; margin-bottom:20px;">
          หน้านี้สำหรับนักศึกษาที่ได้รับการอนุมัติเข้าพักในหอพักแล้ว หรือผู้ดูแลระบบเพื่อตรวจสอบรายชื่อสมาชิก
        </p>
        <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="openLoginModal()">
             เข้าสู่ระบบนักศึกษา
          </button>
          <button class="btn btn-secondary" onclick="openAdminLoginModal()">
             เข้าสู่ระบบผู้ดูแลระบบ (Admin)
          </button>
        </div>
      </div>
    `;
    return;
  }

  // 3. Student Logged in
  const st = AppState.loggedInStudent;
  if (st.status !== 'approved') {
    container.innerHTML = `
      <div style="max-width: 650px; margin: 40px auto; background:#fffdf7; border:2px solid #f59e0b; border-radius:18px; padding:36px; text-align:center; box-shadow:var(--shadow-md);">
        <div style="font-size:3rem; margin-bottom:10px;">⏳</div>
        <h3 style="font-size:1.3rem; font-weight:700; color:#92400e; margin-bottom:8px;">ยังไม่พบข้อมูลสมาชิกหอพักที่ได้รับการอนุมัติ</h3>
        <p style="font-size:0.9rem; color:#78350f; line-height:1.6; margin-bottom:20px;">
          ใบสมัครของคุณ <strong>(${st.prefix} ${st.first_name} ${st.last_name})</strong> อยู่ระหว่างรอการตรวจสอบและอนุมัติจากผู้ดูแลระบบ จึงยังไม่สามารถเข้าถึงหน้าข้อมูลสมาชิกหอพักได้จนกว่าจะได้รับการอนุมัติอย่างเป็นทางการ
        </p>
        <button class="btn btn-primary" onclick="navigateTo('manage')">
           ไปที่หน้าติดตามสถานะใบสมัคร
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
        <div>
          <h2 style="font-size:1.35rem; font-weight:700; color:#471764;"> ข้อมูลสมาชิกหอพักของฉัน</h2>
          <p style="font-size:0.85rem; color:#6b7280;">ท่านสามารถตรวจสอบและแก้ไขข้อมูลส่วนตัวเพื่อการติดต่อของหอพักได้</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="openEditApplicationModal()">
          ️ แก้ไขข้อมูลส่วนตัว
        </button>
      </div>

      <div class="sru-profile-banner" style="margin-bottom:24px;">
        <div class="profile-banner-header" style="background: linear-gradient(90deg, #164e63 0%, #047857 100%);">
          <div class="profile-banner-header-left">
            <span class="profile-status-indicator" style="background:#10b981;"></span>
            <span>สถานะ: สมาชิกหอพัก มรภ.สุรินทร์ (ผ่านการจัดสรรแล้ว)</span>
          </div>
          <span>ภาคเรียนที่ 1/2569</span>
        </div>
        <div class="profile-banner-body">
          <div class="info-row">
            <div class="info-label">ชื่อ - สกุล :</div>
            <div class="info-val">${st.prefix} ${st.first_name} ${st.last_name}</div>
          </div>
          <div class="info-row">
            <div class="info-label">เลขบัตรประชาชน :</div>
            <div class="info-val">${st.citizen_id.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, '$1-$2-$3-$4-$5')}</div>
          </div>
          <div class="info-row">
            <div class="info-label">หอพักประจำ :</div>
            <div class="info-val highlight">${st.dormitory_name}</div>
          </div>
          <div class="info-row">
            <div class="info-label">ห้องพัก / เตียง :</div>
            <div class="info-val highlight">ห้อง ${st.room_number} (ชั้น ${st.floor}) | เตียงที่ ${st.bed_number}</div>
          </div>
          <div class="info-row">
            <div class="info-label">คณะ / สาขาวิชา :</div>
            <div class="info-val">${st.faculty} (${st.major})</div>
          </div>
          <div class="info-row">
            <div class="info-label">เบอร์โทรศัพท์ :</div>
            <div class="info-val">${st.phone}</div>
          </div>
          <div class="info-row">
            <div class="info-label">ผู้ปกครอง :</div>
            <div class="info-val">${st.parent_name || '-'} (${st.parent_relation || '-'}) โทร. ${st.parent_phone || '-'}</div>
          </div>
          <div class="info-row">
            <div class="info-label">กิจกรรมหอพัก :</div>
            <div class="info-val">
              <a href="javascript:void(0)" onclick="navigateTo('activities')" style="color:#059669; font-weight:700; text-decoration:underline;">
                เช็คกิจกรรมและสะสมคะแนน (เต็ม 100 แต้ม) 
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Admin Dorm Residents Inspector
async function renderAdminDormResidentsInspector(dormId = 1, floorFilter = 'all') {
  currentAdminDormInspectorId = dormId;
  currentAdminDormFloorFilter = floorFilter;

  const container = document.getElementById('view-resident');
  if (!container) return;

  const dormList = [
    { id: 1, name: 'หอพักชายผกากรอง', gender: 'male', icon: '', desc: 'หอพักนักศึกษาชาย (ชั้น A, B)' },
    { id: 2, name: 'หอพักหญิงแสงจันทร์', gender: 'female', icon: '', desc: 'หอพักนักศึกษาหญิง (ชั้น A, B)' },
    { id: 3, name: 'หอพักหญิงบานชื่น', gender: 'female', icon: '', desc: 'หอพักนักศึกษาหญิง (ชั้น A, B)' },
    { id: 4, name: 'หอพักหญิงดาวเรือง', gender: 'female', icon: '', desc: 'หอพักนักศึกษาหญิง (ชั้น A, B)' },
    { id: 5, name: 'หอพักหญิงเฟื่องฟ้า', gender: 'female', icon: '', desc: 'หอพักนักศึกษาหญิง (ชั้น A, B)' }
  ];

  const res = await API.getAdminDormResidents(dormId);
  const dorm = res.success ? res.dormitory : dormList.find(d => d.id === dormId);
  const rooms = res.success ? res.rooms : [];
  const residents = res.success ? res.residents : [];

  // Group residents by room_id
  const residentsByRoom = {};
  for (const r of residents) {
    if (!residentsByRoom[r.room_number]) {
      residentsByRoom[r.room_number] = [];
    }
    residentsByRoom[r.room_number].push(r);
  }

  // Filter rooms by floor
  const filteredRooms = floorFilter === 'all' 
    ? rooms 
    : rooms.filter(rm => rm.floor === floorFilter);

  const totalCapacity = rooms.reduce((acc, rm) => acc + (rm.max_capacity || 4), 0);
  const totalOccupied = residents.length;
  const passedActCount = residents.filter(r => (r.activity_points || 0) >= 80).length;

  container.innerHTML = `
    <div style="max-width: 1100px; margin: 0 auto;">
      
      <!-- Admin Header Banner -->
      <div style="background: linear-gradient(135deg, #2c0e3e 0%, #471764 100%); color:#ffffff; border-radius:18px; padding:24px; box-shadow:var(--shadow-md); margin-bottom:24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="display:inline-flex; align-items:center; gap:6px; background:rgba(229,169,59,0.25); color:#e5a93b; padding:4px 12px; border-radius:20px; font-size:0.82rem; font-weight:700; margin-bottom:8px;">
               ผู้ดูแลระบบ (Admin Mode)
            </div>
            <h2 style="font-size:1.45rem; font-weight:700; margin-bottom:4px;"> ตรวจสอบรายชื่อสมาชิกและผังห้องพักรายหอ</h2>
            <p style="font-size:0.88rem; color:#d1b8e8;">เลือกหอพักเพื่อตรวจสอบข้อมูลสมาชิกแต่ละห้อง เตียง และคะแนนกิจกรรมของทุกคน</p>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-gold btn-sm" onclick="navigateTo('admin')">
              ️ ไปที่ศูนย์ควบคุมแอดมิน
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.print()" style="background:rgba(255,255,255,0.15); color:#fff; border:none;">
              ️ พิมพ์ผังหอพัก
            </button>
          </div>
        </div>

        <!-- 5 Dorm Selection Tabs -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-top:20px;">
          ${dormList.map(d => `
            <button onclick="renderAdminDormResidentsInspector(${d.id}, '${floorFilter}')" 
              style="background:${d.id === dormId ? 'linear-gradient(135deg, #e5a93b, #c98e26)' : 'rgba(255,255,255,0.1)'}; 
                     color:${d.id === dormId ? '#1a0525' : '#ffffff'}; 
                     border:1px solid ${d.id === dormId ? '#e5a93b' : 'rgba(255,255,255,0.15)'}; 
                     padding:10px 14px; border-radius:12px; text-align:left; cursor:pointer; font-weight:700; transition:all 0.2s;">
              <div style="font-size:0.8rem; opacity:0.85;">${d.icon} ${d.gender === 'male' ? 'หอพักชาย' : 'หอพักหญิง'}</div>
              <div style="font-size:0.95rem;">${d.name}</div>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Dorm Summary & Filter Bar -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:20px; background:#ffffff; padding:16px 20px; border-radius:14px; border:1px solid #e5e7eb; box-shadow:var(--shadow-sm);">
        <div>
          <span style="font-size:1.15rem; font-weight:700; color:#471764;">${dorm.name}</span>
          <span style="font-size:0.85rem; color:#6b7280; margin-left:12px;">
            เข้าพักแล้ว <strong>${totalOccupied}</strong> / ${totalCapacity} เตียง | 
            ผ่านกิจกรรม (≥80 แต้ม) <strong style="color:#059669;">${passedActCount}</strong> คน
          </span>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <label style="font-size:0.85rem; font-weight:600; color:#4b5563;">เลือกชั้น:</label>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm ${floorFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="renderAdminDormResidentsInspector(${dormId}, 'all')">ทุกชั้น</button>
            <button class="btn btn-sm ${floorFilter === 'A' ? 'btn-primary' : 'btn-secondary'}" onclick="renderAdminDormResidentsInspector(${dormId}, 'A')">ชั้น A (ชั้น 1)</button>
            <button class="btn btn-sm ${floorFilter === 'B' ? 'btn-primary' : 'btn-secondary'}" onclick="renderAdminDormResidentsInspector(${dormId}, 'B')">ชั้น B (ชั้น 2)</button>
          </div>
        </div>
      </div>

      <!-- Room Cards Grid -->
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:18px;">
        ${filteredRooms.map(rm => {
          const occList = residentsByRoom[rm.room_number] || [];
          const isFull = occList.length >= rm.max_capacity;

          return `
            <div style="background:#ffffff; border-radius:16px; border:1px solid #e5e7eb; box-shadow:var(--shadow-sm); overflow:hidden;">
              <div style="background:${isFull ? '#f3ebf9' : '#f8fafc'}; padding:12px 18px; border-bottom:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-weight:700; color:#471764; font-size:1.05rem;">
                   ห้อง ${rm.room_number} <span style="font-size:0.8rem; font-weight:500; color:#6b7280;">(ชั้น ${rm.floor})</span>
                </div>
                <span class="status-badge ${isFull ? 'approved' : 'pending'}" style="font-size:0.75rem;">
                  ${occList.length} / ${rm.max_capacity} คน
                </span>
              </div>

              <div style="padding:16px; display:flex; flex-direction:column; gap:10px;">
                ${Array.from({ length: rm.max_capacity }).map((_, idx) => {
                  const bedNum = idx + 1;
                  const occupant = occList.find(o => o.bed_number === bedNum);

                  if (occupant) {
                    const isPassed = (occupant.activity_points || 0) >= 80;
                    return `
                      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                          <div>
                            <span style="background:#471764; color:#fff; font-size:0.7rem; font-weight:700; padding:1px 6px; border-radius:4px; margin-right:4px;">เตียง ${bedNum}</span>
                            <span style="font-weight:700; color:#1e293b; font-size:0.88rem;">${occupant.prefix} ${occupant.first_name} ${occupant.last_name}</span>
                          </div>
                          <span style="font-size:0.72rem; font-weight:700; color:${isPassed ? '#059669' : '#d97706'}; background:${isPassed ? '#ecfdf5' : '#fef3c7'}; padding:2px 6px; border-radius:4px;">
                            ${occupant.activity_points || 0}/100 แต้ม
                          </span>
                        </div>
                        <div style="font-size:0.78rem; color:#64748b; margin-top:4px;">
                          ปชช: ${occupant.citizen_id} | โทร: ${occupant.phone}<br>
                          ${occupant.faculty || '-'} (${occupant.major || '-'})<br>
                          ผู้ปกครอง: ${occupant.parent_name || '-'} โทร. ${occupant.parent_phone || occupant.emergency_contact || '-'}
                        </div>
                      </div>
                    `;
                  } else {
                    return `
                      <div style="background:#ffffff; border:1px dashed #cbd5e1; border-radius:10px; padding:8px 12px; color:#94a3b8; font-size:0.8rem; display:flex; justify-content:space-between; align-items:center;">
                        <span>️ เตียง ${bedNum}</span>
                        <span>ว่าง</span>
                      </div>
                    `;
                  }
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>

    </div>
  `;
}

// =========================================================
// 7. ACTIVITY & 100-POINTS DASHBOARD (เกณฑ์ผ่าน 80 คะแนน)
// =========================================================
async function loadActivitiesView() {
  const container = document.getElementById('view-activities');
  if (!container) return;

  const actRes = await API.getActivities();
  if (actRes.success) {
    AppState.activities = actRes.activities;
  }

  if (AppState.loggedInStudent) {
    if (AppState.loggedInStudent.status !== 'approved') {
      container.innerHTML = `
        <div style="max-width: 650px; margin: 40px auto; background: #fffdf7; border: 2px solid #f59e0b; border-radius: 18px; padding: 36px; text-align: center; box-shadow: var(--shadow-md);">
          <div style="font-size: 3rem; margin-bottom: 12px;">⏳</div>
          <h3 style="font-size: 1.3rem; font-weight: 700; color: #92400e; margin-bottom: 8px;">ยังไม่สามารถเข้าใช้งานระบบกิจกรรมได้</h3>
          <p style="font-size: 0.9rem; color: #78350f; line-height: 1.6; margin-bottom: 20px;">
            ระบบเช็คกิจกรรมและสะสมคะแนนหอพัก (เต็ม 100 คะแนน เกณฑ์ผ่าน 80 แต้ม) สงวนสิทธิ์สำหรับ <strong>นักศึกษาที่ได้รับการอนุมัติและประกาศรายชื่อเข้าพักเป็นสมาชิกหอในแล้วเท่านั้น</strong><br><br>
            สถานะใบสมัครของคุณในปัจจุบัน: <span style="background:#fef3c7; color:#b45309; padding:3px 10px; border-radius:10px; font-weight:700;">อยู่ระหว่างรอการอนุมัติ</span>
          </p>
          <button class="btn btn-primary" onclick="navigateTo('manage')">
             ตรวจสอบสถานะใบสมัคร
          </button>
        </div>
      `;
      return;
    }

    renderStudentActivityDashboard(AppState.loggedInStudent);
  } else {
    renderActivityPublicView();
  }
}

function renderActivityPublicView() {
  const container = document.getElementById('view-activities');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto;">
      <div style="background: #ffffff; border-radius: 18px; border: 1px solid #e5e7eb; padding: 32px; box-shadow: var(--shadow-sm); text-align: center; margin-bottom: 28px;">
        <div style="font-size: 3rem; margin-bottom: 8px;"></div>
        <h2 style="font-size: 1.4rem; font-weight: 700; color: #471764;">ระบบเช็คกิจกรรมและสะสมคะแนนหอพักนักศึกษา</h2>
        <p style="color: #6b7280; max-width: 600px; margin: 8px auto 20px auto; font-size: 0.92rem;">
          คะแนนกิจกรรมรวมทั้งหมด <strong>100 คะแนนเต็ม</strong> (เกณฑ์ผ่านขั้นต่ำ <strong>80 คะแนน</strong> ต่อภาคการศึกษา)
        </p>
        <button class="btn btn-gold" onclick="openLoginModal()">
           เข้าสู่ระบบสมาชิกหอพักเพื่อเช็คกิจกรรม
        </button>
      </div>

      <div class="section-heading">
        <h3 class="section-title"> รายการกิจกรรมหอพัก ประจำภาคเรียนที่ 1/2569</h3>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
        ${AppState.activities.map(act => `
          <div style="background: #ffffff; border-radius: 14px; border: 1px solid #e5e7eb; padding: 20px; box-shadow: var(--shadow-sm);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
              <span style="font-size: 0.75rem; background: #f3ebf9; color: #471764; padding: 3px 10px; border-radius: 10px; font-weight: 600;">
                ${act.category === 'mandatory' ? 'กิจกรรมบังคับ' : (act.category === 'cleanliness' ? 'พัฒนาหอพัก' : 'กิจกรรมทั่วไป')}
              </span>
              <span style="font-size: 0.95rem; font-weight: 800; color: #d97706;">+${act.points} คะแนน</span>
            </div>
            <h4 style="font-size: 1.05rem; font-weight: 700; color: #1e293b; margin-bottom: 6px;">${act.title}</h4>
            <p style="font-size: 0.85rem; color: #6b7280; margin-bottom: 12px; line-height: 1.5;">${act.description}</p>
            <div style="font-size: 0.78rem; color: #4b5563;">
              ️ วันที่จัด: ${act.event_date || '-'}<br>
              ⏰ กำหนดส่ง: ${act.deadline || '-'}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function renderStudentActivityDashboard(st) {
  const container = document.getElementById('view-activities');
  if (!container) return;

  try {
    const res = await API.getMyPoints(st.citizen_id);
    if (!res.success) {
      showToast(res.message || 'ไม่สามารถดึงข้อมูลคะแนนได้', 'error');
      return;
    }

    const { summary, submissions } = res;
    const maxTotalScore = 100;
    const minPassScore = summary.min_points_required || 80;

    container.innerHTML = `
      <div style="max-width: 1000px; margin: 0 auto;">
        
        <!-- Top Row: Gauge Card & Submit Proof Form -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px; margin-bottom: 24px;">
          
          <!-- Gauge Meter Card (Out of 100 points, 80 pass threshold) -->
          <div class="points-gauge-card" style="display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
            <h3 style="font-size: 1.2rem; font-weight: 700; color: #471764;"> กราฟคะแนนกิจกรรมรวม</h3>
            <p style="font-size: 0.82rem; color: #6b7280; margin-bottom: 12px;">คะแนนเต็ม 100 คะแนน (เกณฑ์ผ่าน 80 คะแนน)</p>

            <div class="gauge-canvas-container">
              <canvas id="points-gauge-canvas" width="220" height="220"></canvas>
              <div class="gauge-center-text">
                <span class="gauge-points-num">${summary.total_points}</span>
                <span class="gauge-points-max">/ ${maxTotalScore} คะแนน</span>
              </div>
            </div>

            <div class="pass-status-badge ${summary.is_passed ? 'passed' : 'failed'}" style="margin-top: 14px; width: 100%; max-width: 300px;">
              ${summary.is_passed ? ' ผ่านเกณฑ์กิจกรรมหอพักแล้ว (≥ 80 แต้ม)' : `️ ยังขาดอีก ${summary.points_needed} คะแนน เพื่อผ่านเกณฑ์`}
            </div>
          </div>

          <!-- Submit Activity Form -->
          <div style="background: #ffffff; border-radius: 18px; border: 1px solid #e5e7eb; padding: 24px; box-shadow: var(--shadow-sm);">
            <h3 style="font-size: 1.15rem; font-weight: 700; color: #471764; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
              <span> เช็คกิจกรรมและส่งรูปถ่ายหลักฐาน</span>
            </h3>

            <form onsubmit="handleActivityProofSubmit(event)">
              <div class="form-group">
                <label class="form-label required">เลือกกิจกรรมที่ต้องการส่งหลักฐาน</label>
                <select id="act-select" class="form-select" required>
                  <option value="">-- เลือกกิจกรรม --</option>
                  ${AppState.activities.map(a => `<option value="${a.id}">${a.title} (+${a.points} คะแนน)</option>`).join('')}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label required">แนบรูปภาพภายในกิจกรรม</label>
                <div class="file-upload-box" onclick="document.getElementById('act-photo-input').click()">
                  <div style="font-size: 1.8rem; margin-bottom: 4px;"></div>
                  <div style="font-weight: 600; color: #471764;">คลิกเพื่ออัปโหลดรูปถ่ายขณะเข้าร่วมกิจกรรม</div>
                  <div class="form-hint">เช่น รูปถ่ายตัวคุณร่วมกับกิจกรรมในหอพัก</div>
                  <input type="file" id="act-photo-input" accept="image/*" style="display: none;" onchange="previewActPhoto(this)">
                </div>
                <div id="act-photo-preview-wrap" style="display: none; text-align: center; margin-top: 10px;">
                  <img id="act-photo-preview" class="file-preview" src="" alt="รูปถ่ายกิจกรรม">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">คำอธิบายเพิ่มเติม / รายละเอียดการปฏิบัติกิจกรรม</label>
                <textarea id="act-notes" class="form-textarea" rows="2" placeholder="ระบุรายละเอียด เช่น เข้าร่วมทำความสะอาดบริเวณทางเดิน เป็นต้น"></textarea>
              </div>

              <button type="submit" id="act-submit-btn" class="btn btn-gold btn-block">
                 ส่งหลักฐานเช็คกิจกรรม
              </button>
            </form>
          </div>

        </div>

        <!-- 3. Submissions History Section (ใช้พื้นที่กว้างเต็มที่ ชัดเจน สวยงาม) -->
        <div class="data-table-card">
          <div class="data-table-header">
            <div>
              <h4 style="font-size: 1.1rem; font-weight: 700; color: #471764;"> ประวัติการส่งกิจกรรมของคุณ</h4>
              <p style="font-size:0.8rem; color:#6b7280; margin-top:2px;">
                รายการที่ยังรอการตรวจสอบสามารถกดแก้ไขหรือเปลี่ยนรูปได้ (หากผู้ดูแลระบบตรวจสอบแล้วจะไม่สามารถแก้ไขได้)
              </p>
            </div>
            <span style="font-size:0.82rem; background:#f3ebf9; color:#471764; padding:4px 10px; border-radius:10px; font-weight:700;">
              ส่งแล้วทั้งหมด ${submissions.length} รายการ
            </span>
          </div>

          <div class="table-responsive">
            <table class="custom-table">
              <thead>
                <tr>
                  <th style="width: 32%;">กิจกรรม & วันที่ส่ง</th>
                  <th style="width: 15%;">สถานะตรวจ</th>
                  <th style="width: 13%;">คะแนนที่ได้รับ</th>
                  <th style="width: 22%;">ความเห็นผู้ดูแลระบบ</th>
                  <th style="width: 18%; text-align: center;">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${submissions.length > 0 ? submissions.map(s => `
                  <tr>
                    <td>
                      <div style="font-weight: 700; color: #1e293b; font-size:0.92rem;">${s.activity_title}</div>
                      <div style="font-size: 0.78rem; color: #6b7280; margin-top:2px;">️ ส่งเมื่อ: ${s.submitted_at || '-'}</div>
                      ${s.student_notes ? `<div style="font-size:0.75rem; color:#4b5563; margin-top:3px; background:#f8fafc; padding:3px 6px; border-radius:4px;"> ${s.student_notes}</div>` : ''}
                      ${s.proof_image ? `<div style="margin-top:4px;"><a href="${s.proof_image}" target="_blank" style="font-size:0.75rem; color:#3b82f6; text-decoration:underline;"> ดูรูปถ่ายที่แนบ</a></div>` : ''}
                    </td>
                    <td>
                      <span class="status-badge ${s.status}">
                        ${s.status === 'approved' ? ' อนุมัติแล้ว' : (s.status === 'pending' ? '⏳ รอตรวจ' : ' ไม่อนุมัติ')}
                      </span>
                    </td>
                    <td>
                      <span style="font-weight: 800; font-size: 1.1rem; color: ${s.status === 'approved' ? '#059669' : '#6b7280'};">
                        +${s.granted_points}
                      </span>
                      <span style="font-size: 0.75rem; color: #9ca3af;">แต้ม</span>
                    </td>
                    <td style="font-size: 0.82rem; color: #4b5563;">
                      ${s.admin_comment ? `<div style="color:#047857;"> ${s.admin_comment}</div>` : '<span style="color:#9ca3af;">-</span>'}
                      ${s.checked_at ? `<div style="font-size:0.72rem; color:#9ca3af; margin-top:2px;">ตรวจเมื่อ: ${s.checked_at}</div>` : ''}
                    </td>
                    <td style="text-align: center;">
                      ${s.status === 'pending' ? `
                        <div style="display:flex; gap:6px; justify-content:center;">
                          <button class="btn btn-secondary btn-sm" onclick="openEditSubmissionModal(${s.id}, ${s.activity_id}, '${(s.student_notes || '').replace(/'/g, "\\'")}', '${s.proof_image || ''}')" title="แก้ไขข้อมูล/ส่งรูปใหม่">
                            ️ แก้ไข
                          </button>
                          <button class="btn btn-danger btn-sm" onclick="deleteMySubmission(${s.id})" title="ลบรายการส่งนี้">
                            ️
                          </button>
                        </div>
                      ` : `
                        <span style="font-size:0.72rem; color:#64748b; background:#f1f5f9; padding:4px 8px; border-radius:6px; font-weight:600; display:inline-block;">
                           ตรวจสอบแล้ว<br>(ไม่สามารถแก้ไขได้)
                        </span>
                      `}
                    </td>
                  </tr>
                `).join('') : '<tr><td colspan="5" style="text-align:center; padding:30px; color:#9ca3af;">ยังไม่มีประวัติการส่งกิจกรรม</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    setTimeout(() => {
      ChartEngine.drawCircularGauge('points-gauge-canvas', summary.total_points, maxTotalScore, minPassScore);
    }, 50);

  } catch (err) {
    console.error('Render activity error:', err);
  }
}

// 3. Edit Activity Submission Modal
let editSubmissionPhotoBase64 = null;

function openEditSubmissionModal(subId, actId, notes, photoUrl) {
  const modal = document.getElementById('generic-modal');
  const title = document.getElementById('generic-modal-title');
  const body = document.getElementById('generic-modal-body');

  editSubmissionPhotoBase64 = photoUrl || null;

  title.textContent = '️ แก้ไขข้อมูลการส่งกิจกรรม / แนบรูปใหม่';
  body.innerHTML = `
    <form onsubmit="handleEditSubmissionSubmit(event, ${subId})">
      <div class="form-group">
        <label class="form-label required">กิจกรรม</label>
        <select id="edit-act-select" class="form-select" required>
          ${AppState.activities.map(a => `<option value="${a.id}" ${a.id === actId ? 'selected' : ''}>${a.title} (+${a.points} คะแนน)</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">รูปภาพหลักฐานใหม่ (หากต้องการเปลี่ยน)</label>
        <div class="file-upload-box" onclick="document.getElementById('edit-act-photo-input').click()">
          <div style="font-size: 1.8rem; margin-bottom: 4px;"></div>
          <div style="font-weight: 600; color: #471764;">คลิกเพื่ออัปโหลดรูปถ่ายใหม่</div>
          <input type="file" id="edit-act-photo-input" accept="image/*" style="display: none;" onchange="previewEditActPhoto(this)">
        </div>
        <div id="edit-act-photo-wrap" style="text-align: center; margin-top: 10px;">
          ${photoUrl ? `<img id="edit-act-photo-img" class="file-preview" src="${photoUrl}" alt="รูปหลักฐานเดิม">` : '<img id="edit-act-photo-img" class="file-preview" style="display:none;" src="" alt="">'}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">คำอธิบายเพิ่มเติม / รายละเอียดการปฏิบัติกิจกรรม</label>
        <textarea id="edit-act-notes" class="form-textarea" rows="3">${notes || ''}</textarea>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
        <button type="button" class="btn btn-secondary" onclick="closeGenericModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-gold"> บันทึกการแก้ไข</button>
      </div>
    </form>
  `;

  modal.classList.add('active');
}

async function previewEditActPhoto(input) {
  const file = input.files[0];
  if (!file) return;

  try {
    editSubmissionPhotoBase64 = await fileToBase64(file);
    const img = document.getElementById('edit-act-photo-img');
    if (img) {
      img.src = editSubmissionPhotoBase64;
      img.style.display = 'inline-block';
    }
  } catch (e) {
    showToast('อ่านรูปภาพไม่สำเร็จ', 'error');
  }
}

async function handleEditSubmissionSubmit(event, subId) {
  event.preventDefault();
  const st = AppState.loggedInStudent;
  if (!st) return;

  const actId = parseInt(document.getElementById('edit-act-select').value, 10);
  const notes = document.getElementById('edit-act-notes').value.trim();

  try {
    const res = await API.editActivitySubmission(subId, {
      activity_id: actId,
      citizen_id: st.citizen_id,
      proof_image: editSubmissionPhotoBase64,
      student_notes: notes
    });

    if (res.success) {
      showToast(res.message, 'success');
      closeGenericModal();
      renderStudentActivityDashboard(st);
    } else {
      showToast(res.message || 'ไม่สามารถแก้ไขได้', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
  }
}

async function deleteMySubmission(subId) {
  if (!confirm('ต้องการลบรายการส่งกิจกรรมนี้หรือไม่?')) return;
  try {
    const res = await API.deleteActivitySubmission(subId);
    if (res.success) {
      showToast(res.message, 'success');
      if (AppState.loggedInStudent) renderStudentActivityDashboard(AppState.loggedInStudent);
    }
  } catch (err) {
    showToast('ไม่สามารถลบได้', 'error');
  }
}

let actPhotoBase64 = null;
async function previewActPhoto(input) {
  const file = input.files[0];
  if (!file) return;

  try {
    actPhotoBase64 = await fileToBase64(file);
    const wrap = document.getElementById('act-photo-preview-wrap');
    const img = document.getElementById('act-photo-preview');
    img.src = actPhotoBase64;
    wrap.style.display = 'block';
  } catch (e) {
    showToast('อ่านรูปภาพไม่สำเร็จ', 'error');
  }
}

async function handleActivityProofSubmit(event) {
  event.preventDefault();
  const st = AppState.loggedInStudent;
  if (!st) return;

  const activityId = parseInt(document.getElementById('act-select').value, 10);
  const notes = document.getElementById('act-notes').value.trim();

  const btn = document.getElementById('act-submit-btn');
  btn.disabled = true;
  btn.textContent = '⏳ กำลังส่งข้อมูล...';

  try {
    const res = await API.submitActivityProof({
      activity_id: activityId,
      citizen_id: st.citizen_id,
      proof_image: actPhotoBase64,
      student_notes: notes
    });

    if (res.success) {
      showToast(res.message, 'success');
      renderStudentActivityDashboard(st);
    } else {
      showToast(res.message || 'เกิดข้อผิดพลาด', 'error');
    }
  } catch (err) {
    showToast('ไม่สามารถส่งข้อมูลได้', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = ' ส่งหลักฐานเช็คกิจกรรม';
  }
}

// =========================================================
// 8. ADMIN PANEL (ADMIN-ONLY ACCESS)
// =========================================================
function openAdminLoginModal() {
  const modal = document.getElementById('generic-modal');
  const title = document.getElementById('generic-modal-title');
  const body = document.getElementById('generic-modal-body');

  title.textContent = ' เข้าสู่ระบบผู้ดูแลระบบหอพัก (Admin)';
  body.innerHTML = `
    <div style="text-align:center; margin-bottom:20px;">
      <div style="font-size:2.4rem; margin-bottom:6px;"></div>
      <h3 style="font-size:1.2rem; font-weight:700; color:#471764;">สำหรับเจ้าหน้าที่หอพัก มรภ.สุรินทร์</h3>
      <p style="font-size:0.82rem; color:#6b7280;">กรุณาใส่ชื่อผู้ใช้งานและรหัสผ่านเฉพาะของเจ้าหน้าที่</p>
    </div>

    <form onsubmit="handleAdminLoginModalSubmit(event)">
      <div class="form-group">
        <label class="form-label required">ชื่อผู้ใช้งาน (Username)</label>
        <input type="text" id="admin-modal-username" class="form-input" placeholder="admin" required value="admin">
      </div>
      <div class="form-group">
        <label class="form-label required">รหัสผ่าน (Password)</label>
        <input type="password" id="admin-modal-password" class="form-input" placeholder="รหัสผ่าน" required value="admin123">
      </div>
      <button type="submit" class="btn btn-primary btn-block" style="margin-top:16px;">
         เข้าสู่ระบบแอดมิน
      </button>
    </form>
  `;

  modal.classList.add('active');
}

async function handleAdminLoginModalSubmit(event) {
  event.preventDefault();
  const u = document.getElementById('admin-modal-username').value.trim();
  const p = document.getElementById('admin-modal-password').value;

  try {
    const res = await API.adminLogin(u, p);
    if (res.success) {
      AppState.loggedInAdmin = res.admin;
      localStorage.setItem('sru_admin_session', JSON.stringify(res.admin));
      updateUserStatusWidget();
      closeGenericModal();
      showToast('เข้าสู่ระบบผู้ดูแลระบบสำเร็จ!', 'success');
      navigateTo('admin');
    } else {
      showToast(res.message || 'รหัสผ่านแอดมินไม่ถูกต้อง', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการเข้าสู่ระบบ', 'error');
  }
}

async function loadAdminView() {
  const container = document.getElementById('view-admin');
  if (!container) return;

  if (AppState.loggedInAdmin) {
    renderAdminDashboard();
  } else {
    openAdminLoginModal();
  }
}

let currentAdminTab = 'applications';

async function renderAdminDashboard() {
  const container = document.getElementById('view-admin');
  if (!container || !AppState.loggedInAdmin) return;

  const statsRes = await API.getAdminStats();
  const stats = statsRes.success ? statsRes.stats : {};

  container.innerHTML = `
    <div style="max-width: 1100px; margin: 0 auto;">
      
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:16px;">
        <div>
          <h2 style="font-size:1.4rem; font-weight:700; color:#471764;">️ แผงควบคุมระบบหอพัก (Admin Control Center)</h2>
          <p style="font-size:0.85rem; color:#6b7280;">ควบคุมการเปิด-ปิดรับสมัคร, อนุมัติใบสมัคร, ตรวจกิจกรรม และดูข้อมูลสมาชิกทุกหอพัก</p>
        </div>
        
        <div style="display:flex; align-items:center; gap:14px; background:#ffffff; padding:8px 18px; border-radius:14px; border:1px solid #e5e7eb; box-shadow:var(--shadow-sm);">
          <span style="font-size:0.9rem; font-weight:700; color:#1e293b;">สถานะเปิดรับสมัคร:</span>
          <button id="admin-reg-toggle-btn" class="btn ${stats.registration_open ? 'btn-success' : 'btn-danger'} btn-sm" onclick="toggleRegistrationStatus(!${stats.registration_open})">
            ${stats.registration_open ? ' เปิดรับสมัครอยู่ (คลิกเพื่อปิด)' : ' ปิดรับสมัครแล้ว (คลิกเพื่อเปิด)'}
          </button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="form-row" style="margin-bottom:24px;">
        <div style="background:#ffffff; padding:18px; border-radius:14px; border:1px solid #e5e7eb; box-shadow:var(--shadow-sm);">
          <div style="font-size:0.82rem; color:#6b7280;">ผู้สมัครทั้งหมด (รวมรออนุมัติ)</div>
          <div style="font-size:1.5rem; font-weight:800; color:#471764;">${stats.total_applicants || 0} คน</div>
        </div>
        <div style="background:#ffffff; padding:18px; border-radius:14px; border:1px solid #e5e7eb; box-shadow:var(--shadow-sm);">
          <div style="font-size:0.82rem; color:#6b7280;">รอการอนุมัติ / ผ่านอนุมัติแล้ว</div>
          <div style="font-size:1.5rem; font-weight:800; color:#d97706;">⏳ ${stats.pending_applicants || 0} /  ${stats.approved_applicants || 0}</div>
        </div>
        <div style="background:#ffffff; padding:18px; border-radius:14px; border:1px solid #e5e7eb; box-shadow:var(--shadow-sm);">
          <div style="font-size:0.82rem; color:#6b7280;">รายการกิจกรรมรอตรวจ</div>
          <div style="font-size:1.5rem; font-weight:800; color:#2563eb;">${stats.pending_activity_reviews || 0} รายการ</div>
        </div>
      </div>

      <!-- Admin Tabs: Includes All Residents & Points Stats Directory -->
      <div class="dorm-floor-tabs" style="margin-bottom:20px; flex-wrap:wrap; gap:8px;">
        <button class="floor-tab-btn ${currentAdminTab === 'applications' ? 'active' : ''}" onclick="switchAdminTab('applications')">
           จัดการใบสมัคร (${stats.pending_applicants || 0} รอตรวจ)
        </button>
        <button class="floor-tab-btn ${currentAdminTab === 'residents_summary' ? 'active' : ''}" onclick="switchAdminTab('residents_summary')">
           ข้อมูลสมาชิกทุกหอพัก & สถิติกิจกรรม
        </button>
        <button class="floor-tab-btn ${currentAdminTab === 'reviews' ? 'active' : ''}" onclick="switchAdminTab('reviews')">
           ตรวจกิจกรรม & เคลียร์คิว (${stats.pending_activity_reviews || 0})
        </button>
        <button class="floor-tab-btn ${currentAdminTab === 'activities' ? 'active' : ''}" onclick="switchAdminTab('activities')">
           จัดการหัวข้อกิจกรรม
        </button>
        <button class="floor-tab-btn ${currentAdminTab === 'settings' ? 'active' : ''}" onclick="switchAdminTab('settings')">
          ️ ตั้งค่าระบบ & วันประกาศผล
        </button>
      </div>

      <div id="admin-tab-content"></div>

    </div>
  `;

  renderAdminTabContent();
}

function switchAdminTab(tab) {
  currentAdminTab = tab;
  renderAdminDashboard();
}

async function toggleRegistrationStatus(newStatus) {
  try {
    const res = await API.updateSettings({ registration_open: newStatus });
    if (res.success) {
      showToast(newStatus ? 'เปิดรับสมัครเรียบร้อยแล้ว' : 'ปิดรับสมัครเรียบร้อยแล้ว', 'info');
      await refreshSystemStatus();
      renderAdminDashboard();
    }
  } catch (err) {
    showToast('ไม่สามารถเปลี่ยนสถานะได้', 'error');
  }
}

async function renderAdminTabContent() {
  const mount = document.getElementById('admin-tab-content');
  if (!mount) return;

  if (currentAdminTab === 'applications') {
    const res = await API.getAdminApplications();
    const apps = res.success ? res.applications : [];

    mount.innerHTML = `
      <div class="data-table-card">
        <div class="data-table-header">
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <select id="admin-app-dorm-filter" class="form-select" style="width:200px;" onchange="filterAdminApps()">
              <option value="all">ทุกหอพัก</option>
              <option value="1">หอพักชายผกากรอง</option>
              <option value="2">หอพักหญิงแสงจันทร์</option>
              <option value="3">หอพักหญิงบานชื่น</option>
              <option value="4">หอพักหญิงดาวเรือง</option>
              <option value="5">หอพักหญิงเฟื่องฟ้า</option>
            </select>
            <input type="text" id="admin-app-search" class="form-input" style="width:240px;" placeholder=" ค้นหาชื่อ, เลขบัตร, โทร..." oninput="filterAdminApps()">
          </div>
        </div>

        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>เลขบัตร ปชช.</th>
                <th>ชื่อ - นามสกุล</th>
                <th>คณะ / สาขา</th>
                <th>หอพัก / ห้อง / เตียง</th>
                <th>เบอร์โทร</th>
                <th>เอกสารแนบ</th>
                <th>สถานะ</th>
                <th>การอนุมัติ / จัดการ</th>
              </tr>
            </thead>
            <tbody id="admin-apps-tbody">
              ${renderAdminAppsRows(apps)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (currentAdminTab === 'residents_summary') {
    // 2. Comprehensive Residents & Activity Points Directory for all dormitories
    renderAdminResidentsSummaryView();
  } else if (currentAdminTab === 'reviews') {
    // 4. Admin Review and Clear Processed Items from Queue
    const res = await API.getAdminSubmissions();
    const subs = res.success ? res.submissions : [];

    mount.innerHTML = `
      <div class="data-table-card">
        <div class="data-table-header">
          <div>
            <h4 style="font-size:1.05rem; font-weight:700; color:#471764;"> คิวตรวจสอบและอนุมัติคะแนนกิจกรรม</h4>
            <p style="font-size:0.8rem; color:#6b7280;">เมื่อตรวจเสร็จแล้ว สามารถกดลบออกจากคิวตรวจได้ทันทีเพื่อไม่ให้ค้างสะสม</p>
          </div>
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>นักศึกษา</th>
                <th>หอพัก / ห้อง</th>
                <th>กิจกรรมที่ส่ง</th>
                <th>รูปถ่ายหลักฐาน</th>
                <th>สถานะ</th>
                <th>ให้คะแนน (เต็ม 100)</th>
                <th>การตรวจ & เคลียร์คิว</th>
              </tr>
            </thead>
            <tbody>
              ${subs.length > 0 ? subs.map(s => `
                <tr>
                  <td>
                    <div style="font-weight:700; color:#1e293b;">${s.student_name}</div>
                    <div style="font-size:0.75rem; color:#6b7280;">ปชช: ${s.citizen_id}</div>
                  </td>
                  <td>${s.dormitory_name} (ห้อง ${s.room_number})</td>
                  <td>
                    <div style="font-weight:600; color:#471764;">${s.activity_title}</div>
                    <div style="font-size:0.75rem; color:#6b7280;">บันทึก: ${s.student_notes || '-'}</div>
                  </td>
                  <td>
                    ${s.proof_image ? `
                      <a href="${s.proof_image}" target="_blank">
                        <img src="${s.proof_image}" style="width:60px; height:60px; object-fit:cover; border-radius:8px; border:1px solid #cbd5e1;" title="คลิกดูรูปขยาย">
                      </a>
                    ` : '<span style="color:#9ca3af; font-size:0.8rem;">ไม่มีรูป</span>'}
                  </td>
                  <td>
                    <span class="status-badge ${s.status}">
                      ${s.status === 'approved' ? ' อนุมัติแล้ว' : (s.status === 'pending' ? '⏳ รอตรวจ' : ' ไม่อนุมัติ')}
                    </span>
                  </td>
                  <td>
                    <input type="number" id="sub-points-${s.id}" class="form-input" style="width:70px; padding:4px 8px;" value="${s.granted_points > 0 ? s.granted_points : s.max_points}">
                  </td>
                  <td>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                      <div style="display:flex; gap:4px;">
                        <button class="btn btn-success btn-sm" onclick="reviewSub(${s.id}, 'approved')" title="อนุมัติและบันทึกคะแนน"> อนุมัติ</button>
                        <button class="btn btn-danger btn-sm" onclick="reviewSub(${s.id}, 'rejected')" title="ปฏิเสธ"> ปฏิเสธ</button>
                      </div>
                      <button class="btn btn-secondary btn-sm" onclick="adminDeleteSubmission(${s.id})" style="font-size:0.72rem; padding:3px 6px;" title="ลบออกจากคิวตรวจ">
                        ️ ลบออกจากคิว
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="7" style="text-align:center; padding:30px; color:#9ca3af;">ไม่มีรายการกิจกรรมค้างในคิวตรวจ</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (currentAdminTab === 'activities') {
    const res = await API.getAdminActivities();
    const acts = res.success ? res.activities : [];

    mount.innerHTML = `
      <div style="background:#ffffff; border-radius:18px; border:1px solid #e5e7eb; padding:24px; box-shadow:var(--shadow-sm); margin-bottom:24px;">
        <h4 style="font-size:1.1rem; font-weight:700; color:#471764; margin-bottom:14px;"> เพิ่มหัวข้อกิจกรรมหอพักใหม่ (เกณฑ์คะแนนเต็ม 100)</h4>
        <form onsubmit="handleCreateActivity(event)">
          <div class="form-row">
            <div class="form-group" style="grid-column:span 2;">
              <label class="form-label required">ชื่อกิจกรรม</label>
              <input type="text" id="new-act-title" class="form-input" placeholder="เช่น กิจกรรม Big Cleaning Day" required>
            </div>
            <div class="form-group">
              <label class="form-label required">คะแนนที่ได้รับ</label>
              <input type="number" id="new-act-points" class="form-input" value="20" min="1" max="100" required>
            </div>
            <div class="form-group">
              <label class="form-label required">ประเภทกิจกรรม</label>
              <select id="new-act-cat" class="form-select" required>
                <option value="voluntary">จิตอาสา / ทั่วไป</option>
                <option value="mandatory">กิจกรรมบังคับ</option>
                <option value="cleanliness">พัฒนาความสะอาด</option>
                <option value="meeting">ปฐมนิเทศ / ประชุมหอ</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group" style="grid-column:span 2;">
              <label class="form-label">รายละเอียดกิจกรรม</label>
              <input type="text" id="new-act-desc" class="form-input" placeholder="คำชี้แจงและแนวทางปฏิบัติ">
            </div>
            <div class="form-group">
              <label class="form-label">วันที่จัดกิจกรรม</label>
              <input type="text" id="new-act-date" class="form-input" placeholder="เช่น 15 ก.ค. 2569 09:00">
            </div>
            <div class="form-group">
              <label class="form-label">กำหนดส่งหลักฐาน</label>
              <input type="text" id="new-act-deadline" class="form-input" placeholder="เช่น 16 ก.ค. 2569 23:59">
            </div>
          </div>
          <button type="submit" class="btn btn-gold">
            + บันทึกสร้างกิจกรรมใหม่
          </button>
        </form>
      </div>

      <div class="data-table-card">
        <div class="data-table-header">
          <h4 style="font-size:1.05rem; font-weight:700; color:#471764;"> รายการกิจกรรมทั้งหมด</h4>
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>ชื่อกิจกรรม</th>
                <th>ประเภท</th>
                <th>คะแนน</th>
                <th>ส่งแล้ว</th>
                <th>อนุมัติแล้ว</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              ${acts.map(a => `
                <tr>
                  <td style="font-weight:700;">${a.title}</td>
                  <td>${a.category}</td>
                  <td><span style="color:#059669; font-weight:800;">+${a.points}</span></td>
                  <td>${a.total_submissions || 0} คน</td>
                  <td>${a.approved_submissions || 0} คน</td>
                  <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteActivity(${a.id})">️ ลบ</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else if (currentAdminTab === 'settings') {
    const s = AppState.systemStatus || {};

    mount.innerHTML = `
      <div style="background:#ffffff; border-radius:18px; border:1px solid #e5e7eb; padding:28px; box-shadow:var(--shadow-sm); max-width:750px;">
        <h3 style="font-size:1.2rem; font-weight:700; color:#471764; margin-bottom:20px;">️ ตั้งค่ากำหนดการและระบบประกาศผล</h3>
        
        <form onsubmit="handleSaveSettings(event)">
          <div class="form-group">
            <label class="form-label required">ภาคการศึกษาปัจจุบัน</label>
            <input type="text" id="set-semester" class="form-input" value="${s.system_semester || 'ภาคการศึกษาที่ 1/2569'}" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label required">วันเริ่มต้นรับสมัคร</label>
              <input type="text" id="set-start" class="form-input" value="${s.registration_start || '1 พ.ค. 2569'}" required>
            </div>
            <div class="form-group">
              <label class="form-label required">วันสิ้นสุดรับสมัคร</label>
              <input type="text" id="set-end" class="form-input" value="${s.registration_end || '15 มิ.ย. 2569'}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label required">วันประกาศผลรายชื่อผู้มีสิทธิ์เข้าพัก</label>
              <input type="text" id="set-announce-date" class="form-input" value="${s.announcement_date || '20 มิ.ย. 2569'}" required>
            </div>
            <div class="form-group">
              <label class="form-label required">สถานะเปิดเผยรายชื่อ (ประกาศผล)</label>
              <select id="set-announce-open" class="form-select">
                <option value="true" ${s.announcement_open ? 'selected' : ''}>เปิดประกาศผลรายชื่อแล้ว (แสดงในหน้าประกาศรายชื่อ)</option>
                <option value="false" ${!s.announcement_open ? 'selected' : ''}>ยังไม่ถึงวันประกาศผล (ซ่อนรายชื่อ)</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label required">เกณฑ์คะแนนกิจกรรมขั้นต่ำในการผ่าน (คะแนน)</label>
              <input type="number" id="set-min-points" class="form-input" value="${s.min_activity_points || 80}" required>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">ข้อความแจ้งเตือนเมื่อระบบปิดรับสมัคร</label>
            <textarea id="set-closed-msg" class="form-textarea" rows="2">${s.closed_message || ''}</textarea>
          </div>

          <div style="display:flex; justify-content:flex-end; margin-top:20px;">
            <button type="submit" class="btn btn-gold">
               บันทึกการตั้งค่าระบบ
            </button>
          </div>
        </form>
      </div>
    `;
  }
}

// 4. Dedicated Admin Residents Directory & Activity Statistics by Dormitory
async function renderAdminResidentsSummaryView() {
  const mount = document.getElementById('admin-tab-content');
  if (!mount) return;

  const res = await API.getAdminResidentsSummary();
  const residents = res.success ? res.residents : [];
  const dormSummaries = res.success ? res.dorm_summaries : [];

  const totalRegistered = residents.length;
  const approvedResidentsCount = residents.filter(r => r.status === 'approved').length;
  const pendingResidentsCount = residents.filter(r => r.status === 'pending').length;
  const passedActivityCount = residents.filter(r => (r.activity_points || 0) >= 80).length;
  const inProgressActivityCount = totalRegistered - passedActivityCount;

  mount.innerHTML = `
    <!-- Top System Activity & Resident Stats Banner -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:14px; margin-bottom:20px;">
      <div style="background:#ffffff; border-radius:14px; border:1px solid #e5e7eb; padding:18px; box-shadow:var(--shadow-sm); display:flex; align-items:center; gap:14px;">
        <div style="width:48px; height:48px; border-radius:12px; background:#f3ebf9; color:#471764; display:flex; align-items:center; justify-content:center; font-size:1.6rem;"></div>
        <div>
          <div style="font-size:0.8rem; color:#6b7280; font-weight:600;">นักศึกษาทั้งหมดในระบบ</div>
          <div style="font-size:1.45rem; font-weight:800; color:#1e293b;">${totalRegistered} <span style="font-size:0.85rem; font-weight:500; color:#6b7280;">คน</span></div>
        </div>
      </div>

      <div style="background:#ffffff; border-radius:14px; border:1px solid #e5e7eb; padding:18px; box-shadow:var(--shadow-sm); display:flex; align-items:center; gap:14px;">
        <div style="width:48px; height:48px; border-radius:12px; background:#ecfdf5; color:#059669; display:flex; align-items:center; justify-content:center; font-size:1.6rem;"></div>
        <div>
          <div style="font-size:0.8rem; color:#6b7280; font-weight:600;">สมาชิกหอพัก (อนุมัติแล้ว)</div>
          <div style="font-size:1.45rem; font-weight:800; color:#059669;">${approvedResidentsCount} <span style="font-size:0.85rem; font-weight:500; color:#6b7280;">คน</span></div>
        </div>
      </div>

      <div style="background:#ffffff; border-radius:14px; border:1px solid #e5e7eb; padding:18px; box-shadow:var(--shadow-sm); display:flex; align-items:center; gap:14px;">
        <div style="width:48px; height:48px; border-radius:12px; background:#fef3c7; color:#d97706; display:flex; align-items:center; justify-content:center; font-size:1.6rem;">⏳</div>
        <div>
          <div style="font-size:0.8rem; color:#6b7280; font-weight:600;">ผู้สมัครรอการอนุมัติ</div>
          <div style="font-size:1.45rem; font-weight:800; color:#d97706;">${pendingResidentsCount} <span style="font-size:0.85rem; font-weight:500; color:#6b7280;">คน</span></div>
        </div>
      </div>

      <div style="background:#ffffff; border-radius:14px; border:1px solid #e5e7eb; padding:18px; box-shadow:var(--shadow-sm); display:flex; align-items:center; gap:14px;">
        <div style="width:48px; height:48px; border-radius:12px; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:1.6rem;"></div>
        <div>
          <div style="font-size:0.8rem; color:#6b7280; font-weight:600;">ผ่านเกณฑ์กิจกรรม (≥80 แต้ม)</div>
          <div style="font-size:1.45rem; font-weight:800; color:#2563eb;">${passedActivityCount} <span style="font-size:0.85rem; font-weight:500; color:#6b7280;">/ ${totalRegistered} คน</span></div>
        </div>
      </div>
    </div>

    <!-- 5 Dorms Capacity Summary Cards -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:12px; margin-bottom:20px;">
      ${dormSummaries.map(d => `
        <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
          <div style="font-weight:700; color:#471764; font-size:0.92rem; margin-bottom:2px;">${d.dorm_name}</div>
          <div style="font-size:0.72rem; color:#6b7280; margin-bottom:6px;">${d.dorm_gender === 'male' ? 'หอพักชาย' : 'หอพักหญิง'}</div>
          <div style="font-size:1.15rem; font-weight:800; color:#1e293b;">
            ${d.approved_residents || 0} <span style="font-size:0.75rem; font-weight:400; color:#6b7280;">/ ${d.total_capacity} เตียง</span>
          </div>
          <div style="font-size:0.72rem; color:#059669; font-weight:600; margin-top:3px;">
             ผ่านกิจกรรม: ${d.passed_activity_count || 0} คน
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Complete Resident Information and Activity Points Table -->
    <div class="data-table-card">
      <div class="data-table-header" style="flex-wrap:wrap; gap:14px;">
        <div>
          <h4 style="font-size:1.1rem; font-weight:700; color:#471764;"> ข้อมูลนักศึกษาทุกคนในหอพัก และสถิติกิจกรรมสะสม</h4>
          <p style="font-size:0.82rem; color:#6b7280;">แสดงข้อมูลส่วนตัว ผู้ปกครอง การติดต่อ และความคืบหน้าคะแนนกิจกรรมเปรียบเทียบกับเกณฑ์ 80 คะแนน</p>
        </div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <select id="admin-res-dorm-filter" class="form-select" style="width:170px;" onchange="filterAdminResidentsSummary()">
            <option value="all">ทุกหอพัก (5 หอพัก)</option>
            <option value="1">หอพักชายผกากรอง</option>
            <option value="2">หอพักหญิงแสงจันทร์</option>
            <option value="3">หอพักหญิงบานชื่น</option>
            <option value="4">หอพักหญิงดาวเรือง</option>
            <option value="5">หอพักหญิงเฟื่องฟ้า</option>
          </select>
          <select id="admin-res-floor-filter" class="form-select" style="width:115px;" onchange="filterAdminResidentsSummary()">
            <option value="all">ทุกชั้น (A/B)</option>
            <option value="A">ชั้น A (ชั้น 1)</option>
            <option value="B">ชั้น B (ชั้น 2)</option>
          </select>
          <select id="admin-res-act-filter" class="form-select" style="width:160px;" onchange="filterAdminResidentsSummary()">
            <option value="all">สถานะกิจกรรมทั้งหมด</option>
            <option value="passed"> ผ่านเกณฑ์ (≥80 แต้ม)</option>
            <option value="failed">⏳ กำลังสะสม (<80 แต้ม)</option>
          </select>
          <input type="text" id="admin-res-search" class="form-input" style="width:180px;" placeholder=" ค้นหาชื่อ, ปชช, คณะ..." oninput="filterAdminResidentsSummary()">
          <button class="btn btn-secondary btn-sm" onclick="window.print()">️ พิมพ์รายงาน</button>
        </div>
      </div>

      <div class="table-responsive">
        <table class="custom-table" style="font-size:0.85rem;">
          <thead>
            <tr>
              <th style="width: 14%;">หอพัก / ห้อง / เตียง</th>
              <th style="width: 16%;">ชื่อ - นามสกุล</th>
              <th style="width: 12%;">เลขบัตร ปชช.</th>
              <th style="width: 14%;">เบอร์โทร & คณะ</th>
              <th style="width: 14%;">ผู้ปกครอง & ฉุกเฉิน</th>
              <th style="width: 9%;">โรคประจำตัว</th>
              <th style="width: 13%;">คะแนนกิจกรรม (เต็ม 100)</th>
              <th style="width: 8%;">เกณฑ์ 80 แต้ม</th>
            </tr>
          </thead>
          <tbody id="admin-residents-summary-tbody">
            ${renderAdminResidentsSummaryRows(residents)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAdminResidentsSummaryRows(residents) {
  if (!residents || residents.length === 0) {
    return '<tr><td colspan="8" style="text-align:center; padding:35px; color:#9ca3af;">ยังไม่มีข้อมูลนักศึกษาในระบบ</td></tr>';
  }

  return residents.map(r => {
    const pts = r.activity_points || 0;
    const isPassed = pts >= 80;
    const progressPercent = Math.min(100, Math.round((pts / 100) * 100));

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:#471764;">${r.dormitory_name}</div>
          <span style="background:#f3ebf9; color:#471764; padding:2px 6px; border-radius:4px; font-weight:700; font-size:0.75rem;">
            ห้อง ${r.room_number} (เตียง ${r.bed_number})
          </span>
          <div style="margin-top:2px;">
            <span class="status-badge ${r.status}" style="font-size:0.68rem; padding:1px 6px;">
              ${r.status === 'approved' ? ' สมาชิกหอ' : '⏳ รออนุมัติ'}
            </span>
          </div>
        </td>
        <td>
          <div style="font-weight:700; color:#1e293b;">${r.prefix} ${r.first_name} ${r.last_name}</div>
          ${r.id_card_file ? `<a href="${r.id_card_file}" target="_blank" style="font-size:0.72rem; color:#3b82f6; text-decoration:underline;"> ดูสำเนาบัตร</a>` : '<span style="font-size:0.7rem; color:#94a3b8;">ไม่มีเอกสารแนบ</span>'}
        </td>
        <td style="font-family:monospace; font-weight:600; font-size:0.82rem;">${r.citizen_id}</td>
        <td>
          <div> ${r.phone}</div>
          <div style="font-size:0.75rem; color:#6b7280;">${r.faculty || '-'}<br>(${r.major || '-'})</div>
        </td>
        <td>
          <div style="font-size:0.8rem; font-weight:600;">${r.parent_name || '-'} (${r.parent_relation || '-'})</div>
          <div style="font-size:0.75rem; color:#6b7280;">โทร: ${r.parent_phone || r.emergency_contact || '-'}</div>
        </td>
        <td style="font-size:0.78rem;">${r.chronic_disease || 'ไม่มี'}</td>
        <td>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:800; font-size:1rem; color:${isPassed ? '#059669' : '#d97706'};">${pts}</span>
            <span style="font-size:0.75rem; color:#6b7280;">/ 100 แต้ม</span>
          </div>
          <!-- Visual Progress Bar -->
          <div style="width:100%; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
            <div style="width:${progressPercent}%; height:100%; background:${isPassed ? 'linear-gradient(90deg, #10b981, #059669)' : 'linear-gradient(90deg, #f59e0b, #d97706)'}; border-radius:3px;"></div>
          </div>
          <div style="font-size:0.7rem; color:#6b7280; margin-top:3px;">
            ${isPassed ? ' ครบเกณฑ์แล้ว' : `ขาดอีก ${Math.max(0, 80 - pts)} แต้ม`}
          </div>
        </td>
        <td>
          <span class="status-badge ${isPassed ? 'approved' : 'rejected'}" style="font-size:0.72rem; padding:3px 6px; display:inline-block; text-align:center;">
            ${isPassed ? ' ผ่านเกณฑ์' : '⏳ ยังไม่ผ่าน'}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

async function filterAdminResidentsSummary() {
  const dormId = document.getElementById('admin-res-dorm-filter')?.value || 'all';
  const floor = document.getElementById('admin-res-floor-filter')?.value || 'all';
  const actStatus = document.getElementById('admin-res-act-filter')?.value || 'all';
  const search = document.getElementById('admin-res-search')?.value || '';
  const tbody = document.getElementById('admin-residents-summary-tbody');
  if (!tbody) return;

  const res = await API.getAdminResidentsSummary(dormId, floor, 'all', search, actStatus);
  if (res.success) {
    tbody.innerHTML = renderAdminResidentsSummaryRows(res.residents);
  }
}

function renderAdminAppsRows(apps) {
  if (apps.length === 0) {
    return '<tr><td colspan="8" style="text-align:center; padding:30px; color:#9ca3af;">ยังไม่มีข้อมูลใบสมัครในระบบ</td></tr>';
  }

  return apps.map(a => `
    <tr>
      <td style="font-family:monospace; font-weight:700;">${a.citizen_id}</td>
      <td style="font-weight:700; color:#1e293b;">${a.prefix} ${a.first_name} ${a.last_name}</td>
      <td style="font-size:0.82rem; color:#4b5563;">${a.faculty || '-'}<br><span style="color:#6b7280;">(${a.major || '-'})</span></td>
      <td>
        <span style="font-weight:700; color:#471764;">${a.dormitory_name}</span><br>
        <span style="background:#f3ebf9; color:#471764; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:700;">ห้อง ${a.room_number} (เตียง ${a.bed_number})</span>
      </td>
      <td style="font-size:0.85rem;">${a.phone}</td>
      <td>
        ${a.id_card_file ? `<a href="${a.id_card_file}" target="_blank" style="color:#3b82f6; font-size:0.82rem; text-decoration:underline;"> ดูสำเนาบัตร</a>` : '<span style="color:#ef4444; font-size:0.75rem;">ไม่มี</span>'}
      </td>
      <td>
        <span class="status-badge ${a.status}">
          ${a.status === 'approved' ? ' อนุมัติแล้ว' : '⏳ รออนุมัติ'}
        </span>
      </td>
      <td>
        <div style="display:flex; gap:6px;">
          ${a.status === 'pending' ? `
            <button class="btn btn-success btn-sm" onclick="adminApproveApp(${a.id})" title="อนุมัติใบสมัคร"> อนุมัติ</button>
          ` : `
            <button class="btn btn-secondary btn-sm" onclick="adminUnapproveApp(${a.id})" title="ยกเลิกการอนุมัติ">↩ รออนุมัติ</button>
          `}
          <button class="btn btn-danger btn-sm" onclick="adminDeleteApp(${a.id})" title="ลบใบสมัคร">️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function adminApproveApp(id) {
  try {
    const res = await API.updateAdminAppStatus(id, { status: 'approved' });
    if (res.success) {
      showToast(res.message, 'success');
      renderAdminDashboard();
    }
  } catch (err) {
    showToast('ไม่สามารถอนุมัติได้', 'error');
  }
}

async function adminUnapproveApp(id) {
  try {
    const res = await API.updateAdminAppStatus(id, { status: 'pending' });
    if (res.success) {
      showToast('เปลี่ยนสถานะเป็นรออนุมัติแล้ว', 'info');
      renderAdminDashboard();
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

async function filterAdminApps() {
  const dormId = document.getElementById('admin-app-dorm-filter')?.value || 'all';
  const search = document.getElementById('admin-app-search')?.value || '';
  const tbody = document.getElementById('admin-apps-tbody');
  if (!tbody) return;

  const res = await API.getAdminApplications(dormId, 'all', search);
  if (res.success) {
    tbody.innerHTML = renderAdminAppsRows(res.applications);
  }
}

async function reviewSub(id, status) {
  const pointsInput = document.getElementById(`sub-points-${id}`);
  const grantedPoints = pointsInput ? parseInt(pointsInput.value, 10) : 0;

  try {
    const res = await API.reviewSubmission(id, {
      status,
      granted_points: grantedPoints,
      admin_comment: status === 'approved' ? 'อนุมัติคะแนนเรียบร้อย' : 'หลักฐานไม่ชัดเจน'
    });

    if (res.success) {
      showToast(res.message, 'success');
      renderAdminDashboard();
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

// 4. Admin Delete / Clear Reviewed Submission from Queue
async function adminDeleteSubmission(id) {
  if (!confirm('ต้องการลบรายการนี้ออกจากคิวตรวจหรือไม่?')) return;
  try {
    const res = await API.deleteAdminSubmission(id);
    if (res.success) {
      showToast(res.message, 'success');
      renderAdminDashboard();
    }
  } catch (err) {
    showToast('ไม่สามารถลบได้', 'error');
  }
}

async function handleCreateActivity(event) {
  event.preventDefault();
  const payload = {
    title: document.getElementById('new-act-title').value.trim(),
    points: parseInt(document.getElementById('new-act-points').value, 10),
    category: document.getElementById('new-act-cat').value,
    description: document.getElementById('new-act-desc').value.trim(),
    event_date: document.getElementById('new-act-date').value.trim(),
    deadline: document.getElementById('new-act-deadline').value.trim()
  };

  try {
    const res = await API.createActivity(payload);
    if (res.success) {
      showToast(res.message, 'success');
      renderAdminDashboard();
    }
  } catch (e) {
    showToast('ไม่สามารถสร้างกิจกรรมได้', 'error');
  }
}

async function deleteActivity(id) {
  if (!confirm('ต้องการลบกิจกรรมนี้หรือไม่?')) return;
  try {
    const res = await API.deleteActivity(id);
    if (res.success) {
      showToast(res.message, 'success');
      renderAdminDashboard();
    }
  } catch (e) {
    showToast('ไม่สามารถลบได้', 'error');
  }
}

async function adminDeleteApp(id) {
  if (!confirm('️ ต้องการลบใบสมัครนี้หรือไม่? สิทธิ์ห้องพักจะถูกคืนให้ระบบ')) return;
  try {
    const res = await API.deleteAdminApp(id);
    if (res.success) {
      showToast(res.message, 'success');
      renderAdminDashboard();
    }
  } catch (e) {
    showToast('ไม่สามารถลบได้', 'error');
  }
}

async function handleSaveSettings(event) {
  event.preventDefault();
  const payload = {
    system_semester: document.getElementById('set-semester').value.trim(),
    registration_start: document.getElementById('set-start').value.trim(),
    registration_end: document.getElementById('set-end').value.trim(),
    announcement_date: document.getElementById('set-announce-date').value.trim(),
    announcement_open: document.getElementById('set-announce-open').value,
    min_activity_points: parseInt(document.getElementById('set-min-points').value, 10),
    closed_message: document.getElementById('set-closed-msg').value.trim()
  };

  try {
    const res = await API.updateSettings(payload);
    if (res.success) {
      showToast(res.message, 'success');
      await refreshSystemStatus();
    }
  } catch (e) {
    showToast('เกิดข้อผิดพลาดในการบันทึก', 'error');
  }
}

// =========================================================
// MODALS
// =========================================================
function openLoginModal() {
  const modal = document.getElementById('generic-modal');
  const title = document.getElementById('generic-modal-title');
  const body = document.getElementById('generic-modal-body');

  title.textContent = ' เข้าสู่ระบบตรวจสอบข้อมูล';
  body.innerHTML = `
    <div style="text-align:center; margin-bottom:20px;">
      <div style="font-size:2rem; margin-bottom:4px;">️</div>
      <h3 style="font-size:1.15rem; font-weight:700; color:#471764;">ระบบหอพัก มหาวิทยาลัยราชภัฏสุรินทร์</h3>
      <p style="font-size:0.82rem; color:#6b7280;">กรอกเลขบัตรประชาชนและรหัสผ่านที่คุณสร้างไว้ตอนสมัคร</p>
    </div>

    <form onsubmit="handleModalStudentLogin(event)">
      <div class="form-group">
        <label class="form-label required">เลขประจำตัวประชาชน 13 หลัก</label>
        <input type="text" id="modal-citizen-id" class="form-input" maxlength="13" pattern="[0-9]{13}" placeholder="เลขบัตร ปชช. 13 หลัก" required>
      </div>
      <div class="form-group">
        <label class="form-label required">รหัสผ่าน (Password)</label>
        <input type="password" id="modal-password" class="form-input" placeholder="รหัสผ่านที่คุณสร้างไว้" required>
      </div>
      <button type="submit" class="btn btn-primary btn-block" style="margin-top:16px;">
        เข้าสู่ระบบ
      </button>
      <div style="text-align:center; margin-top:14px; font-size:0.85rem;">
        ยังไม่ได้ยื่นใบสมัคร? <a href="javascript:void(0)" onclick="closeGenericModal(); navigateTo('register');" style="color:#471764; font-weight:700;">สมัครเข้าหอใน</a>
      </div>
    </form>
  `;

  modal.classList.add('active');
}

async function handleModalStudentLogin(event) {
  event.preventDefault();
  const citizenId = document.getElementById('modal-citizen-id').value.trim();
  const password = document.getElementById('modal-password').value;

  try {
    const res = await API.loginStudent(citizenId, password);
    if (res.success) {
      AppState.loggedInStudent = res.application;
      localStorage.setItem('sru_student_session', JSON.stringify(res.application));
      updateUserStatusWidget();
      closeGenericModal();
      showToast('เข้าสู่ระบบสำเร็จ!', 'success');
      navigateTo('manage');
    } else {
      showToast(res.message || 'รหัสผ่านไม่ถูกต้อง', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการเข้าสู่ระบบ', 'error');
  }
}

async function viewDormRoomsModal(dormId) {
  const modal = document.getElementById('generic-modal');
  const title = document.getElementById('generic-modal-title');
  const body = document.getElementById('generic-modal-body');

  title.textContent = ' ผังห้องพักและสถานะเตียงว่าง';
  body.innerHTML = `<div id="modal-room-selector-mount" style="min-height:350px;"></div>`;
  modal.classList.add('active');

  const modalSelector = new RoomSelector('modal-room-selector-mount', {
    dormitoryId: dormId,
    onSelect: () => {}
  });
  window.activeRoomSelector = modalSelector;
  modalSelector.loadDormitory(dormId);
}

function closeGenericModal() {
  const modal = document.getElementById('generic-modal');
  if (modal) modal.classList.remove('active');
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  if (sidebar) sidebar.classList.toggle('mobile-open');
}

// On DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});
