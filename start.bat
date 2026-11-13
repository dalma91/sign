@echo off
chcp 65001 > nul
echo ==================================================
echo   전자 서명 패드 (500x200 투명 PNG 생성기)
echo ==================================================
echo.
echo [1] 기본 브라우저에서 바로 열기
echo [2] 로컬 웹 서버 시작 (태블릿 Wi-Fi 접속용, Python 필요)
echo [0] 종료
echo.
set /p choice="선택하세요 (1/2/0): "

if "%choice%"=="1" (
    echo 브라우저에서 실행 중...
    start "" "%~dp0index.html"
    exit
) else if "%choice%"=="2" (
    echo.
    echo 로컬 서버를 8080 포트로 시작합니다...
    echo 태블릿 브라우저에서 아래 IP 주소로 접속하세요:
    ipconfig | findstr /i "IPv4"
    echo http://[위_IPv4_주소]:8080
    echo.
    echo 종료하려면 Ctrl+C를 누르세요.
    python -m http.server 8080
) else (
    exit
)
