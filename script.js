/**
 * 미니멀 전자 서명 패드
 * - 서명 영역 무조건 자동 크롭(Auto-Crop)
 * - 카카오톡 아이콘(앱 공유) & 저장 아이콘(PNG 다운로드)
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM 요소 참조
  const canvas = document.getElementById('signatureCanvas');
  const canvasWrapper = document.getElementById('canvasWrapper');
  const ctx = canvas.getContext('2d');

  const colorOptions = document.getElementById('colorOptions');
  const strokeOptions = document.getElementById('strokeOptions');
  const toggleGridBtn = document.getElementById('toggleGridBtn');
  const toggleGuidelineBtn = document.getElementById('toggleGuidelineBtn');
  const guideline = document.getElementById('guideline');
  const placeholderTip = document.getElementById('placeholderTip');

  const statusDot = document.getElementById('statusDot');
  const detectedSizeText = document.getElementById('detectedSizeText');

  // 하단 아이콘 버튼
  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');
  const saveBtn = document.getElementById('saveBtn');
  const kakaoBtn = document.getElementById('kakaoBtn');

  // 미리보기 요소
  const previewCard = document.getElementById('previewCard');
  const previewImage = document.getElementById('previewImage');
  const previewBadge = document.getElementById('previewBadge');
  const closePreviewBtn = document.getElementById('closePreviewBtn');
  const toast = document.getElementById('toast');

  // 상수 및 상태
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 200;

  let currentColor = '#111827';
  let baseStrokeWidth = 3.5;
  let isDrawing = false;
  let points = [];
  let historyStack = [];

  // 캔버스 초기화
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  saveState();

  /* ===============================
     터치 / 펜 / 마우스 이벤트 (Pointer Events)
  =============================== */
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);

  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  function getCanvasCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure: (e.pressure && e.pressure > 0) ? e.pressure : 0.5,
      pointerType: e.pointerType || 'mouse'
    };
  }

  function handlePointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}

    isDrawing = true;
    canvasWrapper.classList.add('active-drawing');
    placeholderTip.classList.add('hidden');

    const point = getCanvasCoordinates(e);
    points = [point];
    drawDot(point);
  }

  function handlePointerMove(e) {
    if (!isDrawing) return;

    const point = getCanvasCoordinates(e);
    points.push(point);

    if (points.length >= 3) {
      drawSmoothLine();
    }
  }

  function handlePointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    canvasWrapper.classList.remove('active-drawing');

    try {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (err) {}

    if (points.length >= 2) {
      const p1 = points[points.length - 2];
      const p2 = points[points.length - 1];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = computeLineWidth(p2);
      ctx.stroke();
    }

    points = [];
    saveState();
  }

  function computeLineWidth(point) {
    if (point.pointerType === 'pen' && point.pressure > 0) {
      return baseStrokeWidth * (0.4 + point.pressure * 1.2);
    }
    return baseStrokeWidth;
  }

  function drawDot(point) {
    ctx.beginPath();
    const radius = computeLineWidth(point) / 2;
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2, false);
    ctx.fillStyle = currentColor;
    ctx.fill();
  }

  function drawSmoothLine() {
    const len = points.length;
    const p0 = points[len - 3];
    const p1 = points[len - 2];
    const p2 = points[len - 1];

    const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    ctx.beginPath();
    ctx.moveTo(mid1.x, mid1.y);
    ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = computeLineWidth(p1);
    ctx.stroke();
  }

  /* ===============================
     무조건 서명 크기에 딱 맞게 크롭 (Auto-Crop)
  =============================== */
  function getSignatureBounds(padding = 8) {
    const imgData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const data = imgData.data;

    let minX = CANVAS_WIDTH;
    let minY = CANVAS_HEIGHT;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        const alphaIndex = (y * CANVAS_WIDTH + x) * 4 + 3;
        if (data[alphaIndex] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX === -1 || maxY === -1) return null;

    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropRight = Math.min(CANVAS_WIDTH, maxX + 1 + padding);
    const cropBottom = Math.min(CANVAS_HEIGHT, maxY + 1 + padding);

    return {
      x: cropX,
      y: cropY,
      width: cropRight - cropX,
      height: cropBottom - cropY
    };
  }

  /* ===============================
     히스토리 및 상태 관리 (Undo / Clear)
  =============================== */
  function saveState() {
    if (historyStack.length >= 20) {
      historyStack.shift();
    }
    historyStack.push(ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT));
    updateUI();
  }

  function updateUI() {
    undoBtn.disabled = historyStack.length <= 1;

    const bounds = getSignatureBounds(8);
    if (bounds) {
      placeholderTip.classList.add('hidden');
      statusDot.classList.add('active');
      detectedSizeText.textContent = `${bounds.width} × ${bounds.height} px`;
    } else {
      placeholderTip.classList.remove('hidden');
      statusDot.classList.remove('active');
      detectedSizeText.textContent = '서명 대기 중';
    }
  }

  function undo() {
    if (historyStack.length <= 1) return;
    historyStack.pop();
    ctx.putImageData(historyStack[historyStack.length - 1], 0, 0);
    updateUI();
    showToast('마지막 획을 취소했습니다.');
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    historyStack = [];
    saveState();
    previewCard.style.display = 'none';
    showToast('서명란을 초기화했습니다.');
  }

  /* ===============================
     무조건 서명 크기에 맞춰 크롭된 투명 PNG Blob 생성
  =============================== */
  function generateCroppedBlob(callback) {
    const bounds = getSignatureBounds(8);
    if (!bounds) {
      showToast('⚠️ 서명을 먼저 입력해 주세요.');
      return;
    }

    // 서명 크기만큼만의 투명 캔버스 생성
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = bounds.width;
    cropCanvas.height = bounds.height;
    const cropCtx = cropCanvas.getContext('2d');

    // 서명 획만 쏙 잘라내기
    cropCtx.drawImage(
      canvas,
      bounds.x, bounds.y, bounds.width, bounds.height,
      0, 0, bounds.width, bounds.height
    );

    cropCanvas.toBlob((blob) => {
      if (!blob) {
        showToast('이미지 생성에 실패했습니다.');
        return;
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const fileName = `sign_${bounds.width}x${bounds.height}_${timestamp}.png`;

      // 상단 미리보기 업데이트
      const previewUrl = URL.createObjectURL(blob);
      previewImage.src = previewUrl;
      previewBadge.textContent = `${bounds.width} × ${bounds.height} px`;
      previewCard.style.display = 'block';

      callback(blob, fileName, bounds.width, bounds.height);
    }, 'image/png');
  }

  /* ===============================
     1. 카카오톡 아이콘 클릭 -> 카카오톡 등 앱으로 보내기
  =============================== */
  async function handleKakaoShare() {
    generateCroppedBlob(async (blob, fileName) => {
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: '전자 서명 (투명 PNG)',
            text: '배경이 투명한 전자 서명 파일입니다.'
          });
          showToast('✅ 카카오톡 등 앱으로 전송되었습니다.');
        } catch (err) {
          if (err.name !== 'AbortError') {
            downloadFile(blob, fileName);
          }
        }
      } else {
        showToast('ℹ️ 앱 공유가 지원되지 않아 파일로 저장합니다.');
        downloadFile(blob, fileName);
      }
    });
  }

  /* ===============================
     2. 저장 아이콘 클릭 -> PNG 파일 다운로드
  =============================== */
  function handleFileSave() {
    generateCroppedBlob((blob, fileName) => {
      downloadFile(blob, fileName);
    });
  }

  function downloadFile(blob, fileName) {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`💾 "${fileName}" 파일이 저장되었습니다.`);
  }

  /* ===============================
     이벤트 바인딩
  =============================== */
  kakaoBtn.addEventListener('click', handleKakaoShare);
  saveBtn.addEventListener('click', handleFileSave);

  undoBtn.addEventListener('click', undo);
  clearBtn.addEventListener('click', clearCanvas);

  closePreviewBtn.addEventListener('click', () => {
    previewCard.style.display = 'none';
  });

  // 펜 색상 선택
  colorOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.color-btn');
    if (!btn) return;
    colorOptions.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.getAttribute('data-color');
  });

  // 펜 굵기 선택
  strokeOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.stroke-dot-btn');
    if (!btn) return;
    strokeOptions.querySelectorAll('.stroke-dot-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    baseStrokeWidth = parseFloat(btn.getAttribute('data-size'));
  });

  // 가이드라인 및 격자 토글
  toggleGridBtn.addEventListener('click', () => {
    const isActive = canvasWrapper.classList.toggle('grid-bg');
    toggleGridBtn.classList.toggle('active', isActive);
  });

  toggleGuidelineBtn.addEventListener('click', () => {
    const isHidden = guideline.classList.toggle('hidden');
    toggleGuidelineBtn.classList.toggle('active', !isHidden);
  });

  // 키보드 단축키
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
  });

  /* ===============================
     토스트 알림
  =============================== */
  let toastTimer = null;
  function showToast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }
});
