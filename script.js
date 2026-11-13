/**
 * 태블릿 친화적 전자 서명 패드 (500x200px 투명 PNG 생성기)
 * - 서명 크기 스마트 자동 감지(Auto-Crop) 지원
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
  const modeAutoBtn = document.getElementById('modeAutoBtn');
  const modeFullBtn = document.getElementById('modeFullBtn');

  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');
  const createFileBtn = document.getElementById('createFileBtn');
  
  const previewCard = document.getElementById('previewCard');
  const previewImage = document.getElementById('previewImage');
  const previewBadge = document.getElementById('previewBadge');
  const closePreviewBtn = document.getElementById('closePreviewBtn');
  const toast = document.getElementById('toast');

  // 서명 설정 상태
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 200;
  
  let currentColor = '#111827';
  let baseStrokeWidth = 3.5;
  let isDrawing = false;
  let points = [];
  let historyStack = []; // Undo를 위한 ImageData 스택
  let exportMode = 'auto'; // 'auto' (서명 크기 자동 맞춤) 또는 'full' (500x200 전체)

  // 캔버스 초기 크기 설정 (순수 투명 상태 유지)
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  
  // 기본 그리기 속성
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 빈 캔버스 초기 상태를 히스토리에 저장
  saveState();

  /* ===============================
     이벤트 리스너: 터치 & 포인터
  =============================== */
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);

  // 태블릿 제스처 및 스크롤 방지
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

    const mid1 = {
      x: (p0.x + p1.x) / 2,
      y: (p0.y + p1.y) / 2
    };
    const mid2 = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    };

    ctx.beginPath();
    ctx.moveTo(mid1.x, mid1.y);
    ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);

    ctx.strokeStyle = currentColor;
    ctx.lineWidth = computeLineWidth(p1);
    ctx.stroke();
  }

  /* ===============================
     스마트 서명 영역 감지 (Auto-Crop Bounding Box)
  =============================== */
  /**
   * 투명하지 않은 픽셀(서명 획)을 스캔하여 실제 서명의 바운딩 박스를 계산합니다.
   * @param {number} padding - 서명 주변에 부여할 여백(px)
   */
  function getSignatureBounds(padding = 10) {
    const imgData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const data = imgData.data;

    let minX = CANVAS_WIDTH;
    let minY = CANVAS_HEIGHT;
    let maxX = -1;
    let maxY = -1;

    // 픽셀의 알파(A) 채널 순회
    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        const alphaIndex = (y * CANVAS_WIDTH + x) * 4 + 3;
        const alpha = data[alphaIndex];

        // 획이 존재하는 픽셀 발견 (알파 임계값: 15)
        if (alpha > 15) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // 그려진 서명이 없는 경우
    if (maxX === -1 || maxY === -1) {
      return null;
    }

    // 여백(Padding) 적용 및 캔버스 경계 보정
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropRight = Math.min(CANVAS_WIDTH, maxX + 1 + padding);
    const cropBottom = Math.min(CANVAS_HEIGHT, maxY + 1 + padding);

    const cropWidth = cropRight - cropX;
    const cropHeight = cropBottom - cropY;

    return {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight
    };
  }

  /* ===============================
     히스토리 및 상태 관리 (Undo / Clear)
  =============================== */
  function saveState() {
    if (historyStack.length >= 20) {
      historyStack.shift();
    }
    const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    historyStack.push(imageData);

    updateUI();
  }

  function updateUI() {
    undoBtn.disabled = historyStack.length <= 1;

    const bounds = getSignatureBounds(10);
    if (bounds) {
      placeholderTip.classList.add('hidden');
      statusDot.classList.add('active');
      detectedSizeText.innerHTML = `인식된 서명 크기: <strong>${bounds.width} &times; ${bounds.height} px</strong>`;
    } else {
      placeholderTip.classList.remove('hidden');
      statusDot.classList.remove('active');
      detectedSizeText.textContent = `서명 대기 중 (최대 ${CANVAS_WIDTH} × ${CANVAS_HEIGHT} px)`;
    }
  }

  function undo() {
    if (historyStack.length <= 1) return;

    historyStack.pop();
    const previousState = historyStack[historyStack.length - 1];
    ctx.putImageData(previousState, 0, 0);

    updateUI();
    showToast('마지막 획을 취소했습니다.');
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    historyStack = [];
    saveState();
    showToast('서명란을 초기화했습니다.');
  }

  /* ===============================
     파일만들기: 서명 크기 인식 투명 PNG 생성 및 다운로드
  =============================== */
  function createSignatureFile() {
    const bounds = getSignatureBounds(10);

    if (!bounds) {
      showToast('⚠️ 서명을 먼저 입력해 주세요.');
      return;
    }

    let targetCanvas;
    let exportWidth;
    let exportHeight;
    let fileNameType;

    if (exportMode === 'auto') {
      // 1. 서명 크기 인식 모드 (Auto-Crop)
      exportWidth = bounds.width;
      exportHeight = bounds.height;
      fileNameType = `crop_${exportWidth}x${exportHeight}`;

      // 감지된 크기만큼의 새 투명 캔버스 생성
      targetCanvas = document.createElement('canvas');
      targetCanvas.width = exportWidth;
      targetCanvas.height = exportHeight;
      const targetCtx = targetCanvas.getContext('2d');

      // 서명 획이 있는 영역만 잘라내어 복사
      targetCtx.drawImage(
        canvas,
        bounds.x, bounds.y, bounds.width, bounds.height,
        0, 0, exportWidth, exportHeight
      );
    } else {
      // 2. 500x200 전체 고정 모드
      exportWidth = CANVAS_WIDTH;
      exportHeight = CANVAS_HEIGHT;
      fileNameType = `${CANVAS_WIDTH}x${CANVAS_HEIGHT}`;
      targetCanvas = canvas;
    }

    // 투명 PNG Blob으로 생성 후 다운로드
    targetCanvas.toBlob((blob) => {
      if (!blob) {
        showToast('파일 생성에 실패했습니다.');
        return;
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const fileName = `signature_${fileNameType}_${timestamp}.png`;

      // 다운로드 트리거
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 다운로드 완료 알림
      showToast(`✅ "${fileName}" 파일이 다운로드되었습니다!`);

      // 미리보기 영역 업데이트
      previewImage.src = downloadUrl;
      previewBadge.textContent = `출력 크기: ${exportWidth} × ${exportHeight} px`;
      previewCard.style.display = 'block';
    }, 'image/png');
  }

  /* ===============================
     저장 모드 선택 및 툴바 이벤트
  =============================== */
  // 저장 모드 토글 (자동 맞춤 vs 500x200 전체)
  modeAutoBtn.addEventListener('click', () => {
    exportMode = 'auto';
    modeAutoBtn.classList.add('active');
    modeFullBtn.classList.remove('active');
  });

  modeFullBtn.addEventListener('click', () => {
    exportMode = 'full';
    modeFullBtn.classList.add('active');
    modeAutoBtn.classList.remove('active');
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
    const btn = e.target.closest('.stroke-btn');
    if (!btn) return;

    strokeOptions.querySelectorAll('.stroke-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    baseStrokeWidth = parseFloat(btn.getAttribute('data-size'));
  });

  // 투명 격자 배경 토글
  toggleGridBtn.addEventListener('click', () => {
    const isActive = canvasWrapper.classList.toggle('grid-bg');
    toggleGridBtn.classList.toggle('active', isActive);
  });

  // 기준선 토글
  toggleGuidelineBtn.addEventListener('click', () => {
    const isHidden = guideline.classList.toggle('hidden');
    toggleGuidelineBtn.classList.toggle('active', !isHidden);
  });

  // 액션 버튼
  undoBtn.addEventListener('click', undo);
  clearBtn.addEventListener('click', clearCanvas);
  createFileBtn.addEventListener('click', createSignatureFile);

  // 미리보기 닫기 버튼
  closePreviewBtn.addEventListener('click', () => {
    previewCard.style.display = 'none';
  });

  // 키보드 단축키 편의 지원 (Ctrl+Z)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
  });

  /* ===============================
     토스트 알림 함수
  =============================== */
  let toastTimer = null;
  function showToast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }
});
