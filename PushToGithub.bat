@echo off
echo ===================================================
echo   DAY CODE LEN GITHUB - TUTOR MANAGER
echo ===================================================
echo.
echo Dang day code len GitHub... (Neu co cua so yeu cau dang nhap hien len, vui long dang nhap bang tai khoan GitHub cua ban)
echo.

"C:\Program Files\Git\cmd\git.exe" push -u origin main --force

echo.
echo ===================================================
if %errorlevel% equ 0 (
    echo THANH CONG! Code da duoc day len GitHub.
) else (
    echo THAT BAI! Vui long kiem tra lai tai khoan dang nhap hoac ket noi mang.
)
echo ===================================================
pause
