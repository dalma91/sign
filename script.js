/**
 * 태블릿 친화적 전자 서명 패드 (500x200px 투명 PNG 생성기)
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
  
  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');
  const createFileBtn = document.getElementById('createFileBtn');
  
  const previewCard = document.getElementById('previewCard');
  const previewImage = document.getElementById('previewImage');
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
  let hasDrawn = false;

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
  // Pointer Events를 사용하여 마우스, 터치, Apple Pencil, S-Pen 통합 지원
  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);

  // 제스처 및 스크롤 방지
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
    // 마우스 좌클릭 또는 터치/펜 시작
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // 일부 브라우저 예외 무시
    }

    isDrawing = true;
    canvasWrapper.classList.add('active-drawing');
    
    // 안내 팁 숨기기
    placeholderTip.classList.add('hidden');

    const point = getCanvasCoordinates(e);
    points = [point];

    // 단일 점(점 찍기)을 위한 즉각 렌더링
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

    // 남은 포인트 마무리 연결
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
    hasDrawn = true;
    saveState();
  }

  // 펜 압력 감지 및 굵기 계산
  function computeLineWidth(point) {
    if (point.pointerType === 'pen' && point.pressure > 0) {
      // 태블릿 펜슬의 경우 압력(0.0 ~ 1.0)을 반영하여 만년필/붓펜 느낌 구현
      return baseStrokeWidth * (0.4 + point.pressure * 1.2);
    }
    return baseStrokeWidth;
  }

  // 단일 점 찍기
  function drawDot(point) {
    ctx.beginPath();
    const radius = computeLineWidth(point) / 2;
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2, false);
    ctx.fillStyle = currentColor;
    ctx.fill();
  }

  // 2차 베지어 곡선(Quadratic Curve)을 이용한 매끄러운 선 그리기
  function drawSmoothLine() {
    const len = points.length;
    const p0 = points[len - 3];
    const p1 = points[len - 2];
    const p2 = points[len - 1];

    // 중간점 계산
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
     히스토리 및 상태 관리 (Undo / Clear)
  =============================== */
  function saveState() {
    // 최대 20단계 실행 취소 보관
    if (historyStack.length >= 20) {
      historyStack.shift();
    }
    const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    historyStack.push(imageData);

    updateButtonStates();
  }

  function updateButtonStates() {
    undoBtn.disabled = historyStack.length <= 1;
    
    // 서명 여부에 따른 힌트 문구 제어
    const isBlank = isCanvasBlank();
    if (isBlank && !isDrawing) {
      placeholderTip.classList.remove('hidden');
    } else {
      placeholderTip.classList.add('hidden');
    }
  }

  function undo() {
    if (historyStack.length <= 1) return;

    historyStack.pop(); // 현재 상태 제거
    const previousState = historyStack[historyStack.length - 1];
    ctx.putImageData(previousState, 0, 0);

    updateButtonStates();
    showToast('마지막 획을 취소했습니다.');
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    historyStack = [];
    saveState();
    showToast('서명란을 초기화했습니다.');
  }

  // 캔버스가 비어있는지(투명 픽셀만 있는지) 검사
  function isCanvasBlank() {
    const pixelData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
    // 알파 채널(4번째 바이트) 검사
    for (let i = 3; i < pixelData.length; i += 4) {
      if (pixelData[i] > 0) {
        return false;
      }
    }
    return true;
  }

  /* ===============================
     파일만들기: 투명 PNG 생성 및 다운로드
  =============================== */
  function createSignatureFile() {
    if (isCanvasBlank()) {
      showToast('⚠️ 서명을 먼저 입력해 주세요.');
      return;
    }

    // canvas.toBlob을 이용하여 배경이 완벽하게 투명한 500x200 PNG 생성
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast('파일 생성에 실패했습니다.');
        return;
      }

      // 현재 날짜 및 시간으로 파일명 구성
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const fileName = `signature_${CANVAS_WIDTH}x${CANVAS_HEIGHT}_${timestamp}.png`;

      // 브라우저 다운로드 트리거
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 다운로드 완료 알림
      showToast(`✅ "${fileName}" 파일이 다운로드되었습니다.`);

      // 투명도 검증 미리보기 영역 업데이트
      previewImage.src = downloadUrl;
      previewCard.style.display = 'block';

      // 메모리 정리 (지연 후)
      setTimeout(() => {
        // 미리보기 유지를 위해 즉시 해제하지 않음
      }, 5000);
    }, 'image/png');
  }

  /* ===============================
     툴바 및 옵션 이벤트
  =============================== */
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

  // 투명 격자 배경 토글 (서명 시 투명 영역 체감용)
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

  /* ===============================
     키보드 단축키 편의 지원 (PC/외장 키보드 태블릿)
  =============================== */
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
