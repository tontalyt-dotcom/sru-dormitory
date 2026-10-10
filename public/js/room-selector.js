// Interactive Room & Bed Selector Component
class RoomSelector {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      onSelect: options.onSelect || (() => {}),
      gender: options.gender || 'male',
      dormitoryId: options.dormitoryId || null,
      selectedRoomId: options.selectedRoomId || null,
      selectedBed: options.selectedBed || null,
      ...options
    };
    this.currentFloor = 'A';
    this.roomsData = [];
    this.dormData = null;
  }

  async loadDormitory(dormId, preSelectedRoomId = null, preSelectedBed = null) {
    if (!dormId) return;
    this.options.dormitoryId = dormId;
    if (preSelectedRoomId) this.options.selectedRoomId = preSelectedRoomId;
    if (preSelectedBed) this.options.selectedBed = preSelectedBed;

    this.container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #6b7280;">
        <div style="font-weight: 600; margin-bottom: 4px;">กำลังโหลดผังห้องพักและสถานะเตียง...</div>
        <div style="font-size: 0.85rem; color: #94a3b8;">กรุณารอสักครู่</div>
      </div>
    `;

    try {
      const res = await API.getDormitoryRooms(dormId);
      if (res.success) {
        this.dormData = res.dormitory;
        this.roomsData = res.rooms;

        // Auto determine floor if preselected room exists
        if (this.options.selectedRoomId) {
          const found = this.roomsData.find(r => r.id === parseInt(this.options.selectedRoomId, 10));
          if (found) {
            this.currentFloor = found.floor;
          }
        }

        this.render();
      } else {
        this.container.innerHTML = `<div style="color: #ef4444; padding: 20px;">${res.message || 'ไม่สามารถโหลดข้อมูลห้องพักได้'}</div>`;
      }
    } catch (e) {
      console.error(e);
      this.container.innerHTML = `<div style="color: #ef4444; padding: 20px;">เกิดข้อผิดพลาดในการโหลดข้อมูลห้องพัก</div>`;
    }
  }

  setFloor(floor) {
    this.currentFloor = floor;
    this.render();
  }

  selectBed(roomId, bedNumber) {
    this.options.selectedRoomId = roomId;
    this.options.selectedBed = bedNumber;

    const room = this.roomsData.find(r => r.id === roomId);
    this.render();

    this.options.onSelect({
      dormitoryId: this.options.dormitoryId,
      dormitoryName: this.dormData ? this.dormData.name : '',
      roomId: room.id,
      roomNumber: room.room_number,
      floor: room.floor,
      bedNumber: bedNumber
    });
  }

  render() {
    if (!this.roomsData || this.roomsData.length === 0) {
      this.container.innerHTML = '<div style="padding: 20px; color: #6b7280;">ไม่มีข้อมูลห้องพักสำหรับหอพักนี้</div>';
      return;
    }

    const filteredRooms = this.roomsData.filter(r => r.floor === this.currentFloor);

    let html = `
      <div class="room-selector-box">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h4 style="font-size: 1.05rem; font-weight: 700; color: #471764; margin-bottom: 2px;">
              ผังห้องพัก: ${this.dormData ? this.dormData.name : ''}
            </h4>
            <p style="font-size: 0.82rem; color: #6b7280;">คลิกเลือกเตียงนอนที่ว่างในห้องพักที่ต้องการ</p>
          </div>
          <div class="dorm-floor-tabs" style="margin-bottom: 0; border: none; padding: 0;">
            <button type="button" class="floor-tab-btn ${this.currentFloor === 'A' ? 'active' : ''}" onclick="window.activeRoomSelector.setFloor('A')">
              ชั้น A (ชั้น 1)
            </button>
            <button type="button" class="floor-tab-btn ${this.currentFloor === 'B' ? 'active' : ''}" onclick="window.activeRoomSelector.setFloor('B')">
              ชั้น B (ชั้น 2)
            </button>
          </div>
        </div>

        <div style="display: flex; gap: 16px; margin-bottom: 16px; font-size: 0.8rem; background: #f8fafc; padding: 10px 14px; border-radius: 8px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 14px; height: 14px; background: #ecfdf5; border: 1px dashed #10b981; border-radius: 4px;"></div>
            <span>เตียงว่าง (คลิกเพื่อเลือก)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 14px; height: 14px; background: #e5a93b; border-radius: 4px;"></div>
            <span>เตียงที่คุณเลือก</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="width: 14px; height: 14px; background: #fef2f2; border: 1px dashed #fca5a5; border-radius: 4px;"></div>
            <span>มีผู้พักแล้ว</span>
          </div>
        </div>

        <div class="room-map-grid">
    `;

    for (const room of filteredRooms) {
      const isSelectedRoom = this.options.selectedRoomId && parseInt(this.options.selectedRoomId, 10) === room.id;
      const cardClass = room.is_full ? 'room-item-card full' : (isSelectedRoom ? 'room-item-card selected' : 'room-item-card');

      html += `
        <div class="${cardClass}">
          <div class="room-item-header">
            <div>
              <span class="room-number-title">ห้อง ${room.room_number}</span>
              <span style="font-size: 0.75rem; color: #6b7280; margin-left: 4px;">(ชั้น ${room.floor})</span>
            </div>
            <span class="room-capacity-tag ${room.is_full ? 'full' : 'avail'}">
              ${room.is_full ? 'เต็มแล้ว' : `ว่าง ${room.available_count}/${room.max_capacity}`}
            </span>
          </div>

          <div class="beds-container">
      `;

      for (const bed of room.beds) {
        const isSelectedBed = isSelectedRoom && parseInt(this.options.selectedBed, 10) === bed.bed_number;
        let bedClass = 'bed-chip ';
        if (bed.is_occupied) {
          bedClass += 'occupied';
        } else if (isSelectedBed) {
          bedClass += 'selected';
        } else {
          bedClass += 'available';
        }

        const clickHandler = !bed.is_occupied 
          ? `onclick="window.activeRoomSelector.selectBed(${room.id}, ${bed.bed_number})"` 
          : '';

        html += `
          <div class="${bedClass}" ${clickHandler} title="${bed.is_occupied ? `มีผู้พักแล้ว (${bed.occupant ? bed.occupant.full_name : ''})` : `เตียงที่ ${bed.bed_number} ว่าง คลิกเพื่อจอง`}">
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
              <span>เตียง ${bed.bed_number}</span>
              ${isSelectedBed ? '<span>✓</span>' : ''}
            </div>
            ${bed.is_occupied ? `<div class="bed-occupant-name">${bed.occupant ? bed.occupant.full_name : 'มีผู้จอง'}</div>` : '<div style="font-size: 0.68rem; color: #059669;">ว่าง</div>'}
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }
}

window.RoomSelector = RoomSelector;
