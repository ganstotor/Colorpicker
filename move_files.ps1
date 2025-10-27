# Скрипт для перемещения Java/Kotlin файлов в новую структуру пакетов

Write-Host "Перемещение файлов из com.ganstotor.MyExpoApp в com.colorpicker.app..." -ForegroundColor Yellow

# Создать новую структуру директорий
$newDir = "android\app\src\main\java\com\colorpicker\app"
New-Item -ItemType Directory -Force -Path $newDir | Out-Null

# Переместить все файлы
$oldDir = "android\app\src\main\java\com\ganstotor\MyExpoApp"
if (Test-Path $oldDir) {
    $files = Get-ChildItem -Path $oldDir -File
    foreach ($file in $files) {
        $destination = Join-Path $newDir $file.Name
        Move-Item -Path $file.FullName -Destination $destination -Force
        Write-Host "Перемещен: $($file.Name)" -ForegroundColor Green
    }
    
    # Удалить старую директорию
    if ((Get-ChildItem -Path $oldDir -Recurse | Measure-Object).Count -eq 0) {
        Remove-Item -Path $oldDir -Recurse -Force
        Write-Host "Удалена старая директория: $oldDir" -ForegroundColor Green
    }
    
    # Если ganstotor пуста, удалить
    $ganstotorDir = "android\app\src\main\java\com\ganstotor"
    if (Test-Path $ganstotorDir) {
        $items = Get-ChildItem -Path $ganstotorDir -Recurse -Force
        if ($items.Count -eq 0) {
            Remove-Item -Path $ganstotorDir -Recurse -Force
        }
    }
    
    Write-Host "`nГотово! Файлы успешно перемещены." -ForegroundColor Green
    Write-Host "Теперь выполните: cd android && .\gradlew clean" -ForegroundColor Cyan
} else {
    Write-Host "Старая директория не найдена. Возможно, файлы уже перемещены." -ForegroundColor Yellow
}

