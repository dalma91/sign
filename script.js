/**
 * 태블릿 친화적 전자 서명 패드 (500x200px 투명 PNG 생성기)
 * - 서명 크기 스마트 자동 감지(Auto-Crop)
 * - 카카오톡 등 앱으로 바로 보내기 (Web Share API 파일 공유)
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
  
  // 설정 모드 버튼
  const actionShareBtn = document.getElementById('actionShareBtn');
  const actionDownloadBtn = document.getElementById('actionDownloadBtn');
  const modeAutoBtn = document.getElementById('modeAutoBtn');
  const modeFullBtn = document.getElementById('modeFullBtn');

  // 액션 버튼
  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');
  const directShareBtn = document.getElementById('directShareBtn');
  const createFileBtn = document.getElementById('createFileBtn');
  const createFileBtnText = document.getElementById('createFileBtnText');
  
  // 미리보기 요소
  const previewCard = document.getElementById('previewCard');
  const previewImage = document.getElementById('previewImage');
  const previewBadge = document.getElementById('previewBadge');
  const closePreviewBtn = document.getElementById('closePreviewBtn');
  const previewShareBtn = document.getElementById('previewShareBtn');
  const previewDownloadBtn = document.getElementById('previewDownloadBtn');
  const toast = document.getElementById('toast');

  // 상태 관리
  const CANVAS_WIDTH = 500;
  const CANVAS_HEIGHT = 200;
  
  let currentColor = '#111827';
  let baseStrokeWidth = 3.5;
  let isDrawing = false;
  let points = [];
  let historyStack = [];
  
  let defaultAction = 'share'; // 'share' (카톡 등 앱 공유) 또는 'download' (파일 다운로드)
  let exportMode = 'auto';     // 'auto' (서명 크기 자동 맞춤) 또는 'full' (500x200 전체)
  let latestBlob = null;
  let latestFileName = '';

  // 캔버스 초기 크기 설정
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  saveState();

  /* ===============================
     이벤트 리스너: 터치 & 포인터
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
     스마트 서명 영역 감지 (Auto-Crop Bounding Box)
  =============================== */
  function getSignatureBounds(padding = 10) {
    const imgData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const data = imgData.data;

    let minX = CANVAS_WIDTH;
    let minY = CANVAS_HEIGHT;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < CANVAS_HEIGHT; y++) {
      for (let x = 0; x < CANVAS_WIDTH; x++) {
        const alphaIndex = (y * CANVAS_WIDTH + x) * 4 + 3;
        if (data[alphaIndex] > 15) {
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
    ctx.putImageData(historyStack[historyStack.length - 1], 0, 0);
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
     투명 PNG 생성 및 Blob 반환 유틸
  =============================== */
  function generateSignatureBlob(callback) {
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
      exportWidth = bounds.width;
      exportHeight = bounds.height;
      fileNameType = `crop_${exportWidth}x${exportHeight}`;

      targetCanvas = document.createElement('canvas');
      targetCanvas.width = exportWidth;
      targetCanvas.height = exportHeight;
      const targetCtx = targetCanvas.getContext('2d');

      targetCtx.drawImage(
        canvas,
        bounds.x, bounds.y, bounds.width, bounds.height,
        0, 0, exportWidth, exportHeight
      );
    } else {
      exportWidth = CANVAS_WIDTH;
      exportHeight = CANVAS_HEIGHT;
      fileNameType = `${CANVAS_WIDTH}x${CANVAS_HEIGHT}`;
      targetCanvas = canvas;
    }

    targetCanvas.toBlob((blob) => {
      if (!blob) {
        showToast('파일 생성에 실패했습니다.');
        return;
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const fileName = `signature_${fileNameType}_${timestamp}.png`;

      latestBlob = blob;
      latestFileName = fileName;

      // 미리보기 업데이트
      const previewUrl = URL.createObjectURL(blob);
      previewImage.src = previewUrl;
      previewBadge.textContent = `출력 크기: ${exportWidth} × ${exportHeight} px`;
      previewCard.style.display = 'block';

      callback(blob, fileName, exportWidth, exportHeight);
    }, 'image/png');
  }

  /* ===============================
     1. 카카오톡 등 앱으로 공유 (Web Share API)
  =============================== */
  async function shareSignatureFile(blob, fileName) {
    const file = new File([blob], fileName, { type: 'image/png' });

    // 기기 및 브라우저의 파일 공유 지원 여부 검사
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: '전자 서명 (투명 PNG)',
          text: '배경이 투명한 전자 서명 파일입니다.'
        });
        showToast('✅ 카카오톡 등 앱으로 공유를 완료했습니다.');
      } catch (err) {
        if (err.name !== 'AbortError') {
          // 사용자가 취소한 것이 아니라 실패한 경우 다운로드로 대체
          downloadBlob(blob, fileName);
        }
      }
    } else {
      // 데스크톱 브라우저 등 파일 공유를 미지원하는 환경
      showToast('ℹ️ 이 브라우저 환경에서는 앱 공유를 지원하지 않아 파일 다운로드로 저장합니다.');
      downloadBlob(blob, fileName);
    }
  }

  /* ===============================
     2. 로컬 파일 다운로드
  =============================== */
  function downloadBlob(blob, fileName) {
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`✅ "${fileName}" 파일이 다운로드되었습니다.`);
  }

  /* ===============================
     메인 '파일만들기' 실행 분기
  =============================== */
  function handleCreateFile() {
    generateSignatureBlob((blob, fileName) => {
      if (defaultAction === 'share') {
        shareSignatureFile(blob, fileName);
      } else {
        downloadBlob(blob, fileName);
      }
    });
  }

  // 상시 카카오톡/앱 바로 공유 버튼
  directShareBtn.addEventListener('click', () => {
    generateSignatureBlob((blob, fileName) => {
      shareSignatureFile(blob, fileName);
    });
  });

  // 메인 파일만들기 버튼
  createFileBtn.addEventListener('click', handleCreateFile);

  /* ===============================
     설정 옵션 이벤트 리스너
  =============================== */
  // 동작 설정 (앱 공유 vs 다운로드)
  actionShareBtn.addEventListener('click', () => {
    defaultAction = 'share';
    actionShareBtn.classList.add('active');
    actionDownloadBtn.classList.remove('active');
    createFileBtnText.textContent = '파일만들기 (카톡 공유)';
    showToast('설정 완료: 파일만들기 클릭 시 카톡 등 앱으로 바로 보냅니다.');
  });

  actionDownloadBtn.addEventListener('click', () => {
    defaultAction = 'download';
    actionDownloadBtn.classList.add('active');
    actionShareBtn.classList.remove('active');
    createFileBtnText.textContent = '파일만들기 (다운로드)';
    showToast('설정 완료: 파일만들기 클릭 시 파일로 바로 다운로드합니다.');
  });

  // 저장 크기 방식 설정 (자동 맞춤 vs 전체)
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

  // 미리보기 모달 내 전용 버튼
  previewShareBtn.addEventListener('click', () => {
    if (latestBlob && latestFileName) {
      shareSignatureFile(latestBlob, latestFileName);
    }
  });

  previewDownloadBtn.addEventListener('click', () => {
    if (latestBlob && latestFileName) {
      downloadBlob(latestBlob, latestFileName);
    }
  });

  closePreviewBtn.addEventListener('click', () => {
    previewCard.style.display = 'none';
  });

  // 펜 설정 및 가이드라인
  colorOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.color-btn');
    if (!btn) return;
    colorOptions.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.getAttribute('data-color');
  });

  strokeOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.stroke-btn');
    if (!btn) return;
    strokeOptions.querySelectorAll('.stroke-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    baseStrokeWidth = parseFloat(btn.getAttribute('data-size'));
  });

  toggleGridBtn.addEventListener('click', () => {
    const isActive = canvasWrapper.classList.toggle('grid-bg');
    toggleGridBtn.classList.toggle('active', isActive);
  });

  toggleGuidelineBtn.addEventListener('click', () => {
    const isHidden = guideline.classList.toggle('hidden');
    toggleGuidelineBtn.classList.toggle('active', !isHidden);
  });

  undoBtn.addEventListener('click', undo);
  clearBtn.addEventListener('click', clearCanvas);

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

  // 초기 버튼 텍스트 설정
  createFileBtnText.textContent = '파일만들기 (카톡 공유)';
});
