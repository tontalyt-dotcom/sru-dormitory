// API Client Layer
const API = {
  // Public & System Status
  async getStatus() {
    const res = await fetch('/api/status');
    return res.json();
  },

  async getDormitories() {
    const res = await fetch('/api/dormitories');
    return res.json();
  },

  async getDormitoryRooms(dormId) {
    const res = await fetch(`/api/dormitories/${dormId}/rooms`);
    return res.json();
  },

  // Applications
  async submitApplication(data) {
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async loginStudent(citizenId, password) {
    const res = await fetch('/api/applications/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citizen_id: citizenId, password })
    });
    return res.json();
  },

  async updateApplication(data) {
    const res = await fetch('/api/applications/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteApplication(citizenId, password) {
    const res = await fetch('/api/applications/me', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citizen_id: citizenId, password })
    });
    return res.json();
  },

  async getPublicList(dormId = 'all', search = '') {
    const res = await fetch(`/api/applications/public-list?dorm_id=${dormId}&search=${encodeURIComponent(search)}`);
    return res.json();
  },

  async getAnnouncementList(dormId = 'all', search = '') {
    const res = await fetch(`/api/announcements/passed-list?dorm_id=${dormId}&search=${encodeURIComponent(search)}`);
    return res.json();
  },

  // Activities & Points
  async getActivities() {
    const res = await fetch('/api/activities');
    return res.json();
  },

  async submitActivityProof(data) {
    const res = await fetch('/api/activities/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async getMyPoints(citizenId) {
    const res = await fetch(`/api/activities/my-points?citizen_id=${encodeURIComponent(citizenId)}`);
    return res.json();
  },

  async editActivitySubmission(id, data) {
    const res = await fetch(`/api/activities/submissions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteActivitySubmission(id) {
    const res = await fetch(`/api/activities/submissions/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // Admin APIs
  async adminLogin(username, password) {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    return res.json();
  },

  async getAdminStats() {
    const res = await fetch('/api/admin/stats');
    return res.json();
  },

  async getAdminApplications(dormId = 'all', status = 'all', search = '') {
    const res = await fetch(`/api/admin/applications?dorm_id=${dormId}&status=${status}&search=${encodeURIComponent(search)}`);
    return res.json();
  },

  async getAdminResidentsSummary(dormId = 'all', floor = 'all', status = 'all', search = '', activityStatus = 'all') {
    const res = await fetch(`/api/admin/residents-summary?dorm_id=${dormId}&floor=${floor}&status=${status}&search=${encodeURIComponent(search)}&activity_status=${activityStatus}`);
    return res.json();
  },

  async getAdminDormResidents(dormId) {
    const res = await fetch(`/api/admin/dorm-residents/${dormId}`);
    return res.json();
  },

  async updateAdminAppStatus(id, data) {
    const res = await fetch(`/api/admin/applications/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteAdminApp(id) {
    const res = await fetch(`/api/admin/applications/${id}`, { method: 'DELETE' });
    return res.json();
  },

  async updateSettings(settings) {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return res.json();
  },

  async getAdminActivities() {
    const res = await fetch('/api/admin/activities');
    return res.json();
  },

  async createActivity(data) {
    const res = await fetch('/api/admin/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async updateActivity(id, data) {
    const res = await fetch(`/api/admin/activities/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteActivity(id) {
    const res = await fetch(`/api/admin/activities/${id}`, { method: 'DELETE' });
    return res.json();
  },

  async getAdminSubmissions(activityId = 'all', status = 'all', search = '') {
    const res = await fetch(`/api/admin/submissions?activity_id=${activityId}&status=${status}&search=${encodeURIComponent(search)}`);
    return res.json();
  },

  async reviewSubmission(id, data) {
    const res = await fetch(`/api/admin/submissions/${id}/review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteAdminSubmission(id) {
    const res = await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' });
    return res.json();
  }
};
