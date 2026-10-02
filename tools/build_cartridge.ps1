param([string]$Pasmo = 'pasmo')
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    python tools/prepare_fonts.py
    if ($LASTEXITCODE) { throw 'Font validation failed' }
    python tools/prepare_cartridge.py
    if ($LASTEXITCODE) { throw 'Cartridge preparation failed' }
    wsl --exec $Pasmo --bin build/cartridge-engine.asm build/cartridge-engine.bin build/cartridge-engine.sym
    if ($LASTEXITCODE) { throw 'Engine assembly failed' }
    python tools/package_cartridge.py --equates
    if ($LASTEXITCODE) { throw 'Equates failed' }
    wsl --exec $Pasmo --bin build/cartridge-extra-fonts.asm build/cartridge-extra-fonts.bin build/cartridge-extra-fonts.sym
    if ($LASTEXITCODE) { throw 'Extra font assembly failed' }
    wsl --exec $Pasmo --bin build/cartridge-rtf.asm build/cartridge-rtf.bin build/cartridge-rtf.sym
    if ($LASTEXITCODE) { throw 'RTF bank assembly failed' }
    wsl --exec $Pasmo --bin build/cartridge-code.asm build/cartridge-code.bin build/cartridge-code.sym
    if ($LASTEXITCODE) { throw 'Code bank assembly failed' }
    wsl --exec $Pasmo --bin src/cartridge/gateway.asm build/cartridge-gateway.bin build/cartridge-gateway.sym
    if ($LASTEXITCODE) { throw 'Gateway assembly failed' }
    wsl --exec $Pasmo --bin src/cartridge/boot.asm build/cartridge-boot.bin build/cartridge-boot.sym
    if ($LASTEXITCODE) { throw 'Boot assembly failed' }
    python tools/package_cartridge.py
    if ($LASTEXITCODE) { throw 'Packaging failed' }
} finally { Pop-Location }
