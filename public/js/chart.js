// Custom Canvas Chart Engine for Activity Points & Meters (Full 100 Points Scale, 80 Pass Threshold)
const ChartEngine = {
  drawCircularGauge(canvasId, currentPoints, maxPoints = 100, passPoints = 80) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width * 0.38;
    const lineWidth = 16;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Track Background Arc (270 degrees sweep from 135deg to 405deg)
    const startAngle = 0.75 * Math.PI; // 135 deg
    const endAngle = 2.25 * Math.PI;   // 405 deg (270 deg sweep)
    const totalSweep = endAngle - startAngle;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 80-point threshold tick marker on the gauge
    const passSweep = startAngle + (totalSweep * (passPoints / maxPoints));
    const passX = centerX + (radius) * Math.cos(passSweep);
    const passY = centerY + (radius) * Math.sin(passSweep);

    // Progress Arc
    const progress = Math.min(1.0, Math.max(0, currentPoints / maxPoints));
    if (progress > 0) {
      const currentEndAngle = startAngle + (totalSweep * progress);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, currentEndAngle);

      const gradient = ctx.createLinearGradient(0, height, width, 0);
      if (currentPoints >= passPoints) {
        gradient.addColorStop(0, '#10b981');
        gradient.addColorStop(1, '#059669');
      } else {
        gradient.addColorStop(0, '#f59e0b');
        gradient.addColorStop(1, '#e5a93b');
      }

      ctx.strokeStyle = gradient;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Draw 80 Point Marker Dot
    ctx.beginPath();
    ctx.arc(passX, passY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = currentPoints >= passPoints ? '#10b981' : '#dc2626';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
};
